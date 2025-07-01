import { Migration } from "../generator/migrator/PrismaToLaravelMigrationGenerator.js";
import { StubConfig } from "../utils/utils.js";
export interface PrinterNameOpts {
    tablePrefix?: string;
    tableSuffix?: string;
}
export declare class StubMigrationPrinter {
    #private;
    /** base config for per-table stub resolution */
    private cfg;
    /** optional global override: if set, always use this stub */
    private globalStubPath?;
    private tmplFn;
    private static textCache;
    constructor(
    /** base config for per-table stub resolution */
    cfg: StubConfig & PrinterNameOpts, 
    /** optional global override: if set, always use this stub */
    globalStubPath?: string | undefined);
    /** Switch to the correct stub for this table (or reuse the last one) */
    private ensureStub;
    /**
     * Render a single migration.
     * Returns both the full file and the raw column block.
     */
    printMigration(mig: Migration): {
        fullContent: string;
        columns: string;
    };
    /** Render all migrations, sorted */
    printAll(migs: Migration[]): string;
}
