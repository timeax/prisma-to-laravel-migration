import { Migration } from "./PrismaToLaravelMigrationGenerator";

/**
 * Reorders migrations so that any table with foreign‐key dependencies
 * is always migrated *after* the tables it references.
 *
 * @param migrations  Array of Migration objects (with tableName & definitions[])
 * @returns           New array sorted in dependency order
 * @throws            If there’s a cycle in the relationships
 */
export function sortMigrations(migrations: Migration[]): Migration[] {
   // 1) Build a map: tableName → Migration
   const migMap = new Map<string, Migration>(
      migrations.map(m => [m.tableName, m])
   );

   // 2) Collect “true” FKs only (skip back‐relation object fields)
   const rawDeps = new Map<string, Set<string>>();
   for (const { tableName } of migrations) {
      rawDeps.set(tableName, new Set());
   }

   for (const m of migrations) {
      for (const def of m.definitions) {
         // only consider a relationship if:
         //  - it exists (def.relationship)
         //  - this field is a scalar FK column (def.kind === 'scalar')
         //  - it's the owning side (relationFromFields non-empty)
         if (
            !def.relationship ||
            !def.relationFromFields ||
            def.relationFromFields.length === 0
         ) {
            continue;
         }

         const parent = def.relationship.on;
         if (!migMap.has(parent) || m.tableName == parent) continue; // skip external tables
         rawDeps.get(m.tableName)!.add(parent);
      }
   }

   // 3) Build adjacency (parent → dependents) and in-degree (table → count)
   const adj = new Map<string, string[]>();
   const inDegree = new Map<string, number>();

   for (const tbl of migMap.keys()) {
      adj.set(tbl, []);
      inDegree.set(tbl, 0);
   }

   for (const [child, parents] of rawDeps) {
      for (const parent of parents) {
         if (parent !== child) adj.get(parent)!.push(child);
         inDegree.set(child, inDegree.get(child)! + 1);
      }
   }

   // 4) Kahn’s algorithm: enqueue all zero in-degree tables
   const queue: string[] = [];
   for (const [tbl, deg] of inDegree) {
      if (deg === 0) queue.push(tbl);
   }

   const sorted: Migration[] = [];
   while (queue.length) {
      const tbl = queue.shift()!;
      sorted.push(migMap.get(tbl)!);

      for (const child of adj.get(tbl)!) {
         const nd = inDegree.get(child)! - 1;
         inDegree.set(child, nd);
         if (nd === 0) queue.push(child);
      }
   }

   // 5) If not all processed, there is a genuine cycle
   if (sorted.length !== migrations.length) {
      const cycle = migrations
         .map(m => m.tableName)
         .filter(t => !sorted.some(s => s.tableName === t));
      throw new Error(
         `Cycle detected in migration dependencies: ${cycle.join(' → ')}`
      );
   }

   console.log(sorted.map(item => item.tableName))
   return sorted;
}
