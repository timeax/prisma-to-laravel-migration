#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dmf from '@prisma/internals';
import { generateLaravelSchema } from '../generator/migrator/index.js';
import { generateLaravelModels } from '../generator/modeler/index.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { loadConfig, runGenerators } from './generate.js';
import { sortMigrations } from 'utils/sort.js';

type StubType = 'migration' | 'model' | 'enum';

interface CustomizeOptions {
   schema: string;
   types: string[];
   names: string[];
}

const cli = new Command();

cli
   .name('prisma-laravel-cli')
   .description('Initialize and customize Prisma→Laravel generators & stubs')
   .version('0.1.0');

function generatorBlock(
   base: "migration" | "model",        // singular
   stubDirRel: string,
   extras: string[] = []
): string {
   const name = `${base}s`;              // migrations / models
   const provider = `prisma-laravel-${name}s`; // prisma-laravel-migrations
   const extra = extras.length ? "\n  " + extras.join("\n  ") : "";
   return `
generator ${name} {
  provider = "${provider}"
  stubDir  = "${stubDirRel}"${extra}
}
`;
}


//
// init
//
cli
   .command("init")
   .description("Inject generators into schema.prisma and scaffold stubs/")
   .option(
      "-s, --schema <path>",
      "Prisma schema file",
      "prisma/schema.prisma"
   )
   .action(async (opts) => {
      /* 1. Paths ------------------------------------------------------ */
      const schemaPath = path.resolve(process.cwd(), opts.schema);
      const schemaDir = path.dirname(schemaPath);             // prisma/
      const userStubs = path.join(schemaDir, "stubs");        // prisma/stubs
      const stubDirRel = "./" + path.relative(process.cwd(), userStubs).replace(/\\/g, "/"); // "./stubs"

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const pkgStubs = path.resolve(__dirname, "../../stubs");    // bundled stubs

      /* 2. Load schema.prisma ---------------------------------------- */
      let schema = await fs.readFile(schemaPath, "utf-8");

      const hasGen = (base: "migration" | "model") =>
         new RegExp(`generator\\s+${base}s\\s*\\{`).test(schema);

      /* 3. Inject generator blocks if missing ------------------------ */
      if (!hasGen("migration")) {
         schema += generatorBlock("migration", stubDirRel, [
            'outputDir = "database/migrations"',
         ]);
         console.log("➡️  Added migrations generator");
      }

      if (!hasGen("model")) {
         schema += generatorBlock("model", stubDirRel, [
            'outputDir     = "app/Models"',
            'outputEnumDir = "app/Enums"',
         ]);
         console.log("➡️  Added models generator");
      }

      await fs.writeFile(schemaPath, schema, "utf-8");
      console.log(`✅ Updated ${schemaPath}`);

      /* 4. Copy default stub files ---------------------------------- */
      const stubTypes: StubType[] = ["migration", "model", "enum"];

      for (const type of stubTypes) {
         const targetDir = path.join(userStubs, type);
         await fs.mkdir(targetDir, { recursive: true });

         /* index.stub */
         const src = path.join(pkgStubs, `${type}.stub`);
         const dst = path.join(targetDir, "index.stub");
         try {
            await fs.access(dst);
         } catch {
            await fs.copyFile(src, dst);
            console.log(`➡️  Copied ${type}.stub → stubs/${type}/index.stub`);
         }
      }

      /* 5. Create laravel.config.js if absent ------------------------ */
      const cfgPath = path.join(schemaDir, "prisma-laravel.config.js");
      try {
         await fs.access(cfgPath);
      } catch {
         const cfgTemplate = `
// prisma/prisma-laravel.config.js
module.exports = {
  tablePrefix: "",        // e.g. "tx_"
  tableSuffix: "",        // e.g. "_arch"
  stubDir:     "${stubDirRel}",
  // migrate: { noEmit: false },
  // modeler: { noEmit: false }
};
`;
         await fs.writeFile(cfgPath, cfgTemplate.trimStart(), "utf-8");
         console.log("➡️  Created laravel.config.js");
      }

      console.log("🎉 Initialization complete!");
   });

