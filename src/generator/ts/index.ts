// generator/ts/index.ts
import type {
   GeneratorOptions,
   GeneratorConfig,
} from "@prisma/generator-helper";
import path from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as dmf from "@prisma/internals";

import { loadSharedConfig } from "../../utils/loadSharedCfg.js";
import type {
   TypesConfigOverride,
   StubGroupConfig,
} from "types/laravel-config.js";

import { PrismaToTypesGenerator } from "./generator.js";
import type {
   TsModelDefinition,
   TsEnumDefinition,
} from "./types.js";
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
function getDefaultTsOutDir(
   generator: GeneratorConfig | undefined,
): string {
   return generator?.output?.value ?? "resources/ts/prisma";
}

/** Merge all *.prisma files in schema dir, with schema.prisma first */
async function loadMergedDatamodel(
   schemaPrismaPath: string,
): Promise<string> {
   const schemaDir = path.dirname(schemaPrismaPath);
   const entries = readdirSync(schemaDir).filter((f) =>
      f.endsWith(".prisma"),
   );

   const order = [
      // schema.prisma first
      ...entries.filter((f) => f === "schema.prisma"),
      // then the rest alphabetically
      ...entries.filter((f) => f !== "schema.prisma").sort(),
   ];

   const chunks = await Promise.all(
      order.map((f) => fs.readFile(path.join(schemaDir, f), "utf-8")),
   );

   return chunks.join("\n\n");
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

export async function generateTypesFromPrisma(
   options: GeneratorOptions,
) {
   const { generator } = options;
   const raw = (generator.config ?? {}) as Record<
      string,
      string | undefined
   >;

   const schemaPrismaPath = options.schemaPath;
   const schemaDir = path.dirname(schemaPrismaPath);
   const shared = await loadSharedConfig(schemaDir);

   // --- 1. Load stub groups if present (same pattern as modeler) ------
   let groups: StubGroupConfig[] = [];
   if (raw["groups"]) {
      const groupsModulePath = path.resolve(
         process.cwd(),
         raw["groups"],
      );
      const importedModule = await import(groupsModulePath);
      const imported =
         importedModule.default ?? importedModule;

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
      // prisma-laravel.config.ts -> ts: {}
      (shared.ts as any)?.[key] ??
      // shared root (if you keep ts props there)
      (shared as any)[key] ??
      // generator block config
      raw[key as string] ??
      // explicit fallback
      fallback;

   // --- 3. Build merged TS generator config --------------------------
   const cfg: TypesConfig = {
      // base Laravel-ish generator knobs
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
      outputDir:
         pick("outputDir") ??
         getDefaultTsOutDir(generator),

      declaration: pick("declaration", false),
      shape: pick("shape", "interface"),
      scalarMap: pick("scalarMap"),
      nullableAsOptional: pick("nullableAsOptional", false),
      readonlyArrays: pick("readonlyArrays", false),
      namePrefix: pick("namePrefix", ""),
      nameSuffix: pick("nameSuffix", ""),
      moduleName: pick("moduleName", "database/prisma"),
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

   // --- 5. Build DMMF from merged datamodel --------------------------
   const datamodel = await loadMergedDatamodel(schemaPrismaPath);
   const sdk = (dmf as any).default ?? dmf;
   const { dmmf } = await sdk.getDMMF({ datamodel });

   // --- 6. Generate TS definitions (pure data) -----------------------
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

   // --- 7. Create TS printer (handles stubs + moduleName) ------------
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

   const ext = cfg.declaration ? ".d.ts" : ".ts";

   // --- 8. Emit enums (single file, no TS stubs) ---------------------
   if (enums.length) {
      const enumsCode = printer.printEnums(enums);
      if (enumsCode.trim()) {
         const enumsPath = path.join(tsOutDir, `enums${ext}`);
         await writeWithMerge(
            enumsPath,
            enumsCode,
            "ts",
            cfg.overwriteExisting,
         );
      }
   }

   // --- 9. Emit models -----------------------------------------------
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

   // 9a) Main combined file: all non-stubbed models
   if (mainFile.trim()) {
      const mainPath = path.join(tsOutDir, `index${ext}`);
      await writeWithMerge(
         mainPath,
         mainFile,
         "ts",
         cfg.overwriteExisting,
      );
   }

   // 9b) Per-model stubbed outputs
   specialOutputs.forEach(async (code, idx) => {
      const model = specialModels[idx];
      if (!model) return;

      const decoratedName = `${cfg.namePrefix ?? ""
         }${model.name}${cfg.nameSuffix ?? ""}`;
      const filePath = path.join(
         tsOutDir,
         `${decoratedName}${ext}`,
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