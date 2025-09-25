import { Migration } from "../generator/migrator/PrismaToLaravelMigrationGenerator";
/**
 * Topologically sort migrations so FK parents come before children.
 * - Skips migrations marked local for migrator.
 * - Skips FK edges from defs marked local for migrator.
 * - Considers only owning-side FKs.
 * - Dedupes edges; throws on cycles.
 */
export declare function sortMigrations(input: Migration[]): Migration[];
