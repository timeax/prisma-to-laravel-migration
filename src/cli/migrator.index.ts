#!/usr/bin/env node
import { generateLaravelSchema } from "../generator/migrator/index.js";
import helperPkg from "@prisma/generator-helper";
import path from "node:path";
import { loadSharedConfig } from "../utils/loadSharedCfg.js";

const { generatorHandler } = helperPkg;

generatorHandler({
   onGenerate: generateLaravelSchema,

   async onManifest(options) {
      const cfg = (options.config ?? {}) as Record<string, string | undefined>;

      let migrationsOutput: string | undefined;

      // 1) Generator block override (schema.prisma)
      migrationsOutput = cfg.outputDir;

      // 2) Shared config (prisma/laravel.config.js)
      if (!migrationsOutput && options.sourceFilePath) {
         try {
            const schemaDir = path.dirname(options.sourceFilePath);
            const shared = await loadSharedConfig(schemaDir);

            migrationsOutput =
               shared?.migrate?.outputDir ??
               shared?.output?.migrations ??
               undefined;
         } catch {
            // ignore – we'll fall back below
         }
      }

      // 3) Final fallback
      if (!migrationsOutput) {
         migrationsOutput = "database/migrations";
      }

      return {
         defaultOutput: migrationsOutput,
         prettyName: `Laravel Migration Schema (migrations → ${migrationsOutput})`,
      };
   },
});