#!/usr/bin/env node

import { generateTypesFromPrisma } from "../generator/ts/index.js";
import helperPkg from "@prisma/generator-helper";
import path from "node:path";
import { loadSharedConfig } from "../utils/loadSharedCfg.js";

const { generatorHandler } = helperPkg;

generatorHandler({
   onGenerate: generateTypesFromPrisma,

   async onManifest(options) {
      // 1) Block-level config from schema.prisma
      const cfg = (options.config ?? {}) as Record<string, string | undefined>;

      // Prefer generator block `outputDir` for TS types
      let defaultOutput = cfg.outputDir;

      // 2) If not set, consult shared prisma/laravel.config.js → `ts` section only
      if (!defaultOutput && options.sourceFilePath) {
         try {
            const schemaDir = path.dirname(options.sourceFilePath);
            const shared = await loadSharedConfig(schemaDir, 'typescript');

            // TS-only: shared.ts.outputDir (no cross-talk with migrations/models/enums)
            if (shared && (shared as any).ts) {
               defaultOutput = (shared as any).ts.outputDir;
            }
         } catch {
            // ignore – fall back to hardcoded default
         }
      }

      // 3) Final fallback for TS generator
      if (!defaultOutput) {
         defaultOutput = "resources/js/types";
      }

      return {
         defaultOutput,
         prettyName: "Typescript declarations",
      };
   },
});