import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "./column-definition-types";
import { Render, Rule } from "./rules.js";
/**
 * Encapsulates all special‐case column rendering rules.
 * Needs access to the full DMMF document and the set of all column definitions
 * in order to support rules that depend on other columns (e.g. composite keys).
 */
export declare class RuleResolver {
    private dmmf;
    private customRules;
    private definitions;
    constructor(dmmf: DMMF.Document, customRules?: Rule[]);
    /**
     * Supply the full list of column definitions so that rules can inspect
     * other columns (e.g. detect composite primary keys or multi‐column morphs).
     */
    setDefinitions(defs: ColumnDefinition[]): void;
    private rules;
    /**
     * Returns the special‐case lines for this column,
     * or an empty array if none of the rules match.
     */
    resolve(def: ColumnDefinition): Render;
}
