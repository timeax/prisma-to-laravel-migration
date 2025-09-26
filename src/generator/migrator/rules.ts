import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "../../types/column-definition-types";
import { MigrationTypes } from "./migrationTypes.js";
import { formatDefault } from "../../utils/utils.js";
import { run } from "jest";

export type DefaultMapFn = (field: DMMF.Field) => string;

export type DefaultMaps = Record<string, DefaultMapFn>;

export interface Rule {
   utility?: boolean;
   test(
      def: ColumnDefinition,
      allDefs: ColumnDefinition[],
      dmmf: DMMF.Document
   ): boolean;
   render(
      def: ColumnDefinition,
      allDefs: ColumnDefinition[],
      dmmf: DMMF.Document,
      defaultMaps: DefaultMaps
   ): Render;
}

export interface Render {
   column: string;
   snippet: string[]
}

const intTypes = [MigrationTypes.unsignedBigInteger, MigrationTypes.bigInteger, MigrationTypes.unsignedInteger, MigrationTypes.integer];
/** ID primary key */
const idRule: Rule = {
   test: def =>
      def.name === "id" &&
      def.migrationType === "id" &&
      def.hasDefaultValue === true &&
      def.relationName === undefined,
   render: def => {
      // no counterpart to ignore
      return { column: def.name, snippet: ["$table->id();"] };
   },
};

/** timezone‐aware timestamps → timestampsTz() */
const timestampsTzRule: Rule = {
   test: (def, allDefs) => {
      if (def.name !== "created_at") return false;
      const tzTypes = [
         MigrationTypes.dateTimeTz,
         MigrationTypes.timestampsTz,
         MigrationTypes.timestamp,
      ];
      return (
         tzTypes.includes(def.migrationType as any) &&
         allDefs.some(
            d => d.name === "updated_at" && tzTypes.includes(d.migrationType as any)
         )
      );
   },
   render: (def, allDefs) => {
      // ignore the `updated_at` counterpart
      const updated = allDefs.find(d => d.name === "updated_at");
      if (updated) updated.ignore = true;
      return { column: def.name, snippet: ["$table->timestampsTz();"] };
   },
};

/** plain timestamps → timestamps() */
const timestampsRule: Rule = {
   test: (def, allDefs) => {
      if (def.name !== "created_at") return false;
      const plainTypes = [MigrationTypes.dateTime, MigrationTypes.timestamp];
      return (
         plainTypes.includes(def.migrationType as any) &&
         allDefs.some(
            d => d.name === "updated_at" && plainTypes.includes(d.migrationType as any)
         )
      );
   },
   render: (def, allDefs) => {
      // ignore the `updated_at` counterpart
      const updated = allDefs.find(d => d.name === "updated_at");
      if (updated) updated.ignore = true;
      return { column: def.name, snippet: ["$table->timestamps();"] };
   },
};

/** timezone‐aware soft deletes → softDeletesTz() */
const softDeletesTzRule: Rule = {
   test: def =>
      def.name === "deleted_at" &&
      ([MigrationTypes.dateTimeTz, MigrationTypes.timestampsTz, MigrationTypes.timestamp] as any).includes(
         def.migrationType
      ),
   render: def => {
      return { column: def.name, snippet: ["$table->softDeletesTz();"] };
   },
};

/** plain soft deletes → softDeletes() */
const softDeletesRule: Rule = {
   test: (def, allDefs) => {
      if (def.name !== "deleted_at") return false;
      const plainTypes = [MigrationTypes.dateTime, MigrationTypes.timestamp];
      return (
         plainTypes.includes(def.migrationType as any) &&
         !allDefs.some(
            d =>
               d.name === "deleted_at" &&
               ([MigrationTypes.dateTimeTz, MigrationTypes.timestampsTz, MigrationTypes.timestamp] as any).includes(
                  d.migrationType
               )
         )
      );
   },
   render: def => {
      return { column: def.name, snippet: ["$table->softDeletes();"] };
   },
};

/** remember token */
const rememberTokenRule: Rule = {
   test: def =>
      def.name === "remember_token" && def.migrationType === MigrationTypes.string,
   render: def => {
      return { column: def.name, snippet: ["$table->rememberToken();"] };
   },
};

