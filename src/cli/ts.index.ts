#!/usr/bin/env node
import { generateTypesFromPrisma } from "../generator/ts/index.js";
import helperPkg from '@prisma/generator-helper';
const { generatorHandler } = helperPkg;

generatorHandler({
   onGenerate: generateTypesFromPrisma,
   onManifest: () => ({
      defaultOutput: './resources/js/types',
      prettyName: 'Laravel Schema',
   }),
})
