// top of file
import { readdirSync, existsSync } from "fs";
import { generateLaravelSchema } from '../generator/migrator/index.js';
import { generateLaravelModels } from '../generator/modeler/index.js';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from "child_process";
import * as dmf from '@prisma/internals';
import { pathToFileURL } from "url";
import { createRequire } from "module";
import { extname } from "path";

// helper once:
export async function loadConfig(configPath: string) {
   return await loadConfigUniversal(configPath);                // works for CJS or ESM
}


async function loadConfigUniversal(configPath: string) {
   const ext = extname(configPath).toLowerCase();
   const url = pathToFileURL(configPath).href;
   const req = createRequire(import.meta.url);

   if (ext === ".mjs") {
      const mod = await import(url);
      return mod.default ?? mod;
   }
   if (ext === ".cjs") {
      const mod = req(configPath);
      return (mod as any).default ?? mod;
   }

   // .js is ambiguous under "type":"module": try ESM import first, then CJS require
   try {
      const mod = await import(url);
      return (mod as any).default ?? mod;
   } catch {
      const mod = req(configPath);
      return (mod as any).default ?? mod;
   }
}

// utility: load/merge ALL *.prisma files under prisma/ (schema first, then the rest)
async function loadMergedDatamodel(schemaPrismaPath: string): Promise<string> {
   const schemaDir = path.dirname(schemaPrismaPath);
   const entries = readdirSync(schemaDir).filter(f => f.endsWith(".prisma"));
   const order = [
      ...entries.filter(f => f === "schema.prisma"),
      ...entries.filter(f => f !== "schema.prisma").sort(),
   ];
   const chunks = await Promise.all(
      order.map(f => fs.readFile(path.join(schemaDir, f), "utf-8"))
   );
   return chunks.join("\n\n");
}

// reusable runner
export async function runGenerators(configPath: string, skipPrismaGenerate = false) {
   const cfgMod = await loadConfig(configPath);
   const cfg = cfgMod.default ?? cfgMod;

   if (!cfg.generator?.config) {
      throw new Error("`generator.config` is required in your config.");
   }

   const schemaPrismaPath = cfg.schemaPath
      ? path.resolve(process.cwd(), cfg.schemaPath)
      : path.resolve(process.cwd(), "prisma/schema.prisma");

   if (!existsSync(schemaPrismaPath)) {
      throw new Error(`Schema not found: ${schemaPrismaPath}`);
   }

   const doRun = async () => {
      // 👇 merge *.prisma files in prisma/ (schema first)
      const datamodel = await loadMergedDatamodel(schemaPrismaPath);
      const sdk = (dmf as any).default ?? dmf;
      const { dmmf } = await sdk.getDMMF({ datamodel });

      // Laravel migrations
      await generateLaravelSchema({
         dmmf,
         //@ts-ignore
         generator: { config: cfg.generator.config },
         otherGenerators: [],
         schemaPath: schemaPrismaPath,
         datasources: [],
         datamodel,
         version: "",
      });

      // Laravel models/enums
      await generateLaravelModels({
         dmmf,
         //@ts-ignore
         generator: { config: cfg.generator.config },
         otherGenerators: [],
         schemaPath: schemaPrismaPath,
         datasources: [],
         datamodel,
         version: "",
      });
   };

   if (skipPrismaGenerate) {
      await doRun();
   } else {
      await new Promise<void>((resolve, reject) => {
         const prisma = spawn("npx", ["prisma", "generate"], {
            stdio: "inherit",
            shell: true,
         });
         prisma.on("exit", (code) => (code !== 0 ? reject(new Error(`prisma generate exited ${code}`)) : resolve()));
      });
      await doRun();
   }
}