//
// customize
//
cli
   .command('customize')
   .alias('c')
   .description('Scaffold per-table stub files from index.stub')
   .option('-s, --schema <path>', 'Prisma schema file', 'prisma/schema.prisma')
   .option(
      '-t, --types <list>',
      'Comma-separated: migration,model,enum',
      (val: string) => val.split(',').map(s => s.trim().toLowerCase()),
      []
   )
   .option(
      '-n, --names <list>',
      'Comma-separated base names',
      (val: string) => val.split(',').map(s => s.trim()),
      []
   )
   .action(async (opts: CustomizeOptions) => {
      const want = opts.types as StubType[];
      const bases = opts.names;

      if (!want.length) throw new Error('Specify at least one type with -t');
      if (!bases.length) throw new Error('Specify at least one name with -n');

      // enums stand alone
      if (want.includes('enum') && want.length > 1) {
         throw new Error('`enum` cannot be combined with other types');
      }

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const schemaDir = path.dirname(path.resolve(process.cwd(), opts.schema));
      const stubRoot = path.join(schemaDir, 'stubs');
      const doBoth = want.includes('migration') && want.includes('model');

      function resolveStubIndex(kind: 'enum' | 'model' | 'migration'): string {
         const userPath = path.join(stubRoot, kind, 'index.stub');
         const fallbackPath = path.resolve(__dirname, "../../stubs", `${kind}.stub`);

         if (existsSync(userPath)) return userPath;
         if (existsSync(fallbackPath)) return fallbackPath;

         throw new Error(`Missing both user and fallback index.stub for kind "${kind}"`);
      }

      for (const t of want) {
         if (t === 'enum') {
            const dir = path.join(stubRoot, 'enum');
            const idx = resolveStubIndex('enum');
            await fs.mkdir(dir, { recursive: true });
            for (const name of bases) {
               const dst = path.join(dir, `${name}.stub`);
               try { await fs.access(dst); console.log(`🟡 Skip enum/${name}.stub`); }
               catch { await fs.copyFile(idx, dst); console.log(`✅ Created enum/${name}.stub`); }
            }
            continue;
         }

         for (const kind of doBoth ? ['migration', 'model'] : [t]) {
            const dir = path.join(stubRoot, kind);
            const idx = resolveStubIndex(kind as 'migration' | 'model');
            await fs.mkdir(dir, { recursive: true });
            for (const base of bases) {
               const dst = path.join(dir, `${base}.stub`);
               try { await fs.access(dst); console.log(`🟡 Skip ${kind}/${base}.stub`); }
               catch { await fs.copyFile(idx, dst); console.log(`✅ Created ${kind}/${base}.stub`); }
            }
         }
      }

      console.log('🎉 Customize complete!');
   });



//
// proxy to Prisma generate
//
cli.command("gen")
   .description("Run Prisma generate, or skip it (--skipGenerate), then run Laravel generators")
   .option("--config <path>", "Path to prisma-laravel config file")
   .option("--skipGenerate", "Only run the Laravel generators (no Prisma generate)")
   .action(async (opts: { config?: string; skipGenerate?: boolean }) => {
      const configPath = opts.config
         ? path.resolve(process.cwd(), opts.config)
         : path.resolve(process.cwd(), "prisma-laravel.config.js");

      if (!existsSync(configPath)) {
         console.error(`❌ Config file not found: ${configPath}`);
         process.exit(1);
      }

      try {
         await runGenerators(configPath, !!opts.skipGenerate);
         console.log("✅ Generation complete.");
      } catch (e: any) {
         console.error("❌ Gen failed:", e?.message ?? e);
         process.exit(1);
      }
   });

