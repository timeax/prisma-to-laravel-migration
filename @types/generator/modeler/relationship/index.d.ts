import { DMMF } from "@prisma/generator-helper";
import { RelationDefinition, ListRelationKeys } from "./types.js";
export declare function extractListRelationKeys(dmmf: DMMF.Document, model: DMMF.Model, field: DMMF.Field): ListRelationKeys | null;
export declare function buildRelationsForModel(dmmf: DMMF.Document, model: DMMF.Model): RelationDefinition[];
