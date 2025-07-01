import fs from "fs";
import path from "path";
import { Migration } from "../generator/migrator/PrismaToLaravelMigrationGenerator.js";
import {
   formatStub,
   resolveStub,
   StubConfig,
   decorate,            // ⬅️ helper that applies prefix / suffix
} from "../utils/utils.js";
import { sortMigrations } from "../generator/migrator/sort.js";

export interface PrinterNameOpts {
   tablePrefix?: string;
   tableSuffix?: string;
}

export class StubMigrationPrinter {
   #currentStubPath = "";
   private tmplFn!: (
      tableName: string,
      columns: string,
      definitions: Migration["definitions"]
   ) => string;

   private static textCache = new Map<string, string>();

   constructor(
      /** base config for per-table stub resolution */
      private cfg: StubConfig & PrinterNameOpts,
      /** optional global override: if set, always use this stub */
      private globalStubPath?: string
   ) { }

   /** Switch to the correct stub for this table (or reuse the last one) */
   private ensureStub(tableName: string) {
      /* 1) choose stub path */
      const resolved = resolveStub(this.cfg, "migration", tableName);
      const stubPath = resolved
         ? resolved
         : this.globalStubPath
            ? path.resolve(process.cwd(), this.globalStubPath)
            : (() => {
               throw new Error(`No stub found for migration '${tableName}'`);
            })();

      if (stubPath === this.#currentStubPath) return;

      /* 2) compile template */
      let raw = StubMigrationPrinter.textCache.get(stubPath);

      if (!raw) {
         raw = fs.readFileSync(stubPath, "utf-8");
         StubMigrationPrinter.textCache.set(stubPath, raw);
      }

      this.tmplFn = new Function(
         "tableName",
         "columns",
         "definitions",
         `return \`${formatStub(raw)}\`;`
      ) as typeof this.tmplFn;

      this.#currentStubPath = stubPath;
   }

   /**
    * Render a single migration.
    * Returns both the full file and the raw column block.
    */
   public printMigration(mig: Migration) {
      this.ensureStub(mig.tableName);

      const columns = mig.statements
         .map((l) => "            " + l)
         .join("\n");

      /* apply prefix/suffix when inserting into the stub */
      const physicalTable = decorate(mig.tableName, this.cfg);

      const fullContent = this.tmplFn(
         physicalTable,
         columns,
         mig.definitions
      );

      return { fullContent, columns };
   }

   /** Render all migrations, sorted */
   public printAll(migs: Migration[]): string {
      return sortMigrations(migs)
         .map((m) => this.printMigration(m).fullContent)
         .join("\n\n");
   }
}