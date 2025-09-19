import { DMMF } from "@prisma/generator-helper";
import {
   RelationDefinition,
   ListRelationKeys,
   objRels,
   scalarNames,
   getModel,
   dbNameOf,
   conventionalPivotName,
   getPrimaryKeyFields,
   hasIntersection,
   isUniqueOn,
   PIVOT_SCALAR_WHITELIST,
} from "./types.js";
import { detectMorphToRelations, parseMorphOwnerDirectives } from "./morph.js";
import { isForModel, parseLocalDirective } from "../../../utils/utils.js";

/* ------------------ pivot relevance (explicit M:N) ----------------------- */
const pivotOtherEndpointFor = (
   thisModelName: string,
   candidate: DMMF.Model
): string | undefined => {
   const rels = objRels(candidate);
   if (rels.length !== 2) return undefined;
   if (!rels.every((r) => (r.relationFromFields?.length ?? 0) > 0)) return undefined;

   const relToMe = rels.find((r) => r.type === thisModelName);
   if (!relToMe) return undefined;
   const relOther = rels.find((r) => r !== relToMe)!;

   const fkA = relToMe.relationFromFields ?? [];
   const fkB = relOther.relationFromFields ?? [];
   if (hasIntersection(fkA, fkB)) return undefined;

   const fkUnion = new Set([...fkA, ...fkB]);
   const extras = scalarNames(candidate).filter(
      (n) => !fkUnion.has(n) && !PIVOT_SCALAR_WHITELIST.has(n)
   );
   if (extras.length > 0) return undefined;

   return relOther.type; // self-join allowed
};

/* ---------------- list-style key extractor (names only) ------------------ */
export function extractListRelationKeys(
   dmmf: DMMF.Document,
   model: DMMF.Model,
   field: DMMF.Field
): ListRelationKeys | null {
   if (!field.isList) return null;

   const related = getModel(dmmf, field.type);
   const thisTable = dbNameOf(model);
   const relatedTable = dbNameOf(related);

   const counterpart = related.fields.find(
      (r) =>
         r.kind === "object" &&
         r.relationName === field.relationName &&
         r.type === model.name
   );

   const thisOwnsFK = (field.relationFromFields?.length ?? 0) > 0;
   const otherOwnsFK = (counterpart?.relationFromFields?.length ?? 0) > 0;

   const isImplicitM2M =
      !!(counterpart?.isList && !thisOwnsFK && !otherOwnsFK);

   if (isImplicitM2M) {
      return {
         kind: "belongsToMany",
         mode: "implicit",
         target: related.name,
         pivotTable: conventionalPivotName(thisTable, relatedTable),
         local: getPrimaryKeyFields(model),
         foreign: getPrimaryKeyFields(related),
      };
   }

   const otherEndpointType = pivotOtherEndpointFor(model.name, related);
   if (otherEndpointType) {
      const pivot = related;
      const target = getModel(dmmf, otherEndpointType);
      const rels = objRels(pivot);
      const relToMe = rels.find((r) => r.type === model.name)!;
      const relToThem = rels.find((r) => r.type === target.name)!;

      return {
         kind: "belongsToMany",
         mode: "explicit",
         target: target.name,
         pivotTable: dbNameOf(pivot),
         pivotLocal: relToMe.relationFromFields ?? [],
         pivotForeign: relToThem.relationFromFields ?? [],
         local: relToMe.relationToFields ?? [],
         foreign: relToThem.relationToFields ?? [],
      };
   }

   if (counterpart && otherOwnsFK) {
      return {
         kind: "hasMany",
         target: related.name,
         foreign: counterpart.relationFromFields ?? [],
         local: counterpart.relationToFields ?? [],
      };
   }

   return null;
}

