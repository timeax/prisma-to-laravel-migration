import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "../../types/column-definition-types";
export type DefaultMapFn = (field: DMMF.Field) => string;
export type DefaultMaps = Record<string, DefaultMapFn>;
export interface Rule {
    utility?: boolean;
    test(def: ColumnDefinition, allDefs: ColumnDefinition[], dmmf: DMMF.Document): boolean;
    render(def: ColumnDefinition, allDefs: ColumnDefinition[], dmmf: DMMF.Document, defaultMaps: DefaultMaps): Render;
}
export interface Render {
    column: string;
    snippet: string[];
}
/**
 * Fallback renderer: respects def.ignore
 */
export declare function defaultBuild(def: ColumnDefinition, defaultMaps: DefaultMaps): {
    column: string;
    snippet: string[];
};
export declare const rules: Rule[];
