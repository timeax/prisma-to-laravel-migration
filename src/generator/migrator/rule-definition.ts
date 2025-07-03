import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "../../types/column-definition-types";
import { rules as ruleList, Rule, defaultBuild, Render, DefaultMaps } from "./rules.js";

/**
 * Encapsulates all special‐case column rendering rules.
 * Needs access to the full DMMF document and the set of all column definitions
 * in order to support rules that depend on other columns (e.g. composite keys).
 */
export class RuleResolver {
   private definitions: ColumnDefinition[] = [];

   constructor(private dmmf: DMMF.Document, private customRules: Rule[] = [], private defaultMaps: DefaultMaps = {}) { }

   /**
    * Supply the full list of column definitions so that rules can inspect
    * other columns (e.g. detect composite primary keys or multi‐column morphs).
    */
   public setDefinitions(defs: ColumnDefinition[]): void {
      this.definitions = defs;
   }

   private rules: Array<Rule> = ruleList;

   /**
    * Returns the special‐case lines for this column,
    * or an empty array if none of the rules match.
    */
   public resolve(def: ColumnDefinition) {
      for (const rule of [...this.rules, ...this.customRules]) {
         if (rule.utility) continue;                // skip utility rules here
         if (rule.test(def, this.definitions, this.dmmf)) {
            return rule.render(def, this.definitions, this.dmmf, this.defaultMaps);
         }
      }
      return defaultBuild(def, this.defaultMaps);                   // fallback
   }

   /** NEW: run all *utility* rules once and gather their snippets */
   public resolveUtilities(): string[] {
      const snippets: string[] = [];

      for (const rule of [...this.rules, ...this.customRules]) {
         if (!rule.utility) continue;

         // many utility rules fire only once per model; iterate all defs
         for (const def of this.definitions) {
            if (rule.test(def, this.definitions, this.dmmf)) {
               const { snippet } = rule.render(def, this.definitions, this.dmmf, this.defaultMaps);
               snippets.push(...snippet);
            }
         }
      }
      return snippets;
   }

}
