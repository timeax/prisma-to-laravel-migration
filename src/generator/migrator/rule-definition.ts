import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "./column-definition-types";
import {
   defaultBuild,
   foreignIdRule,
   idRule,
   morphsMergeRule,
   morphsRule,
   nullableMorphsRule,
   rememberTokenRule,
   Render,
   Rule,
   softDeletesRule,
   softDeletesTzRule,
   timestampsRule,
   timestampsTzRule,
} from "./rules.js";

/**
 * Encapsulates all special‐case column rendering rules.
 * Needs access to the full DMMF document and the set of all column definitions
 * in order to support rules that depend on other columns (e.g. composite keys).
 */
export class RuleResolver {
   private definitions: ColumnDefinition[] = [];

   constructor(private dmmf: DMMF.Document, private customRules: Rule[] = []) { }

   /**
    * Supply the full list of column definitions so that rules can inspect
    * other columns (e.g. detect composite primary keys or multi‐column morphs).
    */
   public setDefinitions(defs: ColumnDefinition[]): void {
      this.definitions = defs;
   }

   private rules: Array<Rule> = [
      softDeletesRule,
      softDeletesTzRule,
      timestampsRule,
      timestampsTzRule,
      idRule,
      rememberTokenRule,
      foreignIdRule,
      morphsRule,
      nullableMorphsRule,
      morphsMergeRule,
   ];

   /**
    * Returns the special‐case lines for this column,
    * or an empty array if none of the rules match.
    */
   public resolve(def: ColumnDefinition): Render {
      for (const { test, render } of [...this.rules, ...(this.customRules ?? [])]) {
         if (test(def, this.definitions, this.dmmf)) {
            return render(def, this.definitions, this.dmmf);
         }
      }
      return defaultBuild(def);
   }
}
