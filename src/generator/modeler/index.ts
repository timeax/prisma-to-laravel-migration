import { GeneratorConfig, GeneratorOptions } from "@prisma/generator-helper";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { addToConfig, getStubPath, StubConfig } from "@/utils/utils";
import { StubModelPrinter } from "@/printer/models";
import { PrismaToLaravelModelGenerator } from "./generator.js";
import { ModelDefinition, EnumDefinition } from "./types";
import { writeWithMerge } from "@/diff-writer/writer";
import { ModelConfigOverride, StubGroupConfig } from "types/laravel-config.js";
import { loadSharedConfig } from "@/utils/loadSharedCfg";
import { buildModelContent } from "@/utils/build";

export interface ModelConfig extends StubConfig, Omit<ModelConfigOverride, 'groups' | 'stubDir'> { }

export async function generateLaravelModels(options: GeneratorOptions) {
   const { dmmf, generator } = options;
   // 0) Pull config values
   // Inside generateLaravelModels()
   /** ---------------- existing logic --------------------- */
   const raw = (generator.config ?? {}) as Record<string, string | undefined>;

   /* load shared cfg (auto-discovers prisma/laravel.config.js) */
   const schemaDir = path.dirname(options.schemaPath);          // << from GeneratorOptions
   const shared = await loadSharedConfig(schemaDir);

   /* merge stub groups from block, then shared file (shared wins) */
   let groups: StubGroupConfig[] = [];
   if (raw["groups"]) {
      const groupsModulePath = path.resolve(process.cwd(), raw["groups"]);
      const imported = (await import(groupsModulePath)).default ?? (await import(groupsModulePath));
      if (!Array.isArray(imported)) {
         throw new Error(
            `Custom groups module must export an array, but got ${typeof imported}`
         );
      }
      groups = imported;
   }

   /* helper to prefer shared → per-gen → block */
   const pick = <K extends keyof ModelConfigOverride>(
      key: K,
      fallback?: any
   ): any | undefined =>
      (shared.modeler as any)?.[key] ??
      (shared as any)[key] ??
      raw[key as string] ??
      fallback;

   /* -------- merged config -------- */
   const cfg: ModelConfig = {
      overwriteExisting: pick("overwriteExisting", true),
      outputDir: pick("outputDir"),
      outputEnumDir: pick("outputEnumDir"),
      prettier: pick("prettier", false),
      awobaz: pick("awobaz", false),
      stubDir: pick("stubDir")!,          // shared stubDir wins
      groups,
      /* NEW global prefix/suffix made available downstream */
      /* NEW global table decoration */
      tablePrefix: pick('tablePrefix', ''),
      tableSuffix: pick('tableSuffix', ''),
      enumStubPath: pick('enumStubPath'),
      modelStubPath: pick('modelStubPath'),
      noEmit: pick('noEmit', false),
      allowedPivotExtraFields: pick('allowedPivotExtraFields', []),
      namespace: pick("namespace", "App")
   };

   addToConfig('model', cfg);

   // 1) Determine and ensure output directories
   const modelsDir = cfg.outputDir
      ? path.resolve(process.cwd(), cfg.outputDir)
      : path.resolve(process.cwd(), getOutDir(generator));
   if (!existsSync(modelsDir)) {
      mkdirSync(modelsDir, { recursive: true });
   }

   const enumsDir = cfg.outputEnumDir
      ? path.resolve(process.cwd(), cfg.outputEnumDir)
      : path.resolve(process.cwd(), 'app/Enums');

   if (!existsSync(enumsDir)) {
      mkdirSync(enumsDir, { recursive: true });
   }


   // 2) Load stubs (allow overrides)
   const mStub = (shared.output?.models ?? cfg.modelStubPath);
   const modelStub = mStub
      ? path.resolve(process.cwd(), mStub)
      : getStubPath("model.stub");

   const eStub = (shared.output?.enums ?? cfg.enumStubPath);
   const enumStub = eStub
      ? path.resolve(process.cwd(), eStub)
      : getStubPath("enum.stub");


   const printer = new StubModelPrinter(cfg, modelStub, enumStub);

   // 3) Generate definitions
   const schemaGen = new PrismaToLaravelModelGenerator(dmmf);
   const { models, enums }: {
      models: ModelDefinition[];
      enums: EnumDefinition[];
   } = schemaGen.generateAll();


   // 4) Write enum files
   for (const enumDef of enums) {
      const enumPhp = printer.printEnum(enumDef);
      const enumFile = path.join(enumsDir, `${enumDef.name}.php`);
      !cfg.noEmit &&
         writeWithMerge(
            enumFile,
            enumPhp,
            'model',
            cfg.overwriteExisting ?? true
         );
   }

   // 5) Write model files
   for (const model of models) {
      if (model.isIgnored) continue;
      let imports = model.properties.filter(item => item.enumRef).map(item => `use ${cfg.namespace ?? 'App'}\\Enums\\${item.enumRef};`);
      //----
      if (Array.isArray(model.imports)) model.imports.push(...imports);
      else model.imports = imports;
      //---
      model.imports = Array.from(new Set(model.imports));
      //----
      const content = { toString() { return buildModelContent(model); } };
      const modelPhp = printer.printModel(model, enums, content as any);
      const modelFile = path.join(modelsDir, `${model.className}.php`);

      !cfg.noEmit &&
         writeWithMerge(
            modelFile,
            modelPhp,
            'model',
            cfg.overwriteExisting ?? true
         );
   }

   return { models, enums };
}

function getOutDir(generator: GeneratorConfig): string {
   return generator.output?.value ?? "app/Models";
}