import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "./column-definition-types";
export interface Rule {
    test(def: ColumnDefinition, allDefs: ColumnDefinition[], dmmf: DMMF.Document): boolean;
    render(def: ColumnDefinition, allDefs: ColumnDefinition[], dmmf: DMMF.Document): Render;
}
export interface Render {
    column: string;
    snippet: string[];
}
/** ID primary key */
declare const idRule: Rule;
/** timezone‐aware timestamps → timestampsTz() */
declare const timestampsTzRule: Rule;
/** plain timestamps → timestamps() */
declare const timestampsRule: Rule;
/** timezone‐aware soft deletes → softDeletesTz() */
declare const softDeletesTzRule: Rule;
/** plain soft deletes → softDeletes() */
declare const softDeletesRule: Rule;
/** remember token */
declare const rememberTokenRule: Rule;
/** Foreign ID shorthand, plus ignore its related back‐reference */
declare const foreignIdRule: Rule;
/** morphs (non‐nullable polymorphic) */
declare const morphsRule: Rule;
/** nullableMorphs (nullable polymorphic) */
declare const nullableMorphsRule: Rule;
/** combine/_merge is handled via the two morphs rules above, skip the merge rule */
/**
 * Fallback renderer: respects def.ignore
 */
declare function defaultBuild(def: ColumnDefinition): {
    column: string;
    snippet: string[];
};
/** Merge `<base>_id` + `<base>_type` into one morphs call */
declare const morphsMergeRule: Rule;
export { idRule, timestampsTzRule, timestampsRule, softDeletesTzRule, softDeletesRule, rememberTokenRule, foreignIdRule, morphsMergeRule, // <— added back
morphsRule, nullableMorphsRule, defaultBuild, };
