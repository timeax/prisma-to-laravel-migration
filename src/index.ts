#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dmf from '@prisma/sdk';
import { generateLaravelSchema } from './generator/migrator/index.js';
import { generateLaravelModels } from './generator/modeler/index.js';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';

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

/**
* Build a generator block string.
*
* @param name      generator name ("migrate" / "modeler")
* @param provider  provider package name
* @param stubDir   directory path to inject (relative to schema)
* @param extras    additional lines inside the block (array, raw Prisma)
*/
function generatorBlock(
   name: string,
   provider: string,
   stubDir: string,
   extras: string[] = []
): string {
   const extraLines = extras.length ? "\n  " + extras.join("\n  ") : "";
   return `
generator ${name} {
  provider = "prisma-laravel-${provider}s"
  overwriteExisting = true
  stubDir  = "${stubDir}"${extraLines}
}
`;
}
//
// init
//
cli
   .command('init')
   .description('Inject generators into schema.prisma and scaffold stubs/')
   .option('-s, --schema <path>', 'Prisma schema file', 'prisma/schema.prisma')
   .action(async opts => {
      const schemaPath = path.resolve(process.cwd(), opts.schema);
      let schema = await fs.readFile(schemaPath, 'utf-8');

      await fs.writeFile(schemaPath, schema, 'utf-8');
      console.log(`✅ Updated ${schemaPath}`);

      const hasGen = (base: "migration" | "model") =>
         new RegExp(`generator\\s+${base}s\\s*\\{`).test(schema);

      // ③ copy your package’s built-in stubs into prisma/stubs/
      const schemaDir = path.dirname(schemaPath);
      const userStubs = path.join(schemaDir, 'stubs');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const pkgStubs = path.resolve(__dirname, '../stubs');

      for (const type of ['migration', 'model', 'enums'] as StubType[]) {
         const target = path.join(userStubs, type);
         await fs.mkdir(target, { recursive: true });
         // copy <type>.stub → <type>/index.stub
         const src = path.join(pkgStubs, `${type}.stub`);
         const dst = path.join(target, 'index.stub');

         // ① inject migrations generator
         if (type !== 'enum' && !hasGen(type)) {
            schema += generatorBlock(type, type, userStubs, type == 'model' ? ['outputEnumDir = "app/Enums', 'output = "../app/Models"'] : ['outputDir = "../database/migrations"'])
            console.log(`➡️  Added ${type}s generator`);
         }
         try {
            await fs.access(dst);
         } catch {
            await fs.copyFile(src, dst);
            console.log(`➡️  Copied ${type}.stub → stubs/${type}/index.stub`);
         }
      }

      console.log('🎉 Initialization complete!');
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

      const schemaDir = path.dirname(path.resolve(process.cwd(), opts.schema));
      const stubRoot = path.join(schemaDir, 'stubs');
      const doBoth = want.includes('migration') && want.includes('model');

      for (const t of want) {
         if (t === 'enum') {
            const dir = path.join(stubRoot, 'enum');
            const idx = path.join(dir, 'index.stub');
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
            const idx = path.join(dir, 'index.stub');
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

cli
   .command('gen')
   .description('Run Prisma generate, or skip it (--skipGenerate), then run Laravel generators')
   .option('--config <path>', 'Path to prisma-laravel config file')
   .option('--skipGenerate', 'Only run the Laravel generators (no Prisma generate)')
   .action(async (opts: { config?: string; skipGenerate?: boolean }) => {
      const configPath = opts.config
         ? path.resolve(process.cwd(), opts.config)
         : path.resolve(process.cwd(), 'prisma-laravel.config.js');

      if (!existsSync(configPath)) {
         console.error(`❌ Config file not found: ${configPath}`);
         process.exit(1);
      }

      const cfgMod = await import(configPath);
      const cfg = cfgMod.default ?? cfgMod;

      if (!cfg.generator?.config) {
         console.error('❌ `generator.config` is required in your config.');
         process.exit(1);
      }

      const schemaPrismaPath = cfg.schemaPath
         ? path.resolve(process.cwd(), cfg.schemaPath)
         : path.resolve(process.cwd(), 'prisma/schema.prisma');

      if (!existsSync(schemaPrismaPath)) {
         console.error(`❌ Schema not found: ${schemaPrismaPath}`);
         process.exit(1);
      }

      const run = async () => {
         const datamodel = readFileSync(schemaPrismaPath, 'utf-8');
         const sdk = (dmf as any).default ?? dmf;
         const { dmmf } = await sdk.getDMMF({ datamodel });

         await generateLaravelSchema({
            dmmf,
            //@ts-ignore
            generator: { config: cfg.generator.config },
            otherGenerators: [],
            schemaPath: schemaPrismaPath,
            datasources: [],
            datamodel,
            version: '',
         });

         await generateLaravelModels({
            dmmf,
            //@ts-ignore
            generator: { config: cfg.generator.config },
            otherGenerators: [],
            schemaPath: schemaPrismaPath,
            datasources: [],
            datamodel,
            version: '',
         });
      };

      if (opts.skipGenerate) {
         await run();
      } else {
         const prisma = spawn('npx', ['prisma', 'generate'], {
            stdio: 'inherit',
            shell: true,
         });

         prisma.on('exit', (code) => {
            if (code !== 0) process.exit(code);
            run().catch(e => {
               console.error('❌ Gen failed:', e.message ?? e);
               process.exit(1);
            });
         });
      }
   });


cli.parse(process.argv);