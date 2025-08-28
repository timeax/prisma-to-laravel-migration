import { DMMF } from "@prisma/generator-helper";
import { RelationDefinition } from "./types.js";
/** Auto-detect morphTo by scanning scalar column pairs: base_id + base_type */
export declare function detectMorphToRelations(model: DMMF.Model): RelationDefinition[];
/**
 * Parse model-level documentation directives:
 *   /// @morph(name: commentable, type: many|one|to many|by many, model: Comment, table:"taggables", raw:"latest()")
 * Optional: as: comments, idField: commentable_id, typeField: commentable_type
 */
export declare function parseMorphOwnerDirectives(model: DMMF.Model): RelationDefinition[];
