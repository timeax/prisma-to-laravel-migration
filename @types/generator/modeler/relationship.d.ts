import { DMMF } from "@prisma/generator-helper";
export type RelationKind = "belongsTo" | "hasOne" | "hasMany" | "belongsToMany" | "morphTo" | "morphMany" | "morphOne" | "morphedByMany" | "morphToMany";
export interface RelationDefinition {
    /** Method name on the Eloquent model */
    name: string;
    /** Final Laravel relation kind */
    type: RelationKind;
    /** e.g. "User::class" */
    modelClass: string;
    /** For direct relations (belongsTo / hasOne / hasMany) */
    /** belongsTo → columns on THIS model (FK) */
    /** hasOne/hasMany → columns on RELATED model (FK) */
    foreignKey?: string[];
    /** belongsTo → columns on RELATED model (owner key) */
    /** hasOne/hasMany → columns on THIS model (local key) */
    localKey?: string[];
    /** belongsToMany extras */
    mode?: "explicit" | "implicit";
    /** Pivot table (explicit pivot dbName or implicit conventional) */
    pivotTable?: string;
    /** On pivot: columns that reference THIS model */
    pivotLocal?: string[];
    /** On pivot: columns that reference TARGET model */
    pivotForeign?: string[];
    /** Endpoint model name (without ::class); useful downstream */
    targetModelName?: string;
    /** Morph extras (not used here, reserved) */
    morphType?: string;
}
export type HasManyKeys = {
    kind: "hasMany";
    target: string;
    foreign: string[];
    local: string[];
};
export type BelongsToManyExplicit = {
    kind: "belongsToMany";
    mode: "explicit";
    target: string;
    pivotTable: string;
    pivotLocal: string[];
    pivotForeign: string[];
    local: string[];
    foreign: string[];
};
export type BelongsToManyImplicit = {
    kind: "belongsToMany";
    mode: "implicit";
    target: string;
    pivotTable: string;
    local: string[];
    foreign: string[];
};
export type ListRelationKeys = HasManyKeys | BelongsToManyExplicit | BelongsToManyImplicit;
export declare function extractListRelationKeys(dmmf: DMMF.Document, model: DMMF.Model, field: DMMF.Field): ListRelationKeys | null;
export declare function buildRelationsForModel(dmmf: DMMF.Document, model: DMMF.Model): RelationDefinition[];
