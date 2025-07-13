import { GeneratorConfig, GeneratorOptions } from "@prisma/generator-helper";
import { existsSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { PrismaToLaravelMigrationGenerator, Migration } from "./PrismaToLaravelMigrationGenerator.js";
import { StubMigrationPrinter } from "../../printer/migrations.js";
import { StubConfig } from "../../utils/utils.js";
import { fileURLToPath } from "url";
import { sortMigrations } from "../../utils/sort.js";
import { writeWithMerge } from "../../diff-writer/writer.js";
import { loadSharedConfig } from "../../utils/loadSharedCfg.js";
import { MigratorConfigOverride, StubGroupConfig } from "types/laravel-config.js";

interface MigratorConfig extends StubConfig, Omit<MigratorConfigOverride, 'groups' | 'stubDir'> {
}

export async function generateLaravelSchema(options: GeneratorOptions): Promise<Migration[]> {
   const { dmmf, generator } = options;

   // 0) Pull config values (all come in as strings)
   // Inside generateLaravelSchema()
   const raw = (generator.config ?? {}) as Record<string, string | undefined>;

   const schemaDir = path.dirname(options.schemaPath);             // << from GeneratorOptions
   const shared = await loadSharedConfig(schemaDir);

   // 0.a) Load groups from a JS file if provided
   let groups: StubGroupConfig[] = [];
   const loadGroups = async (p: string) => {
      const abs = path.resolve(process.cwd(), p);
      const mod = (await import(abs)).default ?? (await import(abs));
      if (!Array.isArray(mod)) {
         throw new Error(
            `Custom groups module must export an array, got ${typeof mod}`
         );
      }
      return mod as StubGroupConfig[];
   };

   if (raw["groups"]) groups = await loadGroups(raw["groups"]);

   const pick = <K extends keyof MigratorConfigOverride>(
      key: K,
      fallback?: any
   ): any | undefined =>
      (shared.migrate as any)?.[key] ??
      (shared as any)[key] ??
      raw[key as string] ??
      fallback;

   /* -----------------------------------------------------------
    * 0.c)  Final merged config object
    * --------------------------------------------------------- */
   const cfg: MigratorConfig = {
      stubPath: pick("stubPath"),
      overwriteExisting: pick("overwriteExisting", true),
      rules: pick("rules"),
      outputDir: pick("outputDir"),
      stubDir: pick("stubDir")!,          // shared stubDir > block
      groups,
      /* NEW global table decoration */
      tablePrefix: pick('tablePrefix', ''),
      tableSuffix: pick('tableSuffix', ''),
      noEmit: pick('noEmit', false),
      defaultMaps: pick('defaultMaps', {})
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
      let customRules = cfg.rules;

      if (typeof cfg.rules == 'string') {
         const rulesModule = await import(path.resolve(process.cwd(), cfg.rules));
         customRules = rulesModule.default ?? rulesModule;
      }

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

      schemaGen = new PrismaToLaravelMigrationGenerator(dmmf, customRules, cfg.defaultMaps);
   } else {
      schemaGen = new PrismaToLaravelMigrationGenerator(dmmf, [], cfg.defaultMaps);
   }

   // 3) Generate Migration objects
   const migrations: Migration[] = sortMigrations(schemaGen.generateAll());

   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);
   // 4) Prepare the stub printer
   const stub = (shared.output?.migrations ?? cfg.stubPath);
   const fallbackStubFile = stub
      ? path.resolve(process.cwd(), stub)
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
      const { fullContent: content } = printer.printMigration(mig);


      // 4) Write with markers as before
      !cfg.noEmit &&
         writeWithMerge(
            filePath,
            content,
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