function orderKey(fname: string): string {
   // 1) numeric prefix: 001_, 0001_, 12_, etc.
   const mNum = /^(\d{1,})_/.exec(fname);
   if (mNum) {
      // pad to fixed width so lexicographic sort works
      return mNum[1].padStart(10, "0") + "_" + fname;
   }

   // 2) laravel timestamp: 2025_03_18_123456_create_...
   const mTs = /^(\d{4}_\d{2}_\d{2}_\d{6})_/.exec(fname);
   if (mTs) return mTs[1] + "_" + fname;

   // 3) fallback to fname
   return "zzz_" + fname;
}

function extractTable(fname: string): string {
   // *_create_{table}_table.php
   return (/_create_(.+?)_table\.php$/.exec(fname)?.[1]) ?? fname;
}


cli.command("list")
   .description("List generated files. Use --migrations/--models/--enums and --sorted for migration DB order (uses backup baselines).")
   .option("--config <path>", "Path to prisma-laravel config file")
   .option("--migrations", "List migrations")
   .option("--models", "List models")
   .option("--enums", "List enums")
   .option("--sorted", "For migrations: show tables in dependency order (requires backups present)")
   .action(async (opts: { config?: string; migrations?: boolean; models?: boolean; enums?: boolean; sorted?: boolean }) => {
      const configPath = opts.config
         ? path.resolve(process.cwd(), opts.config)
         : path.resolve(process.cwd(), "prisma-laravel.config.js");

      if (!existsSync(configPath)) {
         console.error(`❌ Config file not found: ${configPath}`);
         process.exit(1);
      }
      const cfgMod = await loadConfig(configPath);
      const cfg = cfgMod.default ?? cfgMod;

      const out = {
         migrations: path.resolve(process.cwd(), cfg.output?.migrations ?? "database/migrations"),
         models: path.resolve(process.cwd(), cfg.output?.models ?? "app/Models"),
         enums: path.resolve(process.cwd(), cfg.modeler?.outputEnumDir ?? cfg.output?.enums ?? "app/Enums"),
         backups: path.resolve(process.cwd(), ".prisma-laravel/backups"),
      };

      const wantAll = !opts.migrations && !opts.models && !opts.enums;

      const ls = (dir: string, pred: (f: string) => boolean = () => true) =>
         existsSync(dir) ? readdirSync(dir).filter(pred) : [];

      if (wantAll || opts.migrations) {
         const files = ls(out.migrations, f => f.endsWith(".php"));
         console.log("\n📦 Migrations:");
         files.forEach(f => console.log(" -", f));

         // inside your `list` command, replacing the old --sorted block:
         if (opts.sorted) {
            const bakDir = path.join(out.backups, path.relative(process.cwd(), out.migrations));
            const bakFiles = existsSync(bakDir) ? readdirSync(bakDir).filter(f => f.endsWith(".php")) : [];
            if (!bakFiles.length) {
               console.log("   (no backups found — cannot show sorted list)");
            } else {
               const ordered = [...bakFiles].sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
               console.log("\n   🔢 Backup order (by filename):");
               ordered.forEach((f, i) => console.log(`   ${i + 1}. ${extractTable(f)}  (${f})`));
            }
         }
      }

      if (wantAll || opts.models) {
         const files = ls(out.models, f => f.endsWith(".php"));
         console.log("\n📦 Models:");
         files.forEach(f => console.log(" -", f));
      }

      if (wantAll || opts.enums) {
         const files = ls(out.enums, f => f.endsWith(".php"));
         console.log("\n📦 Enums:");
         files.forEach(f => console.log(" -", f));
      }

      console.log("");
   });


