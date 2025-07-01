#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';
import * as dmf from '@prisma/sdk';
import * as gg from '../dist/generator/migrator/index.js';
import * as modeler from '../dist/generator/modeler/index.js';
import { buildModelContent } from '../dist/generator/utils.js';

(async () => {
  // 1) Load your Prisma schema
  const schemaPath = path.resolve(process.cwd(), 'schema.prisma');
  const datamodel = fs.readFileSync(schemaPath, 'utf-8');

  // 2) Build the DMMF
  const dmmf = await dmf.default.getDMMF({ datamodel });

  // 3) Generate migrations (doesn't write files)
  const migrations = await gg.generateLaravelSchema({
    dmmf,
    schemaPath,
    generator: { output: { value: null } }
  });

  // 4) Print migrations to stdout
  const { StubMigrationPrinter } = await import('../dist/printer/migrations.js');
  const migPrinter = new StubMigrationPrinter(path.resolve(process.cwd(), 'stubs/migration.stub'));

  // sortMigrations(migrations);
  // 5) Generate model definitions
  const generateLaravelModels = modeler.generateLaravelModels;
  const { models, enums } = await generateLaravelModels({
    dmmf,
    schemaPath,
    generator: { output: { value: null } }
  })

  // 6) Print models to stdout
  const { StubModelPrinter } = await import('../dist/printer/models.js');
  const modelPrinter = new StubModelPrinter(
    {},
    path.resolve(process.cwd(), 'stubs/model.stub'),
    path.resolve(process.cwd(), 'stubs/enums.stub')
  );

  // build content for each model
  const contents = models.map(m => buildModelContent(m));

  console.log(
    '\n\n' + '='.repeat(60) + '\n\n' +
    modelPrinter.printAll(models, enums, contents)
  );
})().catch(e => {
  console.error(e);
  process.exit(1);
});