/** Foreign ID shorthand, plus ignore its related back‐reference */
const foreignIdRule: Rule = {
   test: (def, allDefs) => {
      if (def.local) return false;  // NEW: skip if silenced at column level
      return intTypes.includes(
         def.migrationType as any
      ) &&
         def.name.endsWith("_id") &&
         allDefs.some(
            item =>
               item.relationFromFields?.length === 1 &&
               item.relationFromFields.includes(def.name)
               && item.local !== true // NEW: skip if silenced at relation level
         )
   }
   ,
   render: (def, allDefs, _d, defaultMaps) => {
      // Find the related field which contains the relationship metadata
      const ref = allDefs.find(
         item =>
            item.relationFromFields?.length === 1 &&
            item.relationFromFields.includes(def.name)
      )!;

      // Mark the reference field ignored
      ref.ignore = true;

      // Build the foreignId snippet
      let snippet = `$table->foreignId('${def.name}')`;
      if (def.nullable) snippet += '->nullable()';
      if (def.hasDefaultValue) snippet += formatDefault(def, defaultMaps);
      if (def.comment) snippet += `->comment(${JSON.stringify(def.comment)})`;

      // Use relationship info from the ref, not def
      const tbl = ref.relationship!.on;
      const col = ref.relationship!.references ?? 'id';
      snippet += `->constrained('${tbl}', '${col}')`;
      if (ref.relationship!.onDelete) snippet += `->onDelete('${ref.relationship!.onDelete}')`;
      if (ref.relationship!.onUpdate) snippet += `->onUpdate('${ref.relationship!.onUpdate}')`;
      snippet += ';';

      return { column: def.name, snippet: [snippet] };
   }
};

/** morphs (non‐nullable polymorphic) */
const morphsRule: Rule = {
   test: (def, allDefs) => {
      if (!def.name.endsWith("_id")) return false;
      const base = def.name.slice(0, -3);
      const typeDef = allDefs.find(d => d.name === `${base}_type`);
      if (!typeDef) return false;
      if (
         !intTypes.includes(def.migrationType as any) ||
         typeDef.migrationType !== MigrationTypes.string
      )
         return false;
      return def.nullable === false && typeDef.nullable === false;
   },
   render: (def, allDefs) => {
      // ignore the `<base>_type` counterpart
      const base = def.name.slice(0, -3);
      const typeDef = allDefs.find(d => d.name === `${base}_type`);
      if (typeDef) typeDef.ignore = true;

      return { column: def.name, snippet: [`$table->morphs('${base}');`] };
   },
};

/** nullableMorphs (nullable polymorphic) */
const nullableMorphsRule: Rule = {
   test: (def, allDefs) => {
      if (!def.name.endsWith("_id")) return false;
      const base = def.name.slice(0, -3);
      const typeDef = allDefs.find(d => d.name === `${base}_type`);
      if (!typeDef) return false;
      if (
         !intTypes.includes(def.migrationType as any) ||
         typeDef.migrationType !== MigrationTypes.string
      )
         return false;
      return def.nullable === true || typeDef.nullable === true;
   },
   render: (def, allDefs) => {
      // ignore the `<base>_type` counterpart
      const base = def.name.slice(0, -3);
      const typeDef = allDefs.find(d => d.name === `${base}_type`);
      if (typeDef) typeDef.ignore = true;

      return { column: def.name, snippet: [`$table->nullableMorphs('${base}');`] };
   },
};

/** combine/_merge is handled via the two morphs rules above, skip the merge rule */
function runNormal(def: ColumnDefinition, defaultMaps: DefaultMaps, snippet: string[]): void {
   const argsStr = def.args?.length
      ? `, ${def.args.map(a => JSON.stringify(a)).join(", ")}`
      : "";
   let line = `$table->${def.migrationType}('${def.name}'${argsStr})`;
   if (def.unsigned) line += "->unsigned()";
   if (def.nullable) line += "->nullable()";
   if (def.hasDefaultValue) line += formatDefault(def, defaultMaps);
   if (def.comment) line += `->comment(${JSON.stringify(def.comment)})`;
   line += ";";
   snippet.push(line);
}
/**
 * Fallback renderer: respects def.ignore
 */
export function defaultBuild(def: ColumnDefinition, defaultMaps: DefaultMaps): { column: string; snippet: string[] } {
   def.ignore && (def.ignore = true); // leave ignore as set
   let snippet: string[] = [];
   if (!def.ignore) { // always render relations
      if (def.local || def.relationship?.local) runNormal(def, defaultMaps, snippet);
      else if (def.migrationType === 'relation' && def.relationship && !def.relationship.ignore) {
         const { on, references = "id", onDelete, onUpdate, fields } = def.relationship;

         let foreignKey: string;
         // Detect composite
         if (Array.isArray(fields) && fields.length > 1) {
            const cols = fields.map(f => `'${f}'`).join(', ');
            const refs = (Array.isArray(references) ? references : [references])
               .map(r => `'${r}'`)
               .join(', ');

            foreignKey = `$table->foreign([${cols}])->references([${refs}])->on('${on}')`;
         } else {
            const col = Array.isArray(fields) ? fields[0] : fields;
            const ref = Array.isArray(references) ? references[0] : references;

            foreignKey = `$table->foreign('${col}')->references('${ref}')->on('${on}')`;
         }

         // Apply onDelete/onUpdate
         if (onDelete) foreignKey += `->onDelete('${onDelete}')`;
         if (onUpdate) foreignKey += `->onUpdate('${onUpdate}')`;

         foreignKey += ';';
         snippet.push(foreignKey);
      } else runNormal(def, defaultMaps, snippet);
   }

   return { column: def.name, snippet };
}

