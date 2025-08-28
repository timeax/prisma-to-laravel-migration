import { GeneratorOptions } from "@prisma/generator-helper";
import { Migration } from "./PrismaToLaravelMigrationGenerator.js";
import { StubConfig } from "../../utils/utils.js";
import { MigratorConfigOverride } from "types/laravel-config.js";
export interface MigratorConfig extends StubConfig, Omit<MigratorConfigOverride, 'groups' | 'stubDir'> {
}
export declare function generateLaravelSchema(options: GeneratorOptions): Promise<Migration[]>;
