import { GeneratorConfig, GeneratorOptions } from "@prisma/generator-helper";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { buildModelContent, StubConfig, StubGroupConfig, writeWithMarkers } from "../utils.js";
import { StubModelPrinter } from "../../printer/models.js";
import { PrismaToLaravelModelGenerator } from "./generator.js";
import { ModelDefinition, EnumDefinition } from "./types";
import { fileURLToPath } from "url";

interface ModelConfig extends StubConfig {
   modelStubPath?: string;
   enumStubPath?: string;
   overwriteExisting?: boolean;
   outputDir?: string;
   outputEnumDir?: string;
   startMarker?: string;
   endMarker?: string;
}

export async function generateLaravelModels(options: GeneratorOptions) {
   const { dmmf, generator } = options;
   // 0) Pull config values
   // Inside generateLaravelModels()
   const raw = (generator.config ?? {}) as Record<string, string | undefined>;

   let groups: StubGroupConfig[] = [];
   if (raw["groups"]) {
      const groupsModulePath = path.resolve(process.cwd(), raw["groups"]);
      const imported = await import(groupsModulePath);
      const exported = imported.default ?? imported;
      if (!Array.isArray(exported)) {
         throw new Error(
            `Custom groups module must export an array, but got ${typeof exported}`
         );
      }
      groups = exported;
   }

   const cfg: ModelConfig = {
      modelStubPath: raw["modelStubPath"],
      enumStubPath: raw["enumStubPath"],
      overwriteExisting: raw["overwriteExisting"] === "true",
      outputDir: raw["outputDir"],
      outputEnumDir: raw["outputEnumDir"],
      startMarker: raw["startMarker"] ?? "// <prisma-laravel:start>",
      endMarker: raw["endMarker"] ?? "// <prisma-laravel:end>",
      stubDir: raw["stubDir"]!,
      groups,
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

   console.log(enumsDir, cfg, process.cwd())

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
      : path.resolve(__dirname, "../../../stubs/simple-model.stub");

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

      writeWithMarkers(
         enumFile,
         enumPhp,
         enumDef.values.map(v => `    case ${v} = '${v}';`).join('\n'),
         cfg.startMarker!,
         cfg.endMarker!,
         cfg.overwriteExisting ?? false
      );
   }

   // 5) Write model files
   for (const model of models) {
      model.imports = model.properties.filter(item => item.enumRef).map(item => 'use App\\Enums\\' + item);
      const content = buildModelContent(model);
      const modelPhp = printer.printModel(model, enums, content);
      const modelFile = path.join(modelsDir, `${model.className}.php`);

      writeWithMarkers(
         modelFile,
         modelPhp,
         content,
         cfg.startMarker!,
         cfg.endMarker!,
         cfg.overwriteExisting ?? false
      );
   }

   return { models, enums };
}

function getOutDir(generator: GeneratorConfig): string {
   return generator.output?.value ?? "app/Models";
}