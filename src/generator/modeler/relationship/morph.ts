import { DMMF } from "@prisma/generator-helper";
import {
  RelationDefinition,
  scalarNames,
} from "./types.js";

/* ----------------------------- Morph config ------------------------------ */

type MorphConfig = {
  idSuffix?: string;   // default "_id"
  typeSuffix?: string; // default "_type"
};

const MORPH_DEFAULTS: Required<MorphConfig> = {
  idSuffix: "_id",
  typeSuffix: "_type",
};

const morphCfg = () =>
  ({ ...MORPH_DEFAULTS, ...((global as any)?._config?.model?.morph ?? {}) });

/* ------------------------- Child-side: morphTo --------------------------- */
/** Auto-detect morphTo by scanning scalar column pairs: base_id + base_type */
export function detectMorphToRelations(model: DMMF.Model): RelationDefinition[] {
  const { idSuffix, typeSuffix } = morphCfg();
  const scalars = model.fields.filter((f) => f.kind === "scalar").map((f) => f.name);
  const S = new Set(scalars);

  const defs: RelationDefinition[] = [];

  for (const name of scalars) {
    if (!name.endsWith(idSuffix)) continue;
    const base = name.slice(0, -idSuffix.length);
    const typeField = `${base}${typeSuffix}`;
    if (!S.has(typeField)) continue;

    defs.push({
      name: base,          // method name: e.g. commentable() → morphTo('commentable')
      type: "morphTo",
      modelClass: "",      // unused for morphTo
      morphType: base,
      morphIdField: `${base}${idSuffix}`,
      morphTypeField: typeField,
    });
  }
  return defs;
}

/* ------------------------ Owner-side: @morph(...) ------------------------ */
/**
 * Parse model-level documentation directives:
 *   /// @morph(name: commentable, type: many|one|to many|by many, model: Comment, table:"taggables", raw:"latest()")
 * Optional: as: comments, idField: commentable_id, typeField: commentable_type
 */
export function parseMorphOwnerDirectives(model: DMMF.Model): RelationDefinition[] {
  const doc = model.documentation ?? "";
  const rx = /@morph\s*\(([^)]+)\)/g;
  const out: RelationDefinition[] = [];

  for (let m: RegExpExecArray | null; (m = rx.exec(doc)); ) {
    const body = m[1];

    // naive key:value parser supporting quoted strings
    const parts = body.split(",").map((s) => s.trim());
    const kv: Record<string, string> = {};
    for (const p of parts) {
      const mm = p.match(/^(\w+)\s*:\s*(.+)$/);
      if (!mm) continue;
      let key = mm[1].toLowerCase();
      let val = mm[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      kv[key] = val;
    }

    const base = kv["name"];              // morph base (commentable, taggable, etc.)
    const typeRaw = (kv["type"] ?? "").toLowerCase().replace(/\s+/g, "");
    const modelName = kv["model"];        // target eloquent model (e.g. Comment)
    const table = kv["table"];            // pivot table for toMany/byMany
    const rawChain = kv["raw"];           // extra chain
    const alias = kv["as"];               // method name override
    const idField = kv["idfield"];
    const typeField = kv["typefield"];

    if (!base || !typeRaw || !modelName) continue;

    // normalize type
    let kind: "morphOne" | "morphMany" | "morphToMany" | "morphedByMany";
    switch (typeRaw) {
      case "one":
        kind = "morphOne"; break;
      case "many":
        kind = "morphMany"; break;
      case "tomany":
        kind = "morphToMany"; break;
      case "bymany":
        kind = "morphedByMany"; break;
      default:
        continue;
    }

    // method name: explicit alias or crude derivation from model
    const method = alias ?? deriveMethodName(modelName, kind);

    out.push({
      name: method,
      type: kind,
      modelClass: `${modelName}::class`,
      morphType: base,
      morphIdField: idField,
      morphTypeField: typeField,
      pivotTable: table,
      rawChain,
      targetModelName: modelName,
    });
  }

  return out;
}

/* very light method-name derivation (pluralizes for "many" kinds) */
function deriveMethodName(modelName: string, kind: string): string {
  const base = modelName.slice(0, 1).toLowerCase() + modelName.slice(1);
  if (kind === "morphOne") return base;
  // naive pluralization: add 's'
  return base.endsWith("s") ? base : base + "s";
}