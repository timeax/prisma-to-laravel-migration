import { DMMF } from "@prisma/generator-helper";
import {decorate, getConfig} from "@/utils/utils";

/* ----------------------------- Public types ------------------------------ */

export type RelationKind =
  | "belongsTo"
  | "hasOne"
  | "hasMany"
  | "belongsToMany"
  | "morphTo"
  | "morphOne"
  | "morphMany"
  | "morphToMany"
  | "morphedByMany";

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
  pivotAlias?: string;         // optional alias for pivot
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
  morphType?: string;        // base name, e.g. 'commentable'
  morphIdField?: string;     // e.g. 'commentable_id'
  morphTypeField?: string;   // e.g. 'commentable_type'

  /** Optional raw chain to append, e.g. "latest()->where('active',1)" */
  rawChain?: string;
}

export type HasManyKeys = {
  kind: "hasMany";
  target: string;
  foreign: readonly string[]; // on related (child)
  local: readonly string[];   // on this (parent)
};

export type BelongsToManyExplicit = {
  kind: "belongsToMany";
  mode: "explicit";
  target: string;
  pivotTable: string;
  pivotAlias?: string;      // optional alias for pivot
  pivotColumns: readonly string[];   // extra fields on pivot
  withTimestamps: boolean;
  pivotLocal: readonly string[];   // pivot → me
  pivotForeign: readonly string[]; // pivot → target
  local: readonly string[];        // me
  foreign: readonly string[];      // target
};

export type BelongsToManyImplicit = {
  kind: "belongsToMany";
  mode: "implicit";
  target: string;
  pivotTable: string;        // conventional
  local: readonly string[];  // PKs of me
  foreign: readonly string[];// PKs of target
};

export type ListRelationKeys =
  | HasManyKeys
  | BelongsToManyExplicit
  | BelongsToManyImplicit;

/* ------------------------------- Utils ----------------------------------- */

export const getModel = (dmmf: DMMF.Document, name: string) =>
  dmmf.datamodel.models.find((m) => m.name === name)!;

export const dbNameOf = (m: DMMF.Model) => decorate(m.dbName ?? m.name, {tablePrefix: getConfig('model')?.tablePrefix, tableSuffix: getConfig('model')?.tableSuffix});

export const conventionalPivotName = (a: string, b: string) =>
  [a, b].map((s) => s.toLowerCase()).sort().join("_");

export const objRels = (m: DMMF.Model) => m.fields.filter((f) => f.kind === "object");
export const scalarNames = (m: DMMF.Model) =>
  m.fields.filter((f) => f.kind === "scalar").map((s) => s.name);

export const PIVOT_SCALAR_WHITELIST = new Set([
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "meta",
  "extra",
]);

export const getPrimaryKeyFields = (m: DMMF.Model): string[] => {
  const pk = (m as any).primaryKey?.fields as string[] | undefined;
  if (pk?.length) return pk;
  const ids = m.fields.filter((f) => f.isId).map((f) => f.name);
  return ids.length ? ids : [];
};

export const hasIntersection = (a: readonly string[] = [], b: readonly string[] = []) => {
  const S = new Set(a);
  return b.some((x) => S.has(x));
};

export const setsEqual = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const S = new Set(a);
  return b.every((x) => S.has(x));
};

export const getUniqueSets = (m: DMMF.Model): string[][] => {
  const sets: string[][] = [];
  const uniqueFields = (m as any).uniqueFields as string[][] | undefined;
  if (uniqueFields?.length) sets.push(...uniqueFields);
  const uniqueIndexes = (m as any).uniqueIndexes as { fields: string[] }[] | undefined;
  if (uniqueIndexes?.length) sets.push(...uniqueIndexes.map((u) => u.fields));
  const pk = getPrimaryKeyFields(m);
  if (pk.length) sets.push(pk);
  return sets;
};

export const isUniqueOn = (m: DMMF.Model, fields: readonly string[]): boolean => {
  if (!fields.length) return false;
  const uniques = getUniqueSets(m);
  const sorted = [...fields].sort();
  return uniques.some((set) => setsEqual(set.slice().sort(), sorted));
};