import { DMMF } from "@prisma/generator-helper";
import {
    ModelDefinition,
    EnumDefinition,
    PropertyDefinition,
} from "./types";
import { PrismaTypes } from "../migrator/column-maps.js";
import { RelationDefinition } from "@/generator/lib/relationship/types";
import { buildRelationsForModel } from "@/generator/lib/relationship/index.js";
import { getConfig, isForModel, listFrom, parseSilentDirective } from "@/utils/utils";
import { parseAppendsDirective } from "generator/ts/directives";

/**
 * Build ModelDefinition[] + EnumDefinition[] from your DMMF.
 */
export class PrismaToLaravelModelGenerator {
    constructor(private dmmf: DMMF.Document) {
    }

    public primitiveTypes: string[] = [PrismaTypes.BigInt, PrismaTypes.Int, PrismaTypes.String, PrismaTypes.Boolean, PrismaTypes.Bool];

    public generateAll(): {
        models: ModelDefinition[];
        enums: EnumDefinition[];
    } {
        const { namespace: baseNamespace, modelNamespace, enumNamespace } = getConfig('model') ?? {};

        // 1) Extract all Prisma enums into EnumDefinition[]
        const enums: EnumDefinition[] = this.dmmf.datamodel.enums.map((e) => ({
            name: e.name,
            namespace: enumNamespace ?? baseNamespace ?? 'App', // filled in by printer
            values: e.values.map((v) => v.name),
        }));

        // 2) Build each ModelDefinition
        const models: ModelDefinition[] = this.dmmf.datamodel.models.map(model => {
            /* ── 2.1  Model-level directives ──────────────────────────────── */
            const modelDoc = model.documentation ?? "";

            // presence-only flags like @fillable on a field
            const hasToken = (tag: string, doc: string) => new RegExp(`@${tag}\\b`, "i").test(doc);

            // lists can be @tag{a,b}, @tag(a,b), or @tag: a,b
            const modelFillable = listFrom(modelDoc, "fillable");
            const modelHidden = listFrom(modelDoc, "hidden");
            const modelGuarded = listFrom(modelDoc, "guarded");

            // model-level eager-loads
            const modelWith = listFrom(modelDoc, "with");

            /* ── 2.2  Field processing ────────────────────────────────────── */
            const withList: string[] = [...modelWith];         // eager-load bucket
            const guardedSet = new Set(modelGuarded);
            const fillableSet = new Set(modelFillable);
            const hiddenSet = new Set(modelHidden);
            const propImps: string[] = [];

            const properties: PropertyDefinition[] = model.fields.map(field => {
                const doc = field.documentation ?? "";

                // quick helper for boolean flags
                const flag = (tag: string) => hasToken(tag, doc);

                const fillable = flag("fillable") || fillableSet.has(field.name);
                const hidden = flag("hidden") || hiddenSet.has(field.name);
                const guarded = flag("guarded") || guardedSet.has(field.name);
                const ignore = flag("ignore");

                if (flag('with')) {
                    const list = listFrom(doc, 'with');
                    if (list.length) withList.push(`${field.name}:${list.join(',').trim()}`);
                    else withList.push(field.name);
                }

                // custom cast
                const castMatch = doc.match(/@cast\{([^}]+)}/);
                let cast = castMatch ? castMatch[1].trim() : undefined;

                // @type{ import:'x', type:'Y' }
                const typeMatch = doc.match(/@type\{\s*(?:import\s*:\s*'([^']+)')?\s*,?\s*type\s*:\s*'([^']+)'\s*}/);
                const typeAnnotation = typeMatch
                    ? { import: typeMatch[1], type: typeMatch[2] }
                    : undefined;

                const enumMeta = enums.find(e => e.name === field.type);
                let phpType = enumMeta
                    ? enumMeta.name
                    : this.mapPrismaToPhpType(field.type, field.isList, this.primitiveTypes);

                if (phpType === 'mixed' || field.relationFromFields?.length || field.relationName) phpType = '';
                if (phpType.endsWith('::class')) {
                    if (!propImps.includes(phpType)) propImps.push(phpType.slice(0, -7));
                    phpType = phpType.split('\\').pop()!;
                }

                return {
                    name: field.dbName ?? field.name,
                    phpType,
                    fillable,
                    hidden,
                    ignore,
                    guarded,
                    cast,
                    isList: field.isList,
                    optional: !field.isRequired,
                    enumRef: enumMeta?.name,
                    typeAnnotation,
                    type: field.type,
                };
            });

            /* ── 2.3  Laravel $guarded array (union model + field) ─────────── */
            const guarded =
                guardedSet.size || properties.some(p => p.guarded)
                    ? Array.from(new Set([...guardedSet, ...properties.filter(p => p.guarded).map(p => p.name)]))
                    : hasToken("guarded", modelDoc) ? [] : undefined;

            /* ── 2.4  Relations (unchanged except @ignore honoured) ────────── */
            const relations = this.extractRelationsFromModel(model);

            /* ── 2.5  Interfaces from @type annotations ────────────────────── */
            const interfaces: Record<string, { import?: string; type: string }> = {};
            for (const prop of properties) {
                if (prop.typeAnnotation) {
                    interfaces[prop.name] = { ...prop.typeAnnotation };
                }
            }

            /* -------- NEW: parse @trait / @implements / @observer / @factory -------- */
            type UseImport = { fqcn: string; alias?: string };
            const addUse = (arr: UseImport[], fqcn: string, alias?: string) =>
                arr.push({ fqcn, alias });

            const shortName = (fqcn: string, alias?: string) => alias ?? fqcn.split('\\').pop()!;

            const traitRE = /@trait:([^\s]+)(?:\s+as\s+(\w+))?/g;
            const useRE = /@use:([^\s]+)(?:\s+as\s+(\w+))?/g;
            const implRE = /@implements:([^\s]+)(?:\s+as\s+(\w+))?/g;
            const observerRE = /@observer:([^\s]+)(?:\s+as\s+(\w+))?/;
            const factoryRE = /@factory:([^\s]+)(?:\s+as\s+(\w+))?/;

            const traitUses: UseImport[] = [];
            const traits: string[] = [];
            for (let m; (m = traitRE.exec(modelDoc));) {
                addUse(traitUses, m[1], m[2]);
                traits.push(shortName(m[1], m[2]));
            }

            const useUses: UseImport[] = [];
            for (let m; (m = useRE.exec(modelDoc));) addUse(useUses, m[1], m[2]);

            const extendRE = /@extend:([^\s]+)(?:\s+as\s+(\w+))?/;
            let parentClass = "Model";
            let parentUse: UseImport | undefined;

            const extMatch = extendRE.exec(modelDoc);
            if (extMatch) {
                parentClass = shortName(extMatch[1], extMatch[2]);
                parentUse = { fqcn: extMatch[1], alias: extMatch[2] };
            }

            const implUses: UseImport[] = [];
            const implementsArr: string[] = [];
            for (let m; (m = implRE.exec(modelDoc));) {
                addUse(implUses, m[1], m[2]);
                implementsArr.push(shortName(m[1], m[2]));
            }

            const obsMatch = observerRE.exec(modelDoc);
            const observer = obsMatch ? shortName(obsMatch[1], obsMatch[2]) : undefined;
            const observerUse = obsMatch ? { fqcn: obsMatch[1], alias: obsMatch[2] } : undefined;

            const facMatch = factoryRE.exec(modelDoc);
            const factory = facMatch ? shortName(facMatch[1], facMatch[2]) : undefined;
            const factoryUse = facMatch ? { fqcn: facMatch[1], alias: facMatch[2] } : undefined;

            // eager-load arrays (now via listFrom)
            const touches = listFrom(modelDoc, "touch");
            const appends = parseAppendsDirective(modelDoc)?.entries.map(item => item.name);

            const imports = [
                ...(parentUse ? [parentUse] : []),
                ...traitUses,
                ...implUses,
                ...useUses,
                ...(observerUse ? [observerUse] : []),
                ...(factoryUse ? [factoryUse] : []),
            ].map(u => `use ${u.fqcn}${u.alias ? ` as ${u.alias}` : ''};`);
            imports.push(...propImps.map(item => `use ${item};`));

            //--- docprops
            const docblockProps: string[] = [];
            const relationNames = new Set(relations.map(r => r.name));

            for (const p of properties) {
                if (p.ignore || relationNames.has(p.name)) continue;
                const type = p.enumRef ? `${p.enumRef}::class` : this.mapPrismaToPhpDocType(p.type, p.optional, p.isList);
                docblockProps.push(`@property ${type} $${p.name}`);
            }
            for (const rel of relations) {
                const type =
                    rel.type === 'hasMany' || rel.type === 'belongsToMany'
                        ? `\\Illuminate\\Support\\Collection<int, ${rel.modelClass}>`
                        : rel.modelClass;
                docblockProps.push(`@property ${type} $${rel.name}`);
            }

            const namespace = modelNamespace ?? baseNamespace ?? 'App';

            /* ── 2.6  Final ModelDefinition ────────────────────────────────── */
            return {
                className: model.name,
                tableName: model.dbName ?? model.name,
                guarded,
                properties,
                namespace,
                relations,
                enums,
                interfaces,
                with: withList.length ? withList : undefined,
                appends,
                factory,
                implements: implementsArr,
                observer,
                touches,
                traits,
                imports,
                isIgnored: isForModel(parseSilentDirective(modelDoc)),
                extends: parentClass !== 'Model' ? parentClass : undefined,
                docblockProps,
            };
        });

        return { models, enums };
    }