/* ------------------ public: build all relations for model ---------------- */
export function buildRelationsForModel(
   dmmf: DMMF.Document,
   model: DMMF.Model
): RelationDefinition[] {
   const defs: RelationDefinition[] = [];

   // object relations (belongsTo / hasOne / hasMany / belongsToMany)
   for (const f of model.fields) {
      if (f.kind !== "object" || !f.relationName) continue;
      if (isForModel(parseLocalDirective(f.documentation ?? ""))) continue;

      if (f.isList) {
         const keys = extractListRelationKeys(dmmf, model, f);
         if (!keys) continue;

         if (keys.kind === "hasMany") {
            defs.push({
               name: f.name.replace(/Id$/, ""),
               type: "hasMany",
               modelClass: `${keys.target}::class`,
               foreignKey: keys.foreign,
               localKey: keys.local,
               targetModelName: keys.target,
            });
         } else if (keys.kind === "belongsToMany" && keys.mode === "explicit") {
            defs.push({
               name: f.name.replace(/Id$/, ""),
               type: "belongsToMany",
               mode: "explicit",
               modelClass: `${keys.target}::class`,
               pivotTable: keys.pivotTable,
               pivotLocal: keys.pivotLocal,
               pivotForeign: keys.pivotForeign,
               localKey: keys.local,
               foreignKey: keys.foreign,
               targetModelName: keys.target,
            });
         } else if (keys.kind === "belongsToMany" && keys.mode === "implicit") {
            defs.push({
               name: f.name.replace(/Id$/, ""),
               type: "belongsToMany",
               mode: "implicit",
               modelClass: `${keys.target}::class`,
               pivotTable: keys.pivotTable,
               localKey: keys.local,
               foreignKey: keys.foreign,
               targetModelName: keys.target,
            });
         }

         continue;
      }

      // non-list → belongsTo / hasOne(?)/hasMany
      const related = getModel(dmmf, f.type);
      const counterpart = related.fields.find(
         (r) =>
            r.kind === "object" &&
            r.relationName === f.relationName &&
            r.type === model.name
      );

      const thisOwnsFK = (f.relationFromFields?.length ?? 0) > 0;
      const otherOwnsFK = (counterpart?.relationFromFields?.length ?? 0) > 0;

      if (thisOwnsFK) {
         defs.push({
            name: f.name.replace(/Id$/, ""),
            type: "belongsTo",
            modelClass: `${f.type}::class`,
            foreignKey: f.relationFromFields ?? [],
            localKey: f.relationToFields ?? [],
            targetModelName: f.type,
         });
         continue;
      }

      const counterpartIsSingle = counterpart ? !counterpart.isList : false;
      const uniqueOnOther = counterpart
         ? isUniqueOn(related, counterpart.relationFromFields ?? [])
         : false;

      if (otherOwnsFK && counterpartIsSingle) {
         defs.push({
            name: f.name.replace(/Id$/, ""),
            type: "hasOne",
            modelClass: `${f.type}::class`,
            foreignKey: counterpart!.relationFromFields ?? [],
            localKey: counterpart!.relationToFields ?? [],
            targetModelName: f.type,
         });
         continue;
      }

      if (otherOwnsFK) {
         defs.push({
            name: f.name.replace(/Id$/, ""),
            type: "hasMany",
            modelClass: `${f.type}::class`,
            foreignKey: counterpart!.relationFromFields ?? [],
            localKey: counterpart!.relationToFields ?? [],
            targetModelName: f.type,
         });
         continue;
      }
   }

   // child-side morphTo (auto)
   const detectedMorphTo = detectMorphToRelations(model);
   const existing = new Set(defs.map((d) => d.name));
   for (const m of detectedMorphTo) {
      if (!existing.has(m.name)) defs.push(m);
   }

   // owner-side morphs via @morph(...)
   const ownerMorphs = parseMorphOwnerDirectives(model);
   for (const m of ownerMorphs) {
      if (!existing.has(m.name)) defs.push(m);
   }

   return defs;
}
// ---- targets -------------------------------------------------