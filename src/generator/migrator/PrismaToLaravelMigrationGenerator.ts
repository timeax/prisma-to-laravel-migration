import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinitionGenerator } from "./column-definition.js";
import { RuleResolver } from "./rule-definition.js";
import { ColumnDefinition } from "../../types/column-definition-types.js";
import { DefaultMaps, Rule } from "./rules.js";

/**
 * The shape returned by the generator—pure data, no rendering.
 */
export interface Migration {
   isIgnored: any;
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

   constructor(private dmmf: DMMF.Document, customRules: Rule[] = [], defaultMaps: DefaultMaps = {}) {
      this.columnGen = new ColumnDefinitionGenerator(dmmf);
      this.ruleResolver = new RuleResolver(dmmf, customRules, defaultMaps);
   }

   /**
    * Given an array of ColumnDefinition, apply rules and return PHP snippets.
    * Skips any definitions marked `ignore = true`.
    */
   private resolveColumns(defs: ColumnDefinition[]): string[] {
      // give the resolver full context for this model
      this.ruleResolver.setDefinitions(defs);

      /* ---------- 1. per-column rules (two-step flatMap) ------------------ */
      const columnLines = defs
         .flatMap(def => {
            // step-1: run the rule, keep def so we can see flags it sets
            const { snippet } = this.ruleResolver.resolve(def);
            return { def, snippet };
         })
         .flatMap(({ def, snippet }) => {
            // step-2: honour any def.ignore set by the rule
            return def.ignore ? [] : snippet;
         });

      /* ---------- 2. table-level utilities (PK, indexes, …) --------------- */
      const utilityLines = this.ruleResolver.resolveUtilities();

      /* ---------- 3. combine: columns first, utilities last --------------- */
      return [...columnLines, ...utilityLines];
   }

   /**
    * Generate a Migration object for each model, using per‐model definitions.
    */
   public generateAll(): Migration[] {
      // 1) Build a map: modelName → DMMF.Index[]
      const indexMap = new Map<string, DMMF.Index[]>();
      for (const idx of this.dmmf.datamodel.indexes) {
         if (!idx.isDefinedOnField) {
            const arr = indexMap.get(idx.model) ?? [];
            arr.push(idx);
            indexMap.set(idx.model, arr);
         }
      }

      // 2) For each model, resolve columns + utilities
      return this.dmmf.datamodel.models.map(model => {
         const modelName = model.name;
         const tableName = model.dbName ?? modelName;

         // a) Get your column definitions
         const definitions = this.columnGen.getColumns(tableName);

         // b) Resolve each column’s snippets
         const columns = this.resolveColumns(definitions);

         // c) Grab the Prisma @@index/@@unique/@@id entries for this model
         const indexes = indexMap.get(modelName) ?? [];

         // d) Build the table-level utilities and append them *after* the columns
         const utilities = this.buildTableUtilities(indexes);
         // e) Check for @silent tag in model docblock
         const isSilent = model.documentation
            ? /\B@silent\b/.test(model.documentation)
            : false;

         return {
            tableName,
            isIgnored: isSilent,
            definitions,
            statements: [...columns, ...utilities],
         };
      });
   }

