import { DMMF } from "@prisma/generator-helper";
type HasManyKeys = {
    kind: 'hasMany';
    target: string;
    foreign: string[];
    local: string[];
};
type BelongsToManyExplicit = {
    kind: 'belongsToMany';
    mode: 'explicit';
    target: string;
    pivotTable: string;
    pivotLocal: string[];
    pivotForeign: string[];
    local: string[];
    foreign: string[];
};
type BelongsToManyImplicit = {
    kind: 'belongsToMany';
    mode: 'implicit';
    target: string;
    pivotTable: string;
    local: string[];
    foreign: string[];
};
type ListRelationKeys = HasManyKeys | BelongsToManyExplicit | BelongsToManyImplicit;
export declare function extractListRelationKeys(dmmf: DMMF.Document, model: DMMF.Model, // “this” model
field: DMMF.Field): ListRelationKeys | null;
export {};