cli.command("clean")
   .description("Delete generated files & backups, then re-run generate. Filter by type or names.")
   .option("--config <path>", "Path to prisma-laravel config file")
   .option("--types <list>", "Comma-separated: migration,model,enum", (v: string) => v.split(",").map(s => s.trim().toLowerCase()))
   .option("--names <list>", "Comma-separated base names (tables/models/enums)", (v: string) => v.split(",").map(s => s.trim()))
   .option("--skipGenerate", "Do not re-run generation after cleanup")
   .action(async (opts: { config?: string; types?: string[]; names?: string[]; skipGenerate?: boolean }) => {
      const configPath = opts.config
         ? path.resolve(process.cwd(), opts.config)
         : path.resolve(process.cwd(), "prisma-laravel.config.js");

      if (!existsSync(configPath)) {
         console.error(`❌ Config file not found: ${configPath}`);
         process.exit(1);
      }
      const cfgMod = await loadConfig(configPath);
      const cfg = cfgMod.default ?? cfgMod;

      const out = {
         migrations: path.resolve(process.cwd(), cfg.output?.migrations ?? "database/migrations"),
         models: path.resolve(process.cwd(), cfg.output?.models ?? "app/Models"),
         enums: path.resolve(process.cwd(), cfg.modeler?.outputEnumDir ?? cfg.output?.enums ?? "app/Enums"),
         backups: path.resolve(process.cwd(), ".prisma-laravel/backups"),
      };

      const want = new Set((opts.types?.length ? opts.types : ["migration", "model", "enum"]) as ("migration" | "model" | "enum")[]);
      const names = new Set((opts.names ?? []).map(s => s.toLowerCase()));

      const rm = async (p: string) => { try { await fs.unlink(p); } catch { } };
      const list = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);

      // helpers to match names
      const matchMig = (fname: string) => {
         if (!names.size) return true;
         const m = /_create_(.+?)_table\.php$/.exec(fname);
         const table = (m?.[1] ?? "").toLowerCase();
         return table && names.has(table);
      };
      const matchModel = (fname: string) => {
         if (!names.size) return true;
         const base = fname.replace(/\.php$/, "").toLowerCase();
         return names.has(base);
      };
      const matchEnum = matchModel;

      // delete generated + backups
      if (want.has("migration")) {
         const files = list(out.migrations).filter(f => f.endsWith(".php") && matchMig(f));
         for (const f of files) await rm(path.join(out.migrations, f));
         // backups under .prisma-laravel/backups/<relPath>
         const bakDir = path.join(out.backups, path.relative(process.cwd(), out.migrations));
         if (existsSync(bakDir)) {
            const bakFiles = readdirSync(bakDir).filter(f => f.endsWith(".php") && matchMig(f));
            for (const f of bakFiles) await rm(path.join(bakDir, f));
         }
         console.log(`🧹 Removed ${files.length} migrations${names.size ? " (filtered)" : ""}`);
      }

      if (want.has("model")) {
         const files = list(out.models).filter(f => f.endsWith(".php") && matchModel(f));
         for (const f of files) await rm(path.join(out.models, f));
         const bakDir = path.join(out.backups, path.relative(process.cwd(), out.models));
         if (existsSync(bakDir)) {
            const bakFiles = readdirSync(bakDir).filter(f => f.endsWith(".php") && matchModel(f));
            for (const f of bakFiles) await rm(path.join(bakDir, f));
         }
         console.log(`🧹 Removed ${files.length} models${names.size ? " (filtered)" : ""}`);
      }

      if (want.has("enum")) {
         const files = list(out.enums).filter(f => f.endsWith(".php") && matchEnum(f));
         for (const f of files) await rm(path.join(out.enums, f));
         const bakDir = path.join(out.backups, path.relative(process.cwd(), out.enums));
         if (existsSync(bakDir)) {
            const bakFiles = readdirSync(bakDir).filter(f => f.endsWith(".php") && matchEnum(f));
            for (const f of bakFiles) await rm(path.join(bakDir, f));
         }
         console.log(`🧹 Removed ${files.length} enums${names.size ? " (filtered)" : ""}`);
      }

      // re-run generators (full) unless skipped
      if (!opts.skipGenerate) {
         try {
            await runGenerators(configPath, false);
            console.log("✅ Regenerated.");
         } catch (e: any) {
            console.error("❌ Regenerate failed:", e?.message ?? e);
            process.exit(1);
         }
      }
   });

cli.parse(process.argv);