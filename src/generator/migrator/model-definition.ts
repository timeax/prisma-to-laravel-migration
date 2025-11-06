import { DMMF } from "@prisma/generator-helper";

export type CompositeSpec = {
   fields: string[];
   name?: string;            // Prisma-exposed name (may be client alias)
};

export interface CompositeModelDefinition extends DMMF.Model {
   /** Composite @@unique([...]) (not single-field) */
   compositeUniques: CompositeSpec[];
   /** Composite non-unique @@index([...]) — labeled "normal" per your naming */
   compositeNormals: CompositeSpec[];
}

export function buildCompositeFromIndexes(model: DMMF.Model): CompositeModelDefinition {
   type RawIx = {
      fields: string[];
      name?: string;
      type?: "id" | "unique" | "index" | string; // some DMMFs provide this
      isUnique?: boolean;                         // others use this flag
      isDefinedOnField?: boolean;                 // true for single-field, skip
   };

   const raw: RawIx[] = ((model as any).indexes ?? []) as RawIx[];

   const isComposite = (i: RawIx) =>
      Array.isArray(i.fields) && i.fields.length > 1 && i.isDefinedOnField !== true;

   const isPk = (i: RawIx) => {
      const t = (i.type || "").toLowerCase();
      return t === "id" || t === "primary";
   };

   const isUnique = (i: RawIx) =>
      (typeof i.type === "string" && i.type.toLowerCase() === "unique") || i.isUnique === true;

   const uniques: CompositeSpec[] = [];
   const normals: CompositeSpec[] = [];

   for (const i of raw) {
      if (!isComposite(i) || isPk(i)) continue;
      const spec: CompositeSpec = { fields: i.fields, name: i.name };
      (isUnique(i) ? uniques : normals).push(spec);
   }

   // de-dupe by ordered field list (ignore name for dedupe)
   const dedupe = (xs: CompositeSpec[]) => {
      const seen = new Set<string>();
      return xs.filter(x => {
         const key = x.fields.join("|");
         if (seen.has(key)) return false;
         seen.add(key);
         return true;
      });
   };

   return {
      ...(model as any),
      compositeUniques: dedupe(uniques),
      compositeNormals: dedupe(normals),
   } as CompositeModelDefinition;
}

/** Optional: build for all models in a DMMF document */
export function buildAllCompositeFromIndexes(doc: DMMF.Document): Record<string, CompositeModelDefinition> {
   const out: Record<string, CompositeModelDefinition> = {};
   for (const m of doc.datamodel.models) out[m.name] = buildCompositeFromIndexes(m);
   return out;
}