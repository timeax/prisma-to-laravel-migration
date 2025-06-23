#!/usr/bin/env node
import { generateLaravelModels } from "../generator/modeler/index.js";
import helperPkg from '@prisma/generator-helper';
const { generatorHandler } = helperPkg;

generatorHandler({
   onGenerate: generateLaravelModels,
   onManifest: () => ({
      defaultOutput: './database/migrations',
      prettyName: 'Laravel Schema',
   }),
})
