// generator/ts/index.ts
import type {
   GeneratorOptions,
   GeneratorConfig,
} from "@prisma/generator-helper";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";

import { loadSharedConfig } from "../../utils/loadSharedCfg.js";
import type {
   TypesConfigOverride,
   StubGroupConfig,
} from "types/laravel-config.js";

import { PrismaToTypesGenerator } from "./generator.js";
import type { TsModelDefinition, TsEnumDefinition } from "./types.js";
import { TsPrinter } from "./printer.js";
import { writeWithMerge } from "../../diff-writer/writer.js";
import { resolveStub } from "../../utils/utils.js";

/**
 * TS generator config:
 * - everything from TypesConfigOverride, except we own `stubDir` + `groups`
 */
export interface TypesConfig
   extends Omit<TypesConfigOverride, "groups" | "stubDir"> {
   stubDir: string;
   groups: StubGroupConfig[];
}

/** default TS output folder if not overridden */
function getDefaultTsOutDir(generator: GeneratorConfig | undefined): string {
   return generator?.output?.value ?? "resources/ts/prisma";
}

/**
 * Helper: does this model have a model-specific TS stub?
 *
 * Mirrors TsPrinter.hasModelSpecificStub:
 *  - use resolveStub(stubCfg, "ts", key)
 *  - treat index.stub as module-level, not model-specific
 */
function hasModelSpecificTsStub(
   model: TsModelDefinition,
   cfg: TypesConfig,
): boolean {
   if (!cfg.stubDir) return false;

   const key =
      (model as any).tableName && typeof (model as any).tableName === "string"
         ? (model as any).tableName
         : model.name;

   const stubConfig = {
      stubDir: cfg.stubDir,
      groups: cfg.groups,
      tablePrefix: cfg.tablePrefix,
      tableSuffix: cfg.tableSuffix,
      namespace: cfg.namespace,
   };

   const stubPath = resolveStub(stubConfig as any, "ts", key);
   if (!stubPath) return false;

   return path.basename(stubPath) !== "index.stub";
}

