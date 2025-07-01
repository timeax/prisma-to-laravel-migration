import { GeneratorConfig, GeneratorOptions } from "@prisma/generator-helper";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { buildModelContent, StubConfig } from "../../utils/utils.js";
import { StubModelPrinter } from "../../printer/models.js";
import { PrismaToLaravelModelGenerator } from "./generator.js";
import { ModelDefinition, EnumDefinition } from "./types";
import { fileURLToPath } from "url";
import { writeWithMerge } from "../../diff-writer/writer.js";
import { LaravelGeneratorConfig, ModelConfigOverride, StubGroupConfig } from "laravel-config.js";
import { loadSharedConfig } from "../../utils/loadSharedCfg.js";

interface ModelConfig extends StubConfig, Omit<ModelConfigOverride, 'groups' | 'stubDir'> { }

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
      stubDir: pick("stubDir")!,          // shared stubDir wins
      groups,
      /* NEW global prefix/suffix made available downstream */
      tablePrefix: (shared as any).tablePrefix ?? "",
      tableSuffix: (shared as any).tableSuffix ?? "",
      enumStubPath: pick('enumStubPath'),
      modelStubPath: pick('modelStubPath'),
      noEmit: pick('noEmit', false)
   };

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


   // __dirname replacement in ESM:
   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);

   // …

   // 2) Load stubs (allow overrides)
   const modelStub = cfg.modelStubPath
      ? path.resolve(process.cwd(), cfg.modelStubPath)
      : path.resolve(__dirname, "../../../stubs/model.stub");

   const enumStub = cfg.enumStubPath
      ? path.resolve(process.cwd(), cfg.enumStubPath)
      : path.resolve(__dirname, "../../../stubs/enums.stub");


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
      !!cfg.noEmit &&
         writeWithMerge(
            enumFile,
            enumPhp,
            cfg.overwriteExisting ?? false
         );
   }

   // 5) Write model files
   for (const model of models) {
      model.imports = model.properties.filter(item => item.enumRef).map(item => `use App\\Enums\\${item.enumRef};`);
      //----
      const content = buildModelContent(model);
      const modelPhp = printer.printModel(model, enums, content);
      const modelFile = path.join(modelsDir, `${model.className}.php`);

      !!cfg.noEmit &&
         writeWithMerge(
            modelFile,
            modelPhp,
            cfg.overwriteExisting ?? false
         );
   }

   return { models, enums };
}

function getOutDir(generator: GeneratorConfig): string {
   return generator.output?.value ?? "app/Models";
}