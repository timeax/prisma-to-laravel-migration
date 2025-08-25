/** Reuse these from your model‐generator file */
export interface EnumDefinition {
    name: string;
    values: string[];
}
export interface RelationDefinition {
    name: string;
    type: 'belongsTo' | 'hasOne' | 'hasMany' | 'belongsToMany' | 'morphTo' | 'morphMany' | 'morphToMany';
    modelClass: string;
    foreignKey?: string;
    localKey?: string;
    pivotTable?: string;
    morphType?: string;
}
export interface PropertyDefinition {
    name: string;
    phpType: string;
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
}
