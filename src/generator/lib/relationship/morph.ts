import { DMMF } from "@prisma/generator-helper";
import {
  RelationDefinition,
  scalarNames,
} from "./types";

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
function* extractMorphBodies(doc: string): Generator<string> {
  const tag = /@morph\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = tag.exec(doc))) {
    let i = tag.lastIndex; // after '('
    let depth = 1;
    let inS = false, inD = false, esc = false;
    let body = '';

    for (; i < doc.length; i++) {
      const ch = doc[i];

      if (esc) { body += ch; esc = false; continue; }
      if (ch === '\\') { // escape only inside quotes
        if (inS || inD) { esc = true; body += ch; continue; }
      }

      if (inD) { if (ch === '"') inD = false; body += ch; continue; }
      if (inS) { if (ch === "'") inS = false; body += ch; continue; }

      if (ch === '"') { inD = true; body += ch; continue; }
      if (ch === "'") { inS = true; body += ch; continue; }
      if (ch === '(') { depth++; body += ch; continue; }
      if (ch === ')') {
        depth--;
        if (depth === 0) break; // end of this @morph(...)
        body += ch; continue;
      }

      body += ch;
    }

    yield body.trim();
    // tag.lastIndex stays after the '(', loop continues scanning
  }
}

function splitTopLevelArgs(body: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depth = 0, inS = false, inD = false, esc = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { if (inS || inD) { esc = true; cur += ch; continue; } }

    if (inD) { if (ch === '"') inD = false; cur += ch; continue; }
    if (inS) { if (ch === "'") inS = false; cur += ch; continue; }

    if (ch === '"') { inD = true; cur += ch; continue; }
    if (ch === "'") { inS = true; cur += ch; continue; }
    if (ch === '(') { depth++; cur += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); cur += ch; continue; }

    if (ch === ',' && depth === 0) {
      parts.push(cur.trim()); cur = '';
      continue;
    }

    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseKvList(parts: string[]): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const p of parts) {
    const m = p.match(/^(\w+)\s*:\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    kv[key] = val;
  }
  return kv;
}
/**
 * Parse model-level documentation directives:
 *   /// @morph(name: commentable, type: many|one|to many|by many, model: Comment, table:"taggables", raw:"latest()")
 * Optional: as: comments, idField: commentable_id, typeField: commentable_type
 */
export function parseMorphOwnerDirectives(model: DMMF.Model): RelationDefinition[] {
  const doc = model.documentation ?? '';
  const out: RelationDefinition[] = [];

  for (const body of extractMorphBodies(doc)) {
    const parts = splitTopLevelArgs(body);
    const kv = parseKvList(parts);

    const base = kv['name'];
    const typeRaw = (kv['type'] ?? '').toLowerCase().replace(/\s+/g, '');
    const modelName = kv['model'];
    const table = kv['table'];
    const rawChain = kv['raw'];
    const alias = kv['as'];
    const idField = kv['idfield'];
    const typeField = kv['typefield'];

    if (!base || !typeRaw || !modelName) continue;

    let kind: 'morphOne' | 'morphMany' | 'morphToMany' | 'morphedByMany';
    switch (typeRaw) {
      case 'one': kind = 'morphOne'; break;
      case 'many': kind = 'morphMany'; break;
      case 'tomany': kind = 'morphToMany'; break;
      case 'bymany': kind = 'morphedByMany'; break;
      default: continue;
    }

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
  const base = modelName[0].toLowerCase() + modelName.slice(1);
  // naive pluralization: add 's'
  return kind === 'morphOne' ? base : (base.endsWith('s') ? base : base + 's');
}
