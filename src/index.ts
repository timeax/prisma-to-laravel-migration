// src/index.ts

export { buildModelContent } from '@/utils/build';

// Types
export type * from './types/column-definition-types';
export type * from './types/laravel-config';

// Rule interface
export { Rule } from './generator/migrator/rules';

// Core generators
export { generateLaravelSchema } from './generator/migrator/index.js';
export { generateLaravelModels } from './generator/modeler/index.js';
export { generateTypesFromPrisma } from './generator/ts/index.js'

export { PrismaToLaravelModelGenerator } from '@/generator/modeler/generator'
export { PrismaToLaravelMigrationGenerator, type Migration } from '@/generator/migrator/PrismaToLaravelMigrationGenerator'

export { TsPrinter } from '@/generator/ts/printer';
export { PrismaToTypesGenerator } from '@/generator/ts/generator';



// Utilities
export { sortMigrations } from './utils/sort.js';