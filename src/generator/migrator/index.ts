import { GeneratorConfig, GeneratorOptions } from "@prisma/generator-helper";
import { existsSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { PrismaToLaravelMigrationGenerator, Migration } from "./PrismaToLaravelMigrationGenerator.js";
import { StubMigrationPrinter } from "../../printer/migrations.js";
import { addToConfig, getStubPath, StubConfig } from "../../utils/utils.js";
import { sortMigrations } from "../../utils/sort.js";
import { writeWithMerge } from "../../diff-writer/writer.js";
import { loadSharedConfig } from "../../utils/loadSharedCfg.js";
import { MigratorConfigOverride, StubGroupConfig } from "types/laravel-config.js";

export interface MigratorConfig extends StubConfig, Omit<MigratorConfigOverride, 'groups' | 'stubDir'> {
}

export async function generateLaravelSchema(options: GeneratorOptions): Promise<Migration[]> {
   const { dmmf, generator } = options;

   // 0) Pull config values (all come in as strings)
   // Inside generateLaravelSchema()
   const raw = (generator.config ?? {}) as Record<string, string | undefined>;

   const schemaDir = path.dirname(generator.sourceFilePath ?? path.resolve(options.schemaPath));             // << from GeneratorOptions
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
      prettier: pick("prettier", false),
      outputDir: pick("outputDir"),
      stubDir: pick("stubDir")!,          // shared stubDir > block
      groups,
      /* NEW global table decoration */
      tablePrefix: pick('tablePrefix', ''),
      tableSuffix: pick('tableSuffix', ''),
      noEmit: pick('noEmit', false),
      defaultMaps: pick('defaultMaps', {}),
      allowUnsigned: pick('allowUnsigned', false),
   };

   addToConfig('migrator', cfg);
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

   // 4) Prepare the stub printer
   const stub = (shared.output?.migrations ?? cfg.stubPath);
   const fallbackStubFile = stub
      ? path.resolve(process.cwd(), stub)
      : getStubPath("migration.stub");
   let printer = new StubMigrationPrinter(cfg, fallbackStubFile);

   // 5) Write each migration file
   const active = migrations.filter(m => !m.isIgnored);
   const padWidth = String(active.length).length; // e.g. 10 -> 2, 150 -> 3

   active.forEach((mig, idx) => {
      // 2) Base timestamp with padded index (01..NN or 001..NNN, etc.)
      const now = new Date();
      let seq = idx + 1;
      let timestamp = formatLaravelTimestamp(now, seq, padWidth);

      // 3) Check for an existing file (old path before sort/repath)
      const existingFile = readdirSync(baseOut).find(f =>
         f.endsWith(`_create_${mig.name}_table.php`)
      );
      const existingPath = existingFile ? path.join(baseOut, existingFile) : undefined;

      // 4) If creating new, ensure uniqueness (re-runs within same second)
      let fileName = existingFile ?? `${timestamp}_create_${mig.name}_table.php`;
      let filePath = path.join(baseOut, fileName);
      while (!existingFile && existsSync(filePath)) {
         seq += 1;
         timestamp = formatLaravelTimestamp(now, seq, padWidth);
         fileName = `${timestamp}_create_${mig.name}_table.php`;
         filePath = path.join(baseOut, fileName);
      }

      // 5) Generate and write (merge from old path, write to new path)
      const { fullContent: content } = printer.printMigration(mig);
      if (!cfg.noEmit) {
         writeWithMerge(
            filePath,
            content,
            'migrator',
            cfg.overwriteExisting ?? true,
            existingPath // <-- pass old path here
         );
      }
   });

   return migrations;
}



function getOutDir(generator: GeneratorConfig): string {
   return generator.output?.value ?? "database/migrations";
}



/**
 * Format a Date into Laravel‐style prefix: YYYY_MM_DD_HHMMSS,
 * with an index to ensure uniqueness.
 */

function formatLaravelTimestamp(date: Date, seq: number, width: number) {
   const p2 = (n: number) => n.toString().padStart(2, '0');
   const Y = date.getFullYear();
   const M = p2(date.getMonth() + 1);
   const D = p2(date.getDate());
   const h = p2(date.getHours());
   const m = p2(date.getMinutes());
   const s = p2(date.getSeconds());
   const base = `${Y}_${M}_${D}_${h}${m}${s}`;
   const suffix = `_${String(seq).padStart(width, '0')}`;
   return base + suffix;
}
