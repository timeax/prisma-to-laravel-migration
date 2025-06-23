import { DMMF } from "@prisma/generator-helper";
import { MigrationType } from "./migrator/column-definition-types.js";
import { ModelDefinition } from "./modeler/types.js";
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
/**
 * Safely write or update a file by replacing the region between
 * startMarker and endMarker if both exist, otherwise overwrite the whole file.
 *
 * @param filePath      Path to the target file
 * @param fullContent   The full text to write if markers are missing
 * @param generated     The text to inject between the markers
 * @param startMarker   Literal string marking the region start
 * @param endMarker     Literal string marking the region end
 * @param overwrite     If false and file exists, do nothing
 */
export declare function writeWithMarkers(filePath: string, fullContent: string, generated: string, startMarker: string, endMarker: string, overwrite: boolean): void;
export interface StubGroupConfig {
    /** path relative to stubDir/<type>/, e.g. "fancy-orders.stub" */
    stubFile: string;
    tables: string[];
}
export interface StubConfig {
    stubDir: string;
    groups?: StubGroupConfig[];
}
export declare function resolveStub(cfg: StubConfig, type: "migration" | "model" | "enum", tableName: string): string | undefined;
