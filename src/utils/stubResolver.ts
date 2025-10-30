import path, { posix as p } from 'path';
import { existsSync } from 'fs';
import { Minimatch } from 'minimatch';
import { FlexibleStubGroup } from 'types/laravel-config';
import { StubConfig } from './utils';

/** helper ── does `table` satisfy pattern? */
const hit = (table: string, pattern: RegExp | string) =>
   pattern instanceof RegExp
      ? pattern.test(table)
      : pattern === '*'                 // wildcard
         ? true
         : new Minimatch(pattern).match(table);

/**
 * Resolve the actual stub file for a given table / enum.
 * Returns `undefined` when *nothing* can be found — caller may throw.
 */
export function resolveStub(
   cfg: StubConfig | undefined,
   type: 'migration' | 'model' | 'enum',
   table: string
): string | undefined {
   /* ---------- required root dir ---------- */
   if (!cfg?.stubDir) return;                                    // <— no stubDir? abort
   const root = path.resolve(process.cwd(), cfg.stubDir, type);
   /* ---------- A) direct per-table override ---------- */
   const direct = path.join(root, `${table}.stub`);
   if (existsSync(direct)) return direct;

   /* ---------- B) groups (may be undefined) ---------- */
   const groups: FlexibleStubGroup[] = Array.isArray(cfg.groups)
      ? cfg.groups
      : [];

   for (const g of groups) {
      const stubPath = path.join(root, g.stubFile);

      /* skip missing stub files early */
      if (!existsSync(stubPath)) continue;

      /* 1. explicit list -------------------------------------------------- */
      if (g.tables?.includes(table)) return stubPath;

      /* 2. include / exclude --------------------------------------------- */
      if (g.include) {
         const inc =
            g.include === '*' ||
            (Array.isArray(g.include)
               ? g.include.some(p => hit(table, p))
               : hit(table, g.include));

         const exc =
            g.exclude?.some(p => hit(table, p)) ?? false;

         if (inc && !exc) return stubPath;
      }

      /* 3. standalone pattern ------------------------------------------- */
      if (!g.include && g.pattern) {
         const pats = Array.isArray(g.pattern) ? g.pattern : [g.pattern];
         if (pats.some(p => hit(table, p))) return stubPath;
      }
   }

   /* ---------- C) fallback index.stub ---------------------------------- */
   const fallback = path.join(root, 'index.stub');
   return existsSync(fallback) ? fallback : undefined;
}