   /**
      * Build table-level helpers (composite PK / composite & multi-col indexes / unique fields).
      *
      * @param indexes  The Prisma DMMF.Index[] *for this model only*.
      *                 Note `indexes` are all where isDefinedOnField is false.
      */
   public buildTableUtilities(indexes: DMMF.Index[] = []): string[] {
      const out: string[] = [];

      /**
        end products should fit Laravel’s Schema builder:
          $table->primary($columns, $name = null, $algorithm = null);
          $table->index($columns,   $name = null, $algorithm = null);
          $table->unique($columns,  $name = null, $algorithm = null);
        where $columns is string or string[]
      */

      /* ── 1️⃣  Primary keys ─────────────────────────────────────────── */
      const primaryIdxs = indexes.filter(i => i.type === "id");
      primaryIdxs.forEach(idx => {
         const parts: string[] = [];

         // open call
         parts.push("$table->primary(");

         // columns
         if (idx.fields.length > 1) {
            const cols = idx.fields.map(f => `'${f.name}'`).join(", ");
            parts.push(`[${cols}]`);
         } else {
            parts.push(`'${idx.fields[0].name}'`);
         }

         // name
         if (idx.name) {
            parts.push(`, '${idx.name}'`);
         }

         // algorithm
         if ((idx as any).algorithm) {
            parts.push(`, '${(idx as any).algorithm}'`);
         }

         // close
         parts.push(");");

         out.push(parts.join(""));
      });

      /* ── 2️⃣  Composite indexes ───────────────────────────────────── */
      const indexIdxs = indexes.filter(i => i.type === "normal");
      // (a) Composite
      indexIdxs.filter(i => i.fields.length > 1)
         .forEach(idx => {
            const parts: string[] = ["$table->index("];
            const cols = idx.fields.map(f => `'${f.name}'`).join(", ");
            parts.push(`[${cols}]`);
            if (idx.name) parts.push(`, '${idx.name}'`);
            if ((idx as any).algorithm) parts.push(`, '${(idx as any).algorithm}'`);
            parts.push(");");
            out.push(parts.join(""));
         });
      // (b) Single
      indexIdxs.filter(i => i.fields.length === 1)
         .forEach(idx => {
            const parts: string[] = ["$table->index("];
            parts.push(`'${idx.fields[0].name}'`);
            if (idx.name) parts.push(`, '${idx.name}'`);
            if ((idx as any).algorithm) parts.push(`, '${(idx as any).algorithm}'`);
            parts.push(");");
            out.push(parts.join(""));
         });

      /* ── 3️⃣  Composite unique keys ───────────────────────────────── */
      const uniqueIdxs = indexes.filter(i => i.type === "unique");
      // (a) Composite
      uniqueIdxs.filter(i => i.fields.length > 1)
         .forEach(idx => {
            const parts: string[] = ["$table->unique("];
            const cols = idx.fields.map(f => `'${f.name}'`).join(", ");
            parts.push(`[${cols}]`);
            if (idx.name) parts.push(`, '${idx.name}'`);
            if ((idx as any).algorithm) parts.push(`, '${(idx as any).algorithm}'`);
            parts.push(");");
            out.push(parts.join(""));
         });
      // (b) Single
      uniqueIdxs.filter(i => i.fields.length === 1)
         .forEach(idx => {
            const parts: string[] = ["$table->unique("];
            parts.push(`'${idx.fields[0].name}'`);
            if (idx.name) parts.push(`, '${idx.name}'`);
            if ((idx as any).algorithm) parts.push(`, '${(idx as any).algorithm}'`);
            parts.push(");");
            out.push(parts.join(""));
         });

      /* -----------------------------------------------------------
      * 2️⃣  Prisma model‐level FULLTEXT indexes
      * --------------------------------------------------------- */
      for (const idx of indexes.filter(i => i.type === 'fulltext')) {
         // Composite fullText: multiple columns
         if (idx.fields.length > 1) {
            const cols = idx.fields.map(f => `'${f.name}'`).join(', ');
            const name = idx.name ? `, '${idx.name}'` : '';
            const algo = idx.algorithm ? `, '${idx.algorithm}'` : '';
            out.push(`$table->fullText([${cols}]${name}${algo});`);
         }
         // Single‐column fullText
         else if (idx.fields.length === 1) {
            const col = idx.fields[0].name;
            const name = idx.name ? `, '${idx.name}'` : '';
            const algo = idx.algorithm ? `, '${idx.algorithm}'` : '';
            out.push(`$table->fullText('${col}'${name}${algo});`);
         }
      }


      return out;
   }
}