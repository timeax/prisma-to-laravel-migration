import { RelationDefinition } from "./relationship/types";
/** Reuse these from your model‐generator file */
export interface EnumDefinition {
    name: string;
    values: string[];
    namespace: string;
}
export interface PropertyDefinition {
    name: string;
    phpType: string;
    type: string;
    fillable: boolean;
    hidden: boolean;
    ignore: boolean;
    optional: boolean;
    cast?: string;
    enumRef?: string;
    isList: boolean;
    guarded?: boolean;
    relation?: RelationDefinition;
    typeAnnotation?: {
        import?: string;
        type: string;
    };
}
export interface ModelDefinition {
    isIgnored: boolean;
    className: string;
    tableName: string;
    properties: PropertyDefinition[];
    relations: RelationDefinition[];
    enums: EnumDefinition[];
    interfaces: Record<string, {
        import?: string;
        type: string;
    }>;
    guarded?: string[];
    with?: string[];
    imports?: string[];
    extends?: string;
    traits?: string[];
    implements?: string[];
    observer?: string;
    factory?: string;
    touches?: string[];
    appends?: string[];
    docblockProps?: string[];
    namespace: string;
}
