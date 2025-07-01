import { DMMF } from "@prisma/generator-helper";
import { ColumnDefinition } from "./column-definition-types";
import { MigrationTypes } from "./migrationTypes.js";
import { formatDefault } from "../../utils/utils.js";

export interface Rule {
   test(
      def: ColumnDefinition,
      allDefs: ColumnDefinition[],
      dmmf: DMMF.Document
   ): boolean;
   render(
      def: ColumnDefinition,
      allDefs: ColumnDefinition[],
      dmmf: DMMF.Document
   ): Render;
}

export interface Render {
   column: string; snippet: string[]
}

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
   test: (def, allDefs) =>
      [MigrationTypes.bigInteger, MigrationTypes.unsignedBigInteger].includes(
         def.migrationType as any
      ) &&
      def.name.endsWith("_id") &&
      allDefs.some(
         item =>
            item.relationFromFields?.length === 1 &&
            item.relationFromFields.includes(def.name)
      ),
   render: (def, allDefs) => {
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
      if (def.hasDefaultValue) snippet += formatDefault(def);
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
         def.migrationType !== MigrationTypes.unsignedBigInteger ||
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
         def.migrationType !== MigrationTypes.unsignedBigInteger ||
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

/**
 * Fallback renderer: respects def.ignore
 */
function defaultBuild(def: ColumnDefinition): { column: string; snippet: string[] } {
   def.ignore && (def.ignore = true); // leave ignore as set
   let snippet: string[] = [];
   if (!def.ignore) {
      const argsStr = def.args?.length
         ? `, ${def.args.map(a => JSON.stringify(a)).join(", ")}`
         : "";
      let line = `$table->${def.migrationType}('${def.name}'${argsStr})`;
      if (def.unsigned) line += "->unsigned()";
      if (def.nullable) line += "->nullable()";
      if (def.hasDefaultValue) line += formatDefault(def);
      if (def.comment) line += `->comment(${JSON.stringify(def.comment)})`;
      line += ";";
      snippet.push(line);

      if (def.relationship) {
         const { on, references = "id", onDelete, onUpdate } = def.relationship;
         let fk = `$table->foreign('${def.name}')->references('${references}')->on('${on}')`;
         if (onDelete) fk += `->onDelete('${onDelete}')`;
         if (onUpdate) fk += `->onUpdate('${onUpdate}')`;
         fk += ";";
         snippet.push(fk);
      }
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
      const method: 'morphs' | 'nullableMorphs' | 'uuidMorphs' | 'nullableUuidMorphs' | 'ulidMorphs' | 'nullableUlidMorphs' =
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

export {
   idRule,
   timestampsTzRule,
   timestampsRule,
   softDeletesTzRule,
   softDeletesRule,
   rememberTokenRule,
   foreignIdRule,
   morphsMergeRule,       // <— added back
   morphsRule,
   nullableMorphsRule,
   defaultBuild,
};