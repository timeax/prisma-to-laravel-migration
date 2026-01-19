// noinspection JSUnusedLocalSymbols

import { DMMF } from "@prisma/generator-helper";
import {
    RelationDefinition,
    ListRelationKeys,
    objRels,
    getModel,
    dbNameOf,
    conventionalPivotName,
    getPrimaryKeyFields,
    hasIntersection,
    isUniqueOn,
} from "./types";
import { detectMorphToRelations, parseMorphOwnerDirectives } from "./morph";
import { isForModel, listFrom, parseLocalDirective } from "@/utils/utils";

/* ------------------ pivot relevance (explicit M:N) ----------------------- */
const pivotOtherEndpointFor = (
    thisModelName: string,
    candidate: DMMF.Model
): string | undefined => {

    if ((candidate.documentation?.includes("@entity"))) {
        const entities = listFrom(candidate.documentation ?? "", "entity");
        if (entities.length === 0) return undefined;
        if (entities.includes(thisModelName)) return undefined;
    }

    // Only relations that actually own FKs
    const rels = objRels(candidate).filter(
        (r) => (r.relationFromFields?.length ?? 0) > 0
    );

    // Must have exactly one relation pointing to "me"
    const relsToMe = rels.filter((r) => r.type === thisModelName);
    if (relsToMe.length !== 1) return undefined;
    const relToMe = relsToMe[0];

    const fkA = relToMe.relationFromFields ?? [];

    // Candidate "other" relations: different type, disjoint FKs, unique FK union
    const otherCandidates = rels.filter((r) => {
        if (r === relToMe) return false;
        const fkB = r.relationFromFields ?? [];
        if (hasIntersection(fkA, fkB)) return false;

        const fkUnion = [...new Set([...fkA, ...fkB])];
        // Require that [fkA ∪ fkB] is unique on this model (PK or unique)
        return isUniqueOn(candidate, fkUnion);
    });

    // Ambiguous or no clean pair → not a pivot for thisModelName
    if (otherCandidates.length !== 1) return undefined;

    const relOther = otherCandidates[0];

    // "Other endpoint" type (self-join allowed)
    return relOther.type;
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

    // ---------------- implicit M2M: unchanged ----------------
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

    // ---------------- explicit M2M via pivot -----------------
    const otherEndpointType = pivotOtherEndpointFor(model.name, related);
    if (otherEndpointType) {
        const pivot = related; // pivot model
        const target = getModel(dmmf, otherEndpointType);
        const rels = objRels(pivot);
        const relToMe = rels.find((r) => r.type === model.name)!;
        const relToThem = rels.find((r) => r.type === target.name)!;

        // FK-ish fields we NEVER treat as pivotColumns (even if user writes @pivot on them)
        const keyFieldNames = new Set<string>([
            ...(relToMe.relationFromFields ?? []),
            ...(relToMe.relationToFields ?? []),
            ...(relToThem.relationFromFields ?? []),
            ...(relToThem.relationToFields ?? []),
        ]);

        const pivotDoc = pivot.documentation ?? "";

        // 1) Model-level pivot cols: @pivot(meta, flags, ...)
        const modelPivotNames = listFrom(pivotDoc, "pivot"); // ['meta', 'flags', ...]

        // 2) Field-level: scalar fields with @pivot in their own docs
        const fieldPivotNames = pivot.fields
            .filter(
                (f) =>
                    f.kind === "scalar" &&
                    !!f.documentation &&
                    /@pivot\b/i.test(f.documentation)
            )
            .map((f) => f.name);

        // 3) Only allow names that are real scalar fields and not FK columns
        const scalarFieldNames = new Set(
            pivot.fields
                .filter((f) => f.kind === "scalar")
                .map((f) => f.name)
        );

        const pivotColumns = [...new Set([...modelPivotNames, ...fieldPivotNames])]
            .filter((name) => scalarFieldNames.has(name))
            .filter((name) => !keyFieldNames.has(name));

        // 4) @withTimestamps is a pure flag: "call ->withTimestamps()"
        const withTimestamps = /@withTimestamps\b/i.test(pivotDoc);

        // 5) @pivotAlias(name) for optional alias - take the first name from listFrom
        const pivotAliasNames = listFrom(pivotDoc, "pivotAlias");
        const pivotAlias = pivotAliasNames.length > 0 ? pivotAliasNames[0].trim() || undefined : undefined;

        return {
            kind: "belongsToMany",
            mode: "explicit",
            target: target.name,
            pivotTable: dbNameOf(pivot),
            pivotAlias,
            pivotColumns,
            withTimestamps,
            pivotLocal: relToMe.relationFromFields ?? [],
            pivotForeign: relToThem.relationFromFields ?? [],
            local: relToMe.relationToFields ?? [],
            foreign: relToThem.relationToFields ?? [],
        };
    }

    // ---------------- hasMany fallback -----------------------
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
                const chainParts: string[] = [];

                // 1) alias first: ->as('alias')
                if (keys.pivotAlias) {
                    chainParts.push(`as('${keys.pivotAlias}')`);
                }

                // 2) withPivot(...)
                if (keys.pivotColumns && keys.pivotColumns.length > 0) {
                    const cols = keys.pivotColumns.map((c) => `'${c}'`).join(", ");
                    chainParts.push(`withPivot(${cols})`);
                }

                // 3) withTimestamps()
                if (keys.withTimestamps) {
                    chainParts.push("withTimestamps()");
                }

                const rawChain = chainParts.length ? chainParts.join("->") : "";

                defs.push({
                    name: (f.dbName ?? f.name).replace(/Id$/, ""),
                    type: "belongsToMany",
                    mode: "explicit",
                    modelClass: `${keys.target}::class`,
                    pivotTable: keys.pivotTable,
                    pivotLocal: keys.pivotLocal,
                    pivotForeign: keys.pivotForeign,
                    pivotColumns: keys.pivotColumns,
                    withTimestamps: keys.withTimestamps,
                    pivotAlias: keys.pivotAlias,      // <— NEW, if you want it in defs
                    localKey: keys.local,
                    foreignKey: keys.foreign,
                    targetModelName: keys.target,
                    rawChain,
                });
            } else if (keys.kind === "belongsToMany" && keys.mode === "implicit") {
                defs.push({
                    name: (f.dbName ?? f.name).replace(/Id$/, ""),
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
                name: (f.dbName ?? f.name).replace(/Id$/, ""),
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
                name: (f.dbName ?? f.name).replace(/Id$/, ""),
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
                name: (f.dbName ?? f.name).replace(/Id$/, ""),
                type: "hasMany",
                modelClass: `${f.type}::class`,
                foreignKey: counterpart!.relationFromFields ?? [],
                localKey: counterpart!.relationToFields ?? [],
                targetModelName: f.type,
            });
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