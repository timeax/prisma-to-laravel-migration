import fs from 'fs';
import path from 'path';
import { Migration } from '../generator/migrator/PrismaToLaravelMigrationGenerator.js';
import { formatStub, resolveStub, StubConfig } from '../generator/utils.js';
import { sortMigrations } from '../generator/migrator/sort.js';

export class StubMigrationPrinter {
   #currentStubPath = '';
   private tmplFn!: (
      tableName: string,
      columns: string,
      definitions: Migration['definitions']
   ) => string;

   constructor(
      /** base config for per‐table stub resolution */
      private cfg: StubConfig,
      /** optional global override: if set, always use this stub */
      private globalStubPath?: string
   ) { }

   /** Switch to the correct stub for this table (or reuse the last one) */
   private ensureStub(tableName: string) {
      // 1) pick the stub path: global override wins, otherwise per‐table/group/index
      // Prioritize per‐table/group/index stubs; only fall back to global override if none found
      const resolved = resolveStub(this.cfg, 'migration', tableName);
      const stubPath = resolved
         ? resolved
         : this.globalStubPath
            ? path.resolve(process.cwd(), this.globalStubPath)
            : (() => { throw new Error(`No stub found for migration '${tableName}'`); })();

      if (stubPath === this.#currentStubPath) {
         return;
      }

      // 2) load and compile
      const raw = fs.readFileSync(path.resolve(stubPath), 'utf-8');
      const escaped = formatStub(raw);
      this.tmplFn = new Function(
         'tableName',
         'columns',
         'definitions',
         `return \`${escaped}\`;`
      ) as typeof this.tmplFn;

      this.#currentStubPath = stubPath;
   }

   /**
    * Render a single migration.
    * Returns both the full file and the raw column block.
    */
   public printMigration(mig: Migration) {
      // ensure we have the right stub loaded
      this.ensureStub(mig.tableName);

      // prepare the indented columns block
      const columns = mig.statements
         .map(line => '            ' + line)
         .join('\n');

      // call the compiled template function
      const fullContent = this.tmplFn(
         mig.tableName,
         columns,
         mig.definitions
      );

      return { fullContent, columns };
   }

   /** Helper to render all, sorted and joined with separators */
   public printAll(migs: Migration[]): string {
      const sorted = sortMigrations(migs);
      return sorted
         .map(m => this.printMigration(m).fullContent)
         .join('\n\n');
   }
}