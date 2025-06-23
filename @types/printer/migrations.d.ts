import { Migration } from '../generator/migrator/PrismaToLaravelMigrationGenerator.js';
import { StubConfig } from '../generator/utils.js';
export declare class StubMigrationPrinter {
    #private;
    /** base config for per‐table stub resolution */
    private cfg;
    /** optional global override: if set, always use this stub */
    private globalStubPath?;
    private tmplFn;
    constructor(
    /** base config for per‐table stub resolution */
    cfg: StubConfig, 
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
    /** Helper to render all, sorted and joined with separators */
    printAll(migs: Migration[]): string;
}
