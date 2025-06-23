import { GeneratorConfig, GeneratorOptions } from "@prisma/generator-helper";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { PrismaToLaravelMigrationGenerator, Migration } from "./PrismaToLaravelMigrationGenerator.js";
import { StubMigrationPrinter } from "../../printer/migrations.js";
import { resolveStub, StubConfig, StubGroupConfig, writeWithMarkers } from "../../generator/utils.js";
import { fileURLToPath } from "url";
import { sortMigrations } from "./sort.js";

interface MigratorConfig extends StubConfig {
   stubPath?: string;
   overwriteExisting?: boolean;
   rules?: string;
   outputDir?: string;
   /** custom markers around the generated section */
   startMarker?: string;
   endMarker?: string;
}

export async function generateLaravelSchema(options: GeneratorOptions): Promise<Migration[]> {
   const { dmmf, generator } = options;

   // 0) Pull config values (all come in as strings)
   // Inside generateLaravelSchema()
   const raw = (generator.config ?? {}) as Record<string, string | undefined>;

   // 0.a) Load groups from a JS file if provided
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

   const cfg: MigratorConfig = {
      stubPath: raw["stubPath"],
      overwriteExisting: raw["overwriteExisting"] === "true",
      rules: raw["rules"],
      outputDir: raw["outputDir"],
      startMarker: raw["startMarker"] ?? "// <prisma-laravel:start>",
      endMarker: raw["endMarker"] ?? "// <prisma-laravel:end>",
      stubDir: raw["stubDir"]!,
      groups,
   };

   // 1) Determine and ensure output directory exists
   const baseOut = cfg.outputDir
      ? path.resolve(process.cwd(), cfg.outputDir)
      : getOutDir(generator);
   if (!existsSync(baseOut)) {
      mkdirSync(baseOut, { recursive: true });
   }

   // 2) Instantiate schema generator (with optional custom rules)
   let schemaGen: PrismaToLaravelMigrationGenerator;
   // Validate custom rules
   if (cfg.rules) {
      const rulesModule = await import(path.resolve(process.cwd(), cfg.rules));
      const customRules = rulesModule.default ?? rulesModule;

      if (
         !Array.isArray(customRules) ||
         !customRules.every(
            r =>
               r &&
               typeof r.test === 'function' &&
               typeof r.render === 'function'
         )
      ) {
         throw new Error(
            'Custom rules must export an array of objects each having a `test` and `render` method.'
         );
      }

      schemaGen = new PrismaToLaravelMigrationGenerator(dmmf, customRules);
   } else {
      schemaGen = new PrismaToLaravelMigrationGenerator(dmmf);
   }

   // 3) Generate Migration objects
   const migrations: Migration[] = sortMigrations(schemaGen.generateAll());

   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);
   // 4) Prepare the stub printer
   const fallbackStubFile = cfg.stubPath
      ? path.resolve(process.cwd(), cfg.stubPath)
      : path.resolve(__dirname, "../../../stubs/migration.stub");
   let printer = new StubMigrationPrinter(cfg, fallbackStubFile);

   // 5) Write each migration file
   migrations.forEach((mig, idx) => {
      const timestamp = formatLaravelTimestamp(new Date(), idx + 1);

      // 1) Look for an existing migration for this table
      const existingFile = readdirSync(baseOut).find(f =>
         f.endsWith(`_create_${mig.tableName}_table.php`)
      );

      // 2) Reuse it if found, otherwise generate a new timestamped name
      const fileName = existingFile
         ? existingFile
         : `${timestamp}_create_${mig.tableName}_table.php`;

      const filePath = path.join(baseOut, fileName);

      // 3) Extract full & generated parts from your printer
      const { fullContent: content, columns: generated } = printer.printMigration(mig);


      // 4) Write with markers as before
      writeWithMarkers(
         filePath,
         content,
         generated,
         cfg.startMarker!,
         cfg.endMarker!,
         cfg.overwriteExisting ?? false
      );
   });

   return migrations;
}

/**
 * Format a Date into Laravel‐style prefix: YYYY_MM_DD_HHMMSS,
 * with an index to ensure uniqueness.
 */
function formatLaravelTimestamp(date: Date, index: number): string {
   const pad = (n: number) => n.toString().padStart(2, "0");
   const Y = date.getFullYear();
   const M = pad(date.getMonth() + 1);
   const D = pad(date.getDate());
   const h = pad(date.getHours());
   const m = pad(date.getMinutes());
   const s = pad(date.getSeconds());
   const idx = index > 0 ? `_${index}` : "";
   return `${Y}_${M}_${D}_${h}${m}${s}${idx}`;
}

function getOutDir(generator: GeneratorConfig): string {
   return generator.output?.value ?? "database/migrations";
}