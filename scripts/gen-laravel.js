#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as dmf from "@prisma/internals";

// PHP-side generators
import * as gg from "../dist/generator/migrator/index.js";
import * as modeler from "../dist/generator/modeler/index.js";
import { buildModelContent } from "../dist/utils/build.js";

// TS-side generator + printer
import { PrismaToTypesGenerator } from "../dist/generator/ts/generator.js";
import { TsPrinter } from "../dist/generator/ts/printer.js";

(async () => {
   // 1) Load your Prisma schema
   const schemaPath = path.resolve(process.cwd(), "small.prisma");
   const datamodel = fs.readFileSync(schemaPath, "utf8");

   // 2) Build the DMMF + config (same as real generators)
   const sdk = dmf.default ?? dmf;
   const dmmf = await sdk.getDMMF({ datamodel });
   const prismaCfg = await sdk.getConfig({ datamodel });

   console.log("=== DMMF models ===");
   console.log(dmmf.datamodel.models.map((m) => m.name));
   console.log("=== Datasources / Generators ===");
   console.log(prismaCfg);

   // --------------------------------------------------------------------
   // 3) PHP: Generate migrations (in-memory) – same as before
   // --------------------------------------------------------------------
   await gg.generateLaravelSchema({
      dmmf,
      schemaPath,
      generator: {
         output: { value: null },
         config: {
            namespace: "App",
            prettier: true,
            tablePrefix: "scpl_",
         },
      },
   });

   // If you want to exercise StubMigrationPrinter here you still can:
   // const { StubMigrationPrinter } = await import("../dist/printer/migrations.js");
   // const migPrinter = new StubMigrationPrinter(
   //    path.resolve(process.cwd(), "stubs/migration.stub"),
   // );

   // --------------------------------------------------------------------
   // 4) PHP: Generate model definitions (in-memory) – same as before
   // --------------------------------------------------------------------
   const generateLaravelModels = modeler.generateLaravelModels;
   const { models: phpModels, enums: phpEnums } = await generateLaravelModels({
      dmmf,
      schemaPath,
      generator: {
         output: { value: null },
         config: {
            namespace: "Namespace",
            prettier: true,
            awobaz: true,
         },
      },
   });

   const phpContents = phpModels.map((m) => buildModelContent(m));

   // const { StubModelPrinter } = await import("../dist/printer/models.js");
   // const modelPrinter = new StubModelPrinter(
   //    {},
   //    path.resolve(process.cwd(), "stubs/model.stub"),
   //    path.resolve(process.cwd(), "stubs/enum.stub"),
   // );
   // console.log(
   //    "\n\n" +
   //       "=".repeat(60) +
   //       "\n\n" +
   //       modelPrinter.printAll(phpModels, phpEnums, phpContents),
   // );

   // --------------------------------------------------------------------
   // 5) TS: Generate TypeScript definitions from the same DMMF
   // --------------------------------------------------------------------
   const tsConfig = {
      // shared-ish pieces (mirror TypesConfigOverride / LaravelGeneratorConfig)
      overwriteExisting: true,
      prettier: false,
      noEmit: false,

      tablePrefix: "",
      tableSuffix: "",
      namespace: "App",

      // stubDir + groups → same shape as PHP generators
      stubDir: path.resolve(process.cwd(), "stubs"),
      groups: [],

      // TS-specific
      outputDir: "resources/ts/prisma",
      declaration: false,
      shape: "interface",
      scalarMap: undefined,
      nullableAsOptional: false,
      readonlyArrays: false,
      namePrefix: "",
      nameSuffix: "",
      moduleName: "database/prisma",

      // where enums are imported from in generated models
      enumImportFrom: "./enums",
   };

   const tsGen = new PrismaToTypesGenerator(dmmf, tsConfig);
   const { models: tsModels, enums: tsEnums } = tsGen.generateAll();

   // --------------------------------------------------------------------
   // 6) TS: Print enums + models using TsPrinter + stubs
   // --------------------------------------------------------------------
   const tsPrinter = new TsPrinter({
      stubConfig: {
         stubDir: tsConfig.stubDir,
         groups: tsConfig.groups,
      },
      moduleName: tsConfig.moduleName,
      shape: tsConfig.shape,
   });

   // Enums: single block
   const enumsCode = tsPrinter.printEnums(tsEnums);

   // Models: [ mainFile, ...perModelStubFiles ]
   const [mainModelsFile, ...perModelFiles] = tsPrinter.printModels(tsModels);

   console.log("\n\n" + "=".repeat(60));
   console.log("=== TS ENUMS ===\n");
   console.log(enumsCode);

   console.log("\n" + "=".repeat(60));
   console.log("=== TS MODELS (MAIN FILE) ===\n");
   console.log(mainModelsFile);

   if (perModelFiles.length) {
      console.log("\n" + "=".repeat(60));
      console.log("=== TS MODELS (PER-MODEL STUB FILES) ===\n");
      perModelFiles.forEach((code, idx) => {
         console.log(`\n--- Fragment #${idx + 1} ---\n`);
         console.log(code);
      });
   }

   // Later we can swap the console.log sections with writeWithMerge(..., "ts", ...)
   // to actually emit files using the diff writer + TS prettier config.
})().catch((e) => {
   console.error(e);
   process.exit(1);
});
