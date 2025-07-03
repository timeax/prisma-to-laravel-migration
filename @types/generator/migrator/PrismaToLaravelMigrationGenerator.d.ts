import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "../../types/column-definition-types.js";
import { DefaultMaps, Rule } from "./rules.js";
/**
 * The shape returned by the generator—pure data, no rendering.
 */
export interface Migration {
    /** Table name (from dbName or model name) */
    tableName: string;
    /** Fully resolved migration lines for that table */
    statements: string[];
    /** The ColumnDefinition objects used to produce those statements */
    definitions: ColumnDefinition[];
}
export declare class PrismaToLaravelMigrationGenerator {
    private dmmf;
    private columnGen;
    private ruleResolver;
    constructor(dmmf: DMMF.Document, customRules?: Rule[], defaultMaps?: DefaultMaps);
    /**
     * Given an array of ColumnDefinition, apply rules and return PHP snippets.
     * Skips any definitions marked `ignore = true`.
     */
    private resolveColumns;
    /**
     * Generate a Migration object for each model, using per‐model definitions.
     */
    generateAll(): Migration[];
    /**
       * Build table-level helpers (composite PK / composite & multi-col indexes / unique fields).
       *
       * @param indexes  The Prisma DMMF.Index[] *for this model only*.
       *                 Note `indexes` are all where isDefinedOnField is false.
       */
    buildTableUtilities(indexes?: DMMF.Index[]): string[];
}
