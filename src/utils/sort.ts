import { Migration } from "../generator/migrator/PrismaToLaravelMigrationGenerator";

enum GenTarget { None = 0, Model = 1 << 0, Migrator = 1 << 1 }

// normalize anything like: true | 'migrator' | 'both' | flags | { migrator?: boolean }
function isLocalForMigrator(x: any): boolean {
   const v = x?.local;
   if (!v) return false;
   if (v === true) return true;                         // blanket local
   if (typeof v === "string") {
      const s = v.toLowerCase();
      return s === "migrator" || s === "both" || s === "all" || s === "*";
   }
   if (typeof v === "number") return (v & GenTarget.Migrator) !== 0;
   if (typeof v === "object") return !!v.migrator || !!v.both || !!v.all;
   return false;
}

/**
 * Topologically sort migrations so FK parents come before children.
 * - Skips migrations marked local for migrator.
 * - Skips FK edges from defs marked local for migrator.
 * - Considers only owning-side FKs.
 * - Dedupes edges; throws on cycles.
 */
export function sortMigrations(input: Migration[]): Migration[] {
   // 0) keep only migrations that will actually emit for migrator
   const migrations = (input || []).filter(m => !isLocalForMigrator(m));

   // 1) table -> migration
   const migMap = new Map<string, Migration>(migrations.map(m => [m.tableName, m]));

   // 2) child -> Set<parent>
   const rawDeps = new Map<string, Set<string>>();
   for (const { tableName } of migrations) rawDeps.set(tableName, new Set());

   for (const m of migrations) {
      for (const def of (m as any).definitions ?? []) {
         // skip defs silenced for migrator
         if (isLocalForMigrator(def)) continue;

         const rel = (def as any).relationship;
         if (!rel) continue;

         // ignore back-relations (your extras usually set: relationship.ignore = true)
         if (rel.ignore === true) continue;

         // Owning side? prefer relationship.fields; fallback to relationFromFields if carried through
         const ownFields: readonly string[] =
            Array.isArray(rel.fields) ? rel.fields :
               Array.isArray((def as any).relationFromFields) ? (def as any).relationFromFields :
                  [];

         if (ownFields.length === 0) continue;

         // Parent table: allow several keys to be safe
         const parent: string | undefined = rel.on || rel.table || rel.target;
         if (!parent) continue;
         if (parent === m.tableName) continue;     // self-edge ignored
         if (!migMap.has(parent)) continue;        // external table not in this batch

         rawDeps.get(m.tableName)!.add(parent);    // Set dedupes edges
      }
   }

   // 3) Build adjacency & in-degree
   const adj = new Map<string, Set<string>>();
   const inDegree = new Map<string, number>();
   for (const tbl of migMap.keys()) {
      adj.set(tbl, new Set());
      inDegree.set(tbl, 0);
   }
   for (const [child, parents] of rawDeps) {
      for (const parent of parents) {
         if (parent === child) continue;
         if (!adj.get(parent)!.has(child)) {
            adj.get(parent)!.add(child);
            inDegree.set(child, (inDegree.get(child) || 0) + 1);
         }
      }
   }

   // 4) Kahn’s algorithm
   const queue = Array.from(inDegree.entries())
      .filter(([, d]) => d === 0)
      .map(([t]) => t);

   const sorted: Migration[] = [];
   while (queue.length) {
      const tbl = queue.shift()!;
      sorted.push(migMap.get(tbl)!);

      for (const child of adj.get(tbl)!) {
         const nd = (inDegree.get(child) || 0) - 1;
         inDegree.set(child, nd);
         if (nd === 0) queue.push(child);
      }
   }

   // 5) Cycle detection
   if (sorted.length !== migrations.length) {
      const stuck = Array.from(inDegree.entries())
         .filter(([, d]) => d > 0)
         .map(([t]) => t);
      const edgeDump = Array.from(rawDeps.entries())
         .map(([c, ps]) => `${c} ← [${Array.from(ps).join(", ")}]`)
         .join("; ");
      throw new Error(
         `Cycle detected in migration dependencies. Stuck: ${stuck.join(", ")}. Edges: ${edgeDump}`
      );
   }

   return sorted;
}