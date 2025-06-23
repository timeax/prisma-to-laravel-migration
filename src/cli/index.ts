#!/usr/bin/env node
import { generateLaravelSchema } from "../generator/migrator/index.js";
import helperPkg from '@prisma/generator-helper';
const { generatorHandler } = helperPkg;

generatorHandler({
   onGenerate: generateLaravelSchema,
   onManifest: () => ({
      defaultOutput: './database/migrations',
      prettyName: 'Laravel Schema',
   }),
})
