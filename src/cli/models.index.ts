#!/usr/bin/env node
import { generateLaravelModels } from "../generator/modeler/index.js";
import helperPkg from "@prisma/generator-helper";
import path from "node:path";
import { loadSharedConfig } from "../utils/loadSharedCfg.js";

const { generatorHandler } = helperPkg;

generatorHandler({
   onGenerate: generateLaravelModels,

   async onManifest(options) {
      const cfg = (options.config ?? {}) as Record<string, string | undefined>;

      // 1) Model output: generator block override
      let modelOutput = cfg.outputDir;
      let enumOutput: string | undefined;

      if (options.sourceFilePath) {
         try {
            const schemaDir = path.dirname(options.sourceFilePath);
            const shared = await loadSharedConfig(schemaDir, 'models');

            // --- model output resolution (models) ---
            if (!modelOutput) {
               modelOutput =
                  shared?.modeler?.outputDir ??
                  shared?.output?.models ??
                  undefined;
            }

            // --- enum output resolution (PHP enums) ---
            enumOutput =
               shared?.modeler?.outputEnumDir ??
               shared?.output?.enums ??
               undefined;
         } catch {
            // ignore — we'll fall back below
         }
      }

      // Final fallbacks
      if (!modelOutput) {
         modelOutput = "app/Models";
      }
      if (!enumOutput) {
         enumOutput = "app/Enums";
      }

      return {
         // Prisma can only use ONE path for the generator's output
         defaultOutput: modelOutput,
         // But we can loudly show BOTH model + enum destinations here
         prettyName: `Laravel Models & Enums (models → ${modelOutput}, enums → ${enumOutput})`,
      };
   },
});