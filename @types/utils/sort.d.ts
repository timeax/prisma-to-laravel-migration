import { Migration } from "../generator/migrator/PrismaToLaravelMigrationGenerator";
/**
 * Reorders migrations so that any table with foreign‐key dependencies
 * is always migrated *after* the tables it references.
 *
 * @param migrations  Array of Migration objects (with tableName & definitions[])
 * @returns           New array sorted in dependency order
 * @throws            If there’s a cycle in the relationships
 */
export declare function sortMigrations(migrations: Migration[]): Migration[];
