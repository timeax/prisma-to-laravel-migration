// generator/ts/generator.ts
import type {DMMF} from "@prisma/generator-helper";
import type {TypesConfig} from "./index.js";
import {
    TsEnumDefinition,
    TsModelDefinition,
    TsModelField,
    TsAppendProperty,
    TsImport,
} from "./types.js";
import {
    getFieldTypeDirective,
    getModelTypeDirective,
    getModelAppendsDirective,
} from "./directives.js";
import {listFrom, stripDirectives} from "@/utils/utils";
import {buildRelationsForModel} from "@/generator/lib/relationship";

export class PrismaToTypesGenerator {
    constructor(
        private readonly dmmf: DMMF.Document,
        private readonly cfg: TypesConfig
    ) {
    }

    generateAll(): { models: TsModelDefinition[]; enums: TsEnumDefinition[] } {
        const models = this.dmmf.datamodel.models.map((model) =>
            this.buildModelDefinition(model)
        );

        const enums = this.dmmf.datamodel.enums.map(
            (e): TsEnumDefinition => ({
                name: e.name,
                values: e.values.map((v) => v.name),
                doc: e.documentation ?? "",
            })
        );

        return {models, enums};
    }

    /**
     * Where should models import enums from?
     *
     * You can add `enumImportFrom?: string` to TypesConfig; if not set,
     * we default to "./enums".
     */
    private getEnumImportFrom(): string {
        const anyCfg = this.cfg as TypesConfig & {
            enumImportFrom?: string;
        };
        return anyCfg.enumImportFrom ?? "./enums";
    }

    /**
     * Quick check for a @with directive on a relation field.
     * If present, we treat the relation as "eager" and keep it required.
     */
    private hasWithDirective(field: DMMF.Field): boolean {
        if (!field.documentation) return false;
        // very small heuristic; you can tighten this later in directives.ts
        return /@with\b/.test(field.documentation);
    }

    /**
     * Detect morph child pairs on a model:
     *   <base>_id   +   <base>_type
     *
     * Returns the list of `base` names, e.g. ["commentable", "imageable"].
     * This matches the polymorphic rules in the README:
     * child-side `morphTo` is auto-detected from scalar pairs.
     */
    private getMorphBases(model: DMMF.Model): string[] {
        const hasId: Set<string> = new Set();
        const hasType: Set<string> = new Set();

        for (const field of model.fields) {
            if (field.kind !== "scalar") continue;

            if (field.name.endsWith("_id")) {
                const base = field.name.slice(0, -3); // remove "_id"
                if (base) hasId.add(base);
            } else if (field.name.endsWith("_type")) {
                const base = field.name.slice(0, -5); // remove "_type"
                if (base) hasType.add(base);
            }
        }

        const bases: string[] = [];
        for (const base of hasId) {
            if (hasType.has(base)) {
                bases.push(base);
            }
        }
        return bases;
    }

    private buildModelDefinition(model: DMMF.Model): TsModelDefinition {
        const importsMap = new Map<string, Set<string>>();
        const enumNames = new Set<string>(); // enums used by this model

        const containsWith = (name: string) =>
            listFrom(model.documentation ?? "", "with").includes(name);

        // Model-level @hidden{fieldA,fieldB}
        const hiddenFromModel = new Set(
            listFrom(model.documentation ?? "", "hidden")
                .map((n) => n.trim())
                .filter(Boolean)
        );

        const relationships: TsModelField[] = buildRelationsForModel(this.dmmf, model).map((rel) => {
            // Determine cardinality
            const isMany = (
                rel.type === "hasMany" ||
                rel.type === "belongsToMany" ||
                rel.type === "morphMany" ||
                rel.type === "morphToMany" ||
                rel.type === "morphedByMany"
            );

            // Build TS type
            const readonlyArrays = !!(this.cfg as any).readonlyArrays;
            const wrapList = (base: string) =>
                isMany
                    ? (readonlyArrays ? `ReadonlyArray<${base}>` : `${base}[]`)
                    : base;

            let tsType: string;
            if (rel.type === "morphTo") {
                // morphTo can point to different models → untyped
                tsType = "any";
            } else {
                const target = rel.targetModelName ?? "any";
                // Handle belongsToMany with pivot columns: intersect element type with pivot shape
                if (rel.pivotColumns) {
                    const pivotCols: string[] = rel.pivotColumns as any;
                    const pivotTable: string | undefined = rel.pivotTable;

                    // resolve pivot model by dbName or name
                    const pivotModel = pivotTable
                        ? this.dmmf.datamodel.models.find(
                            (m) => (m.dbName ?? m.name) === pivotTable
                        )
                        : undefined;

                    const pivotProps: string[] = [];
                    for (const col of pivotCols) {
                        let colTs = "any";
                        const f = pivotModel?.fields.find((pf) => pf.name === col);
                        if (f && f.kind !== "object" && f.kind !== "enum") {
                            // map scalar prisma type to TS
                            colTs = this.mapPrismaTypeToTs(f as any);
                        } else if (f && f.kind === "enum") {
                            // enums on pivot are also supported
                            colTs = this.mapPrismaTypeToTs(f as any);
                            // ensure enum is imported for this model
                            enumNames.add(f.type as string);
                        }
                        // property: 'col': type
                        const propName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col) ? col : JSON.stringify(col);
                        pivotProps.push(`${propName}: ${colTs}`);
                    }

                    const pivotShape = pivotProps.length ? `{ ${pivotProps.join("; ")} }` : "{}";
                    const elementType = pivotShape ? `(${target} & ${pivotShape})` : target;
                    tsType = wrapList(elementType);
                } else {
                    tsType = wrapList(target);
                }
            }

            // Optionality: relations are optional unless explicitly eager-loaded via @with
            let optional = true;
            if (containsWith(rel.name)) {
                optional = false;
            } else {
                // Try to find the original relation field to inspect its documentation
                const objField = model.fields.find(
                    (f) =>
                        f.kind === "object" &&
                        (f.name === rel.name || f.name.replace(/Id$/, "") === rel.name)
                );
                if (objField && this.hasWithDirective(objField)) {
                    optional = false;
                }
            }

            return {
                name: rel.name,
                type: tsType,
                optional,
                isList: isMany,
            } as TsModelField;
        });

