import { readdirSync, existsSync } from "fs";
import { generateLaravelSchema } from "../generator/migrator/index.js";
import { generateLaravelModels } from "../generator/modeler/index.js";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import * as dmf from "@prisma/internals";
import { loadConfig } from "../utils/config.js";

// utility: load/merge ALL *.prisma files under prisma/ (schema first, then the rest)
async function loadMergedDatamodel(schemaPrismaPath: string): Promise<string> {
   const schemaDir = path.dirname(schemaPrismaPath);
   const entries = readdirSync(schemaDir).filter(f => f.endsWith(".prisma"));
   const order = [
      ...entries.filter(f => f === "schema.prisma"),
      ...entries.filter(f => f !== "schema.prisma").sort(),
   ];
   const chunks = await Promise.all(order.map(f => fs.readFile(path.join(schemaDir, f), "utf-8")));
   return chunks.join("\n\n");
}

/** extract our generator blocks' configs right from the datamodel */
async function getLaravelGeneratorConfigs(datamodel: string) {
   const sdk = (dmf as any).default ?? dmf;
   const { generators } = await sdk.getConfig({ datamodel });

   const findCfg = (provider: string) =>
      (generators ?? []).find((g: any) => (g.provider?.value ?? "") === provider)?.config ?? {};

   const migCfg = findCfg("prisma-laravel-migrations") as Record<string, string>;
   const modCfg = findCfg("prisma-laravel-models") as Record<string, string>;

   return { migCfg, modCfg };
}

// reusable runner
export async function runGenerators(configPath: string, skipPrismaGenerate = false) {
   // Optional config file ONLY to override schemaPath
   let schemaPrismaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
   if (existsSync(configPath)) {
      const cfgMod = await loadConfig(configPath);
      const cfg = (cfgMod as any).default ?? cfgMod;
      if (cfg?.schemaPath) {
         schemaPrismaPath = path.resolve(process.cwd(), cfg.schemaPath);
      }
   }

   if (!existsSync(schemaPrismaPath)) {
      throw new Error(`Schema not found: ${schemaPrismaPath}`);
   }

   const doRun = async () => {
      // 1) merge *.prisma into one datamodel
      const datamodel = await loadMergedDatamodel(schemaPrismaPath);

      // 2) read generator *configs* from the schema itself
      const { migCfg, modCfg } = await getLaravelGeneratorConfigs(datamodel);

      // 3) build DMMF once
      const sdk = (dmf as any).default ?? dmf;
      const dmmf = await sdk.getDMMF({ datamodel });

      // 4) run Laravel migrations generator
      await generateLaravelSchema({
         dmmf,
         // pass the migrations block config directly
         // @ts-ignore
         generator: { config: migCfg },
         otherGenerators: [],
         schemaPath: schemaPrismaPath,
         datasources: [],
         datamodel,
         version: "",
      });

      // 5) run Laravel models/enums generator
      await generateLaravelModels({
         dmmf,
         // pass the models block config directly
         // @ts-ignore
         generator: { config: modCfg },
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
         prisma.on("exit", code => (code !== 0 ? reject(new Error(`prisma generate exited ${code}`)) : resolve()));
      });
      await doRun();
   }
}