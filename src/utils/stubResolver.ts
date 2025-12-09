import path from 'path';
import { existsSync } from 'fs';
import { Minimatch } from 'minimatch';
import type { FlexibleStubGroup } from '@/types/laravel-config';
import type { StubConfig } from './utils';

/** helper ── does `table` satisfy pattern? */
const hit = (table: string, pattern: RegExp | string) =>
   pattern instanceof RegExp
      ? pattern.test(table)
      : pattern === '*' // wildcard
         ? true
         : new Minimatch(pattern).match(table);

/**
 * Resolve the actual stub file for a given table / enum / TS symbol.
 *
 * Layout convention:
 *   <stubDir>/
 *     migration/
 *       index.stub
 *       users.stub
 *       posts.stub
 *     model/
 *       index.stub
 *       User.stub
 *       Post.stub
 *     enum/
 *       index.stub
 *       Status.stub
 *     ts/
 *       index.stub
 *       User.stub
 *       Post.stub
 *
 * Returns `undefined` when *nothing* can be found — the caller may then
 * choose to fall back to a built-in template or throw.
 */
export function resolveStub(
   cfg: StubConfig | undefined,
   type: 'migration' | 'model' | 'enum' | 'ts',
   table: string
): string | undefined {
   // no stubDir configured → no resolution possible
   if (!cfg?.stubDir) return;

   // root: <stubDir>/<type>
   const root = path.resolve(process.cwd(), cfg.stubDir, type);

   // A) direct per-table override: <root>/<table>.stub
   const direct = path.join(root, `${table}.stub`);
   if (existsSync(direct)) return direct;

   // B) apply groups (optional)
   const groups: FlexibleStubGroup[] = Array.isArray(cfg.groups)
      ? cfg.groups
      : [];

   for (const g of groups) {
      const stubPath = path.join(root, g.stubFile);

      // skip if group stub file itself doesn’t exist
      if (!existsSync(stubPath)) continue;

      // 1. explicit list of tables
      if (g.tables?.includes(table)) return stubPath;

      // 2. include / exclude with globs or regex
      if (g.include) {
         const inc =
            g.include === '*' ||
            (Array.isArray(g.include)
               ? g.include.some((p) => hit(table, p))
               : hit(table, g.include));

         const exc = g.exclude?.some((p) => hit(table, p)) ?? false;

         if (inc && !exc) return stubPath;
      }

      // 3. standalone pattern(s)
      if (!g.include && g.pattern) {
         const pats = Array.isArray(g.pattern) ? g.pattern : [g.pattern];
         if (pats.some((p) => hit(table, p))) return stubPath;
      }
   }

   // C) fallback: <root>/index.stub
   const fallback = path.join(root, 'index.stub');
   return existsSync(fallback) ? fallback : undefined;
}