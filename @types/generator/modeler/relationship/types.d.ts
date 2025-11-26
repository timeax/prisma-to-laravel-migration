import { DMMF } from "@prisma/generator-helper";
export type RelationKind = "belongsTo" | "hasOne" | "hasMany" | "belongsToMany" | "morphTo" | "morphOne" | "morphMany" | "morphToMany" | "morphedByMany";
export interface RelationDefinition {
    /** Method name on the Eloquent model */
    name: string;
    /** Final Laravel relation kind */
    type: RelationKind;
    /** e.g. "User::class" (unused for morphTo) */
    modelClass: string;
    /** Direct relations (belongsTo / hasOne / hasMany) */
    /** belongsTo → columns on THIS model (FK) */
    /** hasOne/hasMany → columns on RELATED model (FK) */
    foreignKey?: readonly string[];
    /** belongsTo → columns on RELATED model (owner key) */
    /** hasOne/hasMany → columns on THIS model (local key) */
    localKey?: readonly string[];
    /** belongsToMany extras */
    mode?: "explicit" | "implicit";
    pivotTable?: string;
    /** On pivot: optional alias for relation */
    pivotAlias?: string;
    /** On pivot: extra columns to include */
    pivotColumns?: readonly string[];
    /** On pivot: whether to include timestamps */
    withTimestamps?: boolean;
    /** On pivot: columns referencing THIS model */
    pivotLocal?: readonly string[];
    /** On pivot: columns referencing TARGET model */
    pivotForeign?: readonly string[];
    /** Target model name without ::class (useful downstream) */
    targetModelName?: string;
    /** Morph extras */
    morphType?: string;
    morphIdField?: string;
    morphTypeField?: string;
    /** Optional raw chain to append, e.g. "latest()->where('active',1)" */
    rawChain?: string;
}
export type HasManyKeys = {
    kind: "hasMany";
    target: string;
    foreign: readonly string[];
    local: readonly string[];
};
export type BelongsToManyExplicit = {
    kind: "belongsToMany";
    mode: "explicit";
    target: string;
    pivotTable: string;
    pivotAlias?: string;
    pivotColumns: readonly string[];
    withTimestamps: boolean;
    pivotLocal: readonly string[];
    pivotForeign: readonly string[];
    local: readonly string[];
    foreign: readonly string[];
};
export type BelongsToManyImplicit = {
    kind: "belongsToMany";
    mode: "implicit";
    target: string;
    pivotTable: string;
    local: readonly string[];
    foreign: readonly string[];
};
export type ListRelationKeys = HasManyKeys | BelongsToManyExplicit | BelongsToManyImplicit;
export declare const getModel: (dmmf: DMMF.Document, name: string) => import("@prisma/dmmf/dist/util").ReadonlyDeep<import("@prisma/dmmf/dist/util").ReadonlyDeep<import("@prisma/dmmf/dist/util").ReadonlyDeep<{
    name: string;
    dbName: string | null;
    schema: string | null;
    fields: DMMF.Field[];
    uniqueFields: string[][];
    uniqueIndexes: DMMF.uniqueIndex[];
    documentation?: string;
    primaryKey: DMMF.PrimaryKey | null;
    isGenerated?: boolean;
}>>>;
export declare const dbNameOf: (m: DMMF.Model) => string;
export declare const conventionalPivotName: (a: string, b: string) => string;
export declare const objRels: (m: DMMF.Model) => import("@prisma/dmmf/dist/util").ReadonlyDeep<import("@prisma/dmmf/dist/util").ReadonlyDeep<{
    kind: DMMF.FieldKind;
    name: string;
    isRequired: boolean;
    isList: boolean;
    isUnique: boolean;
    isId: boolean;
    isReadOnly: boolean;
    isGenerated?: boolean;
    isUpdatedAt?: boolean;
    type: string;
    nativeType?: [string, string[]] | null;
    dbName?: string | null;
    hasDefaultValue: boolean;
    default?: DMMF.FieldDefault | DMMF.FieldDefaultScalar | DMMF.FieldDefaultScalar[];
    relationFromFields?: string[];
    relationToFields?: string[];
    relationOnDelete?: string;
    relationOnUpdate?: string;
    relationName?: string;
    documentation?: string;
}>>[];
export declare const scalarNames: (m: DMMF.Model) => string[];
export declare const PIVOT_SCALAR_WHITELIST: Set<string>;
export declare const getPrimaryKeyFields: (m: DMMF.Model) => string[];
export declare const hasIntersection: (a?: readonly string[], b?: readonly string[]) => boolean;
export declare const setsEqual: (a: readonly string[], b: readonly string[]) => boolean;
export declare const getUniqueSets: (m: DMMF.Model) => string[][];
export declare const isUniqueOn: (m: DMMF.Model, fields: readonly string[]) => boolean;