    private mapPrismaToPhpType(prismaType: string, isList?: boolean, ignore?: string[]): string {
        if (isList) {
            return "Illuminate\\Database\\Eloquent\\Casts\\AsCollection::class"
        }

        if (prismaType == PrismaTypes.Json || prismaType == PrismaTypes.JsonB) {
            return "Illuminate\\Database\\Eloquent\\Casts\\AsArrayObject::class";
        }

        if (ignore?.includes(prismaType)) return '';

        if ([
            PrismaTypes.Date,
            PrismaTypes.Time,
            PrismaTypes.Timetz,
            PrismaTypes.Timestamp,
            PrismaTypes.Timestamptz,
            PrismaTypes.DateTime,
            PrismaTypes.DateTime2,
            PrismaTypes.SmallDateTime,
            PrismaTypes.DateTimeOffset,
        ].includes(prismaType)) return '"datetime"';

        switch (prismaType) {
            case "String":
                return "string";
            case "Boolean":
                return "bool";
            case "Int":
            case "BigInt":
                return "int";
            case "Float":
                return "'float'";
            case "DateTime":
                return "'datetime'";
            case "Json":
                return "'array'";
            default:
                return "";
        }
    }

    public mapPrismaToPhpDocType(prismaType: string, nullable = false, isList?: boolean): string {
        if (isList) {
            const itemType = this.mapPrismaToPhpDocType(prismaType, false); // inner item is never nullable here
            const collection = `\\Illuminate\\Support\\Collection<int, ${itemType}>`;
            return nullable ? `${collection}|null` : collection;
        }

        let type: string;

        switch (prismaType) {
            case PrismaTypes.String:
                type = "string";
                break;
            case PrismaTypes.Boolean:
            case PrismaTypes.Bool:
                type = "bool";
                break;
            case PrismaTypes.Int:
            case PrismaTypes.BigInt:
            case PrismaTypes.SmallInt:
            case PrismaTypes.MediumInt:
            case PrismaTypes.TinyInt:
            case PrismaTypes.UnsignedBigInt:
            case PrismaTypes.UnsignedInt:
            case PrismaTypes.UnsignedSmallInt:
            case PrismaTypes.UnsignedMediumInt:
            case PrismaTypes.UnsignedTinyInt:
                type = "int";
                break;
            case PrismaTypes.Float:
            case PrismaTypes.Double:
            case PrismaTypes.Decimal:
            case PrismaTypes.Real:
            case PrismaTypes.Money:
            case PrismaTypes.SmallMoney:
                type = "float";
                break;
            case PrismaTypes.DateTime:
            case PrismaTypes.Timestamp:
            case PrismaTypes.Timestamptz:
            case PrismaTypes.Date:
            case PrismaTypes.DateTimeOffset:
            case PrismaTypes.Time:
            case PrismaTypes.Timetz:
            case PrismaTypes.SmallDateTime:
            case PrismaTypes.DateTime2:
                type = "\\Carbon\\Carbon";
                break;
            case PrismaTypes.Json:
            case PrismaTypes.JsonB:
                type = "array";
                break;
            default:
                type = "mixed";
                break;
        }

        return nullable ? `${type}|null` : type;
    }

    private extractRelationsFromModel(model: DMMF.Model): RelationDefinition[] {
        return buildRelationsForModel(this.dmmf, model);
    }
}
