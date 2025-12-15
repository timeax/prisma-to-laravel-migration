
/* ------------------------ rendering (PHP method) ------------------------- */

import { RelationDefinition, RelationKind } from "./types";

type TemplateOptions = {
   useCompoships?: boolean; // default: read global._config?.model?.awobaz
   indent?: string;         // default "    "
};

const asArrayPhp = (xs: readonly string[]) =>
   `[${xs.map((x) => `'${x}'`).join(", ")}]`;
const firstOrUndef = (xs?: readonly string[]) =>
   xs && xs.length ? `'${xs[0]}'` : undefined;

export function relationTemplate(
   def: RelationDefinition,
   opts: TemplateOptions = {}
): string {
   const indent = opts.indent ?? "    ";
   const usingCompoships = opts.useCompoships ?? !!(global as any)?._config?.model?.awobaz;

   const args: string[] = [];
   let method: RelationKind = def.type;

   // 1) Base arg (morph vs class)
   if (def.type.startsWith("morph")) {
      const morphArg = `'${def.morphType ?? def.name}'`;
      args.push(morphArg);

      // owner-side morphs (need modelClass as first arg except morphTo)
      if (def.type !== "morphTo") {
         args.unshift(def.modelClass); // Target::class, 'name'
      }
   } else {
      args.push(def.modelClass);
   }

   // 2) Per-kind specifics
   if (def.type === "belongsTo" || def.type === "hasOne" || def.type === "hasMany") {
      const fk = def.foreignKey ? [...def.foreignKey] : [];
      const lk = def.localKey ? [...def.localKey] : [];

      if (usingCompoships && (fk.length > 1 || lk.length > 1)) {
         args.push(asArrayPhp(fk), asArrayPhp(lk));
      } else {
         const a = firstOrUndef(fk);
         const b = firstOrUndef(lk);
         if (a) args.push(a);
         if (b) args.push(b);
      }
   }

   if (def.type === "belongsToMany") {
      const table = def.pivotTable ? `'${def.pivotTable}'` : undefined;

      if (def.mode === "explicit") {
         const pl = def.pivotLocal ? [...def.pivotLocal] : [];
         const pf = def.pivotForeign ? [...def.pivotForeign] : [];
         const lk = def.localKey ? [...def.localKey] : [];
         const fk = def.foreignKey ? [...def.foreignKey] : [];

         // Laravel can't express composite pivot keys fully; include what we can
         if (table) args.push(table);

         if (pl.length === 1 && pf.length === 1 && lk.length === 1 && fk.length === 1) {
            args.push(`'${pl[0]}'`, `'${pf[0]}'`, `'${lk[0]}'`, `'${fk[0]}'`);
         } else {
            // leave keys implicit; consider generating a Pivot model if you need composites here
         }
      } else {
         if (table) args.push(table);
      }
   }

   if (def.type === "morphOne" || def.type === "morphMany" || def.type === "morphToMany" || def.type === "morphedByMany") {
      // signature: morphX(Target::class, 'name', table?)
      if (def.pivotTable && (def.type === "morphToMany" || def.type === "morphedByMany")) {
         // ensure order: Target::class, 'name', 'table'
         // args already have [Target::class, 'name']
         args.push(`'${def.pivotTable}'`);
      }
   }

   const raw = def.rawChain ? `->${def.rawChain.replace(/^\s*->/, "")}` : "";

   const lines = [
      `public function ${def.name}()`,
      `{`,
      `${indent}return $this->${method}(${args.join(", ")})${raw};` +
      (def.pivotTable && def.type === "belongsToMany" ? ` // pivot: ${def.pivotTable}` : ""),
      `}`,
      ``,
   ];

   return lines.join("\n");
}