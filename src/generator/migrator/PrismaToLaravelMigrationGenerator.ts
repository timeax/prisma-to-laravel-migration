import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinitionGenerator } from "./column-definition.js";
import { RuleResolver } from "./rule-definition.js";
import { ColumnDefinition } from "../../types/column-definition-types.js";
import { Rule } from "./rules.js";

/**
 * The shape returned by the generator—pure data, no rendering.
 */
export interface Migration {
   /** Table name (from dbName or model name) */
   tableName: string;
   /** Fully resolved migration lines for that table */
   statements: string[];
   /** The ColumnDefinition objects used to produce those statements */
   definitions: ColumnDefinition[];
}

export class PrismaToLaravelMigrationGenerator {
   private columnGen: ColumnDefinitionGenerator;
   private ruleResolver: RuleResolver;

   constructor(private dmmf: DMMF.Document, customRules: Rule[] = []) {
      this.columnGen = new ColumnDefinitionGenerator(dmmf);
      this.ruleResolver = new RuleResolver(dmmf, customRules);
   }

   /**
    * Given an array of ColumnDefinition, apply rules and return PHP snippets.
    * Skips any definitions marked `ignore = true`.
    */
   private resolveColumns(defs: ColumnDefinition[]): string[] {
      this.ruleResolver.setDefinitions(defs);

      return defs.flatMap(def => {
         // Apply rules: may set def.ignore and return { column, snippet }
         const { snippet } = this.ruleResolver.resolve(def);

         // If the rule marked this column to ignore, skip its snippets
         if (def.ignore) {
            return [];
         }

         return snippet;
      });
   }

   /**
    * Generate a Migration object for each model, using per‐model definitions.
    */
   public generateAll(): Migration[] {
      return this.dmmf.datamodel.models.map(model => {
         const tableName = model.dbName ?? model.name;
         const definitions = this.columnGen.getColumns(tableName);
         const statements = this.resolveColumns(definitions);

         return {
            tableName,
            definitions,
            statements,
         };
      });
   }
}