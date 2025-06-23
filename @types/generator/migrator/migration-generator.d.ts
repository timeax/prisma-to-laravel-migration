import { GeneratorOptions } from "@prisma/generator-helper";
import { Migration } from "./PrismaToLaravelMigrationGenerator.js";
export declare function generateLaravelSchema(options: GeneratorOptions): Promise<Migration[]>;
