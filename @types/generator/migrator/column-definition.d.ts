import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "../../types/column-definition-types.js";
/**
 * Helper class to build ColumnDefinition objects from Prisma DMMF.Field.
 */
export declare class ColumnDefinitionGenerator {
    #private;
    private dmmf;
    constructor(dmmf: DMMF.Document);
    getColumns(): Record<string, ColumnDefinition[]>;
    getColumns(modelName: string): ColumnDefinition[];
    /**
     * Generate a ColumnDefinition from a DMMF.Field.
     */
    generate(field: DMMF.Field): ColumnDefinition;
    private mapPrismaAction;
}
