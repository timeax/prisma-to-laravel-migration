import { Migration } from "../generator/migrator/PrismaToLaravelMigrationGenerator";
/**
 * Reorders migrations so that any table with foreign‐key dependencies
 * is always migrated *after* the tables it references.
 */
export declare function sortMigrations(migrations: Migration[]): Migration[];