        // 1) Field-level definitions
        const fields: TsModelField[] = model.fields.filter(item => item.kind !== 'object').map((field) => {
            const doc = field.documentation ?? "";

            // base inferred type (from prisma)
            let tsType = this.mapPrismaTypeToTs(field);

            // field-level @type override
            const typeDirective = getFieldTypeDirective(field);
            if (typeDirective) {
                tsType = typeDirective.type;

                if (typeDirective.import) {
                    const existing =
                        importsMap.get(typeDirective.import) ?? new Set<string>();
                    existing.add(typeDirective.type);
                    importsMap.set(typeDirective.import, existing);
                }
            } else {
                // No @type override → if this is an enum, remember it
                if (field.kind === "enum") {
                    // field.type is the enum name (e.g. "UserStatus")
                    enumNames.add(field.type);
                }
            }

            // ---- @hidden detection ------------------------------------
            // 1) field-level: "/// @hidden" or "/// @hidden{...}"
            const hiddenInline =
                /(^|\s)@hidden(\b|[{(])/m.test(doc) ||
                listFrom(doc, "hidden").includes(field.name);

            // 2) model-level list
            const hiddenByModel = hiddenFromModel.has(field.name);

            const isHidden = hiddenInline || hiddenByModel;

            return {
                name: field.name,
                type: tsType,
                // Relations: optional by default (navigation props),
                // unless @with says "this is always loaded".
                // Non-relations: keep Prisma's required flag semantics.
                optional: !field.isRequired,
                isList: field.isList,
                isId: field.isId,
                isGenerated: !!field.isGenerated,
                isUpdatedAt: !!field.isUpdatedAt,
                // used by the TS printer to drop @hidden from the public shape
                hidden: isHidden,
            } as TsModelField;
        });

        // 2) Model-level @type for extra imports (does not define fields)
        const modelTypeDirective = getModelTypeDirective(model);
        if (modelTypeDirective && modelTypeDirective.import) {
            const existing =
                importsMap.get(modelTypeDirective.import) ?? new Set<string>();
            existing.add(modelTypeDirective.type);
            importsMap.set(modelTypeDirective.import, existing);
        }

        // 3) Model-level @appends(...) → extra computed properties
        const appendsDirective = getModelAppendsDirective(model);
        const appends: TsAppendProperty[] = [];

        if (appendsDirective) {
            for (const entry of appendsDirective.entries) {
                appends.push({
                    name: entry.name,
                    // If a type is provided, use it; otherwise fallback to `any`
                    type: entry.type ?? "any",
                });
            }
        }

        // 4) Morph child pairs → auto-append relation-like properties
        //
        // For each detected base (e.g. "commentable" from commentable_id + commentable_type),
        // we add an appended TS property:
        //
        //    commentable?: any
        //
        // unless the user already declared it via @appends{commentable: ...}.
        const morphBases = this.getMorphBases(model);

        if (morphBases.length > 0) {
            const existingNames = new Set(appends.map((a) => a.name));
            for (const base of morphBases) {
                if (existingNames.has(base)) continue; // don't clobber typed @appends
                appends.push({
                    name: base,
                    type: "any",
                });
            }
        }

        // 5) Enums used by this model → import from enums file
        if (enumNames.size > 0) {
            const enumFrom = this.getEnumImportFrom();
            const existing = importsMap.get(enumFrom) ?? new Set<string>();

            for (const enumName of enumNames) {
                existing.add(enumName);
            }

            importsMap.set(enumFrom, existing);
        }

        // 6) Normalize imports
        const imports: TsImport[] = Array.from(importsMap.entries()).map(
            ([from, types]) => ({
                from,
                types: Array.from(types).sort(),
            })
        );

        return {
            name: model.name,
            fields: [...fields, ...relationships],
            appends,
            imports,
            // strip directives from doc so TS header comment stays clean
            doc: stripDirectives(model.documentation),
        };
    }

    /**
     * Prisma → TS mapping, overridable via @type.
     *
     * - Scalars → TS primitives (you can later swap to cfg.scalarMap).
     * - Enums   → enum name (imported via enums file).
     * - Objects → related model name (relation), with list handling.
     */
    private mapPrismaTypeToTs(field: DMMF.Field): string {
        const readonlyArrays = !!(this.cfg as any).readonlyArrays;

        const wrapList = (base: string) =>
            field.isList
                ? readonlyArrays
                    ? `ReadonlyArray<${base}>`
                    : `${base}[]`
                : base;

        // Scalar fields
        if (field.kind === "scalar") {
            let base: string;
            switch (field.type) {
                case "Int":
                case "BigInt":
                case "Float":
                case "Decimal":
                    base = "number";
                    break;
                case "Boolean":
                    base = "boolean";
                    break;
                case "String":
                    base = "string";
                    break;
                case "DateTime":
                    base = "string"; // you can later map to Date via scalarMap
                    break;
                case "Json":
                    base = "string"; // or unknown / Record<string,any> via scalarMap
                    break;
                default:
                    base = "any";
            }
            return wrapList(base);
        }

        // Enums → use enum name directly (imported via getEnumImportFrom)
        if (field.kind === "enum") {
            return wrapList(field.type as string);
        }
        // Fallback
        return wrapList("any");
    }
}