/** Merge `<base>_id` + `<base>_type` into one morphs call */
const morphsMergeRule: Rule = {
   test: (def, allDefs) => {
      if (!def.name.endsWith('_id')) return false;
      const base = def.name.slice(0, -3);
      const typeDef = allDefs.find(d => d.name === `${base}_type`);
      if (!typeDef) return false;

      // must be a UUID or ULID morph pair
      const isUUID = def.migrationType === MigrationTypes.uuid && typeDef.migrationType === MigrationTypes.string;
      const isULID = def.migrationType === MigrationTypes.ulid && typeDef.migrationType === MigrationTypes.string;
      return isUUID || isULID;
   },
   render: (def, allDefs) => {
      const base = def.name.slice(0, -3);
      const typeDef = allDefs.find(d => d.name === `${base}_type`)!;
      const isNullable = def.nullable || typeDef.nullable;

      // pick the correct morphs method
      const method: 'uuidMorphs' | 'nullableUuidMorphs' | 'ulidMorphs' | 'nullableUlidMorphs' =
         def.migrationType === MigrationTypes.uuid
            ? isNullable ? 'nullableUuidMorphs' : 'uuidMorphs'
            : isNullable ? 'nullableUlidMorphs' : 'ulidMorphs';

      // mark both id and type as ignored
      def.ignore = true;
      typeDef.ignore = true;

      return {
         column: base,
         snippet: [`$table->${method}('${base}');`]
      };
   }
};

/* ────────────────────────────────────────────────────────────────── */
/* 1. Composite PRIMARY KEY                                          */
/* ────────────────────────────────────────────────────────────────── */
const compositePrimaryRule: Rule = {
   utility: true,
   /* fire on the *first* PK column only, and only if we haven’t
      already handled the composite */
   test(def, allDefs) {
      if (!def.isId || def.ignoreCompositePK) return false;

      const pkCols = allDefs.filter(d => d.isId);
      if (pkCols.length < 2) return false;           // not composite
      if (pkCols[0].name !== def.name) return false; // only once

      return true;
   },

   render(_def, allDefs) {
      // Mark every PK column so the rule never fires again
      allDefs.forEach(d => {
         if (d.isId) d.ignoreCompositePK = true;
      });

      const cols = allDefs.filter(d => d.isId).map(d => `'${d.name}'`);
      return {
         column: '__composite_pk__',
         snippet: [`$table->primary([${cols.join(', ')}]);`],
      };
   },
};

/* ────────────────────────────────────────────────────────────────── */
/* 2. Per-column INDEX shorthand                                     */
/*    (works the same for UNIQUE if you want another rule)           */
/* ────────────────────────────────────────────────────────────────── */
const indexRule: Rule = {
   utility: true,
   test(def) {
      return !!def.isIndexed && !def.ignoreIndex;
   },

   render(def) {
      // Flip the flag so this rule never re-fires for this column
      def.ignoreIndex = true;

      return {
         column: def.name,
         snippet: [`$table->index('${def.name}');`],
      };
   },
};

/* ------------------------------------------------------------------ *
 *  Single-column PRIMARY KEY utility (non-id, non-$table->id())       *
 * ------------------------------------------------------------------ */
const singlePrimaryRule: Rule = {
   /** utility-only → doesn’t replace the column’s normal render */
   utility: true,

   test(def, allDefs, dmmf) {
      // already handled once for this column?
      if (def.ignoreSinglePK) return false;

      // must be the *only* @id field in the model
      const pkCols = allDefs.filter(d => d.isId);
      if (pkCols.length !== 1 || !def.isId) return false;

      // skip if the canonical idRule would emit $table->id()
      if (idRule.test(def, allDefs, dmmf)) return false;

      return true; // eligible
   },

   render(def) {
      def.ignoreSinglePK = true;       // block re-runs

      return {
         column: '__single_pk__',       // synthetic anchor
         snippet: [`$table->primary('${def.name}');`],
      };
   },
};

/* ------------------------------------------------------------------ */
/*  Export so you can push them into your resolver’s rule list        */
/* ------------------------------------------------------------------ */


export const rules = [
   // utilities
   singlePrimaryRule,
   compositePrimaryRule,
   indexRule,
   //----
   idRule,
   timestampsRule,
   timestampsTzRule,
   softDeletesRule,
   softDeletesTzRule,
   rememberTokenRule,
   foreignIdRule,
   morphsMergeRule,       // <— added back
   morphsRule,
   nullableMorphsRule,
];