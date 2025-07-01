import { DMMF } from "@prisma/generator-helper";
import { MigrationType } from "../types/column-definition-types";
import { ModelDefinition } from "../generator/modeler/types";
import { StubGroupConfig } from "types/laravel-config";
/**
 * Given a Prisma field default, return the PHP code fragment
 * to append to your migration column definition.
 *
 * You’ll need to have `use Illuminate\Support\Facades\DB;`
 * at the top of your migration stub for the `DB::raw()` calls.
 */
export declare function formatDefault(field: DMMF.Field): string;
export declare function getType(field: DMMF.Field): MigrationType;
export declare function buildModelContent(model: ModelDefinition): string;
/**
 * Escape a stub’s contents so it can be safely wrapped in a JS template literal.
 * This will:
 *  - Escape all backslashes
 *  - Escape all backticks
 */
export declare function formatStub(stub: string): string;
export interface StubConfig {
    stubDir: string;
    groups?: StubGroupConfig[];
    tablePrefix?: string;
    tableSuffix?: string;
}
export declare function resolveStub(cfg: StubConfig, type: "migration" | "model" | "enum", tableName: string): string | undefined;
export interface NameOpts {
    tablePrefix?: string;
    tableSuffix?: string;
}
/** tx_ + users + _tx → returns "tx_users_tx" */
export declare function decorate(name: string, opts: NameOpts): string;