export async function generateTypesFromPrisma(options: GeneratorOptions) {
   const { dmmf, generator } = options;

   // 0) Pull config values from generator block
   const raw = (generator.config ?? {}) as Record<string, string | undefined>;

   // Load shared config (auto-discovers prisma/laravel.config.js from schema dir)
   const schemaDir = path.dirname(options.schemaPath);
   const shared = await loadSharedConfig(schemaDir);

   // --- 1. Load stub groups if present (same pattern as modeler) ------
   let groups: StubGroupConfig[] = [];
   if (raw["groups"]) {
      const groupsModulePath = path.resolve(process.cwd(), raw["groups"]);
      const importedModule = await import(groupsModulePath);
      const imported = importedModule.default ?? importedModule;

      if (!Array.isArray(imported)) {
         throw new Error(
            `Custom groups module must export an array, but got ${typeof imported}`,
         );
      }
      groups = imported;
   }

   // --- 2. Helper to pick config values in precedence order ----------
   const pick = <K extends keyof TypesConfigOverride>(
      key: K,
      fallback?: any,
   ): any | undefined =>
      // shared.ts section (if present)
      (shared.ts as any)?.[key] ??
      // shared root (if you keep ts props there)
      (shared as any)[key] ??
      // generator block config
      raw[key as string] ??
      // explicit fallback
      fallback;

   // --- 3. Build merged TS generator config --------------------------
   const cfg: TypesConfig = {
      // Laravel-ish generator knobs
      overwriteExisting: pick("overwriteExisting", true),
      prettier: pick("prettier", false),
      noEmit: pick("noEmit", false),

      tablePrefix: pick("tablePrefix", ""),
      tableSuffix: pick("tableSuffix", ""),
      namespace: pick("namespace", "App"),

      // stubDir & groups for TS (same structure as PHP generators)
      stubDir:
         pick("stubDir") ??
         shared.stubDir ??
         path.join(schemaDir, "stubs"),
      groups,

      // TS-specific
      outputDir: pick("outputDir") ?? getDefaultTsOutDir(generator),

      // enums-only knobs
      declaration: pick("declaration", false),
      noEmitEnums: pick("noEmitEnums", false),

      shape: pick("shape", "interface"),
      scalarMap: pick("scalarMap"),
      nullableAsOptional: pick("nullableAsOptional", false),
      readonlyArrays: pick("readonlyArrays", false),
      namePrefix: pick("namePrefix", ""),
      nameSuffix: pick("nameSuffix", ""),
      moduleName: pick("moduleName", "database/prisma"),
      modelsFileName: pick("modelsFileName", "index"),
      enumsFileName: pick("enumsFileName", "enums"),
   };

   // --- 4. Ensure TS output directory exists -------------------------
   const tsOutDir = path.resolve(process.cwd(), cfg.outputDir!);
   if (!existsSync(tsOutDir)) {
      mkdirSync(tsOutDir, { recursive: true });
   }

   // Tell diff-writer how to pretty-print TS (if enabled)
   (global as any)._config = (global as any)._config || {};
   (global as any)._config.ts = {
      prettier: !!cfg.prettier,
   };

   // --- 5. Use DMMF from GeneratorOptions (no merging bullshit) ------
   const tsGen = new PrismaToTypesGenerator(dmmf, cfg as any);
   const {
      models,
      enums,
   }: {
      models: TsModelDefinition[];
      enums: TsEnumDefinition[];
   } = tsGen.generateAll();

   if (cfg.noEmit) {
      // useful for tests or "dry" runs
      return { models, enums, config: cfg };
   }

   // --- 6. Create TS printer (handles stubs + moduleName) ------------
   const stubConfig = {
      stubDir: cfg.stubDir,
      groups: cfg.groups,
      tablePrefix: cfg.tablePrefix,
      tableSuffix: cfg.tableSuffix,
      namespace: cfg.namespace,
   };

   const printer = new TsPrinter({
      stubConfig,
      moduleName: cfg.moduleName,
      shape: cfg.shape,
   });

   // Extensions:
   // - models are ALWAYS .d.ts
   // - enums honour cfg.declaration
   const modelExt = ".d.ts";
   const enumExt = cfg.declaration ? ".d.ts" : ".ts";

   // --- 7. Emit enums (single file, no TS stubs) ---------------------
   if (!cfg.noEmitEnums && enums.length) {
      const enumsCode = printer.printEnums(enums);
      if (enumsCode.trim()) {
         const enumsBase = cfg.enumsFileName || "enums";
         const enumsPath = path.join(tsOutDir, `${enumsBase}${enumExt}`);
         await writeWithMerge(
            enumsPath,
            enumsCode,
            "ts",
            cfg.overwriteExisting,
         );
      }
   }
   // --- 8. Emit models -----------------------------------------------
   //
   // TsPrinter.printModels(models) returns:
   //   [0] => main module file (all non-stubbed models, plus module-level stub)
   //   [1..] => one output per model that has a dedicated TS stub
   //
   // We map those [1..] outputs to the corresponding models (in order)
   // whose stub resolves to a non-index TS stub, and emit them as
   // separate files using the decorated model name.
   const modelOutputs = printer.printModels(models);
   const [mainFile, ...specialOutputs] = modelOutputs;

   // Determine which models are "special" (have per-model TS stub)
   const specialModels = models.filter((m) =>
      hasModelSpecificTsStub(m, cfg),
   );

   if (specialOutputs.length !== specialModels.length) {
      // Not fatal, but worth logging in case of mismatch.
      console.warn(
         `[ts-generator] Mismatch between stubbed model count (${specialModels.length}) and special outputs (${specialOutputs.length}).`,
      );
   }

   // 8a) Main combined file: all non-stubbed models
   if (mainFile.trim()) {
      const mainPath = path.join(
         tsOutDir,
         `${cfg.modelsFileName ?? "index"}${modelExt}`,
      );
      await writeWithMerge(
         mainPath,
         mainFile,
         "ts",
         cfg.overwriteExisting,
      );
   }

   // 8b) Per-model stubbed outputs (always .d.ts)
   specialOutputs.forEach(async (code, idx) => {
      const model = specialModels[idx];
      if (!model) return;

      const decoratedName = `${cfg.namePrefix ?? ""}${model.name}${cfg.nameSuffix ?? ""
         }`;
      const filePath = path.join(
         tsOutDir,
         `${decoratedName}${modelExt}`,
      );

      await writeWithMerge(
         filePath,
         code,
         "ts",
         cfg.overwriteExisting,
      );
   });

   return { models, enums, config: cfg };
}