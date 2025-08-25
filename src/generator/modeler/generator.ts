import { DMMF } from "@prisma/generator-helper";
import {
   ModelDefinition,
   EnumDefinition,
   RelationDefinition,
   PropertyDefinition,
} from "./types";
import { PrismaTypes } from "../migrator/column-maps.js";

/**
 * Build ModelDefinition[] + EnumDefinition[] from your DMMF.
 */
export class PrismaToLaravelModelGenerator {
   constructor(private dmmf: DMMF.Document) { }
   public primitiveTypes: string[] = [PrismaTypes.BigInt, PrismaTypes.Int, PrismaTypes.String, PrismaTypes.Boolean, PrismaTypes.Bool];
   public generateAll(): {
      models: ModelDefinition[];
      enums: EnumDefinition[];
   } {
      // 1) Extract all Prisma enums into EnumDefinition[]
      const enums: EnumDefinition[] = this.dmmf.datamodel.enums.map((e) => ({
         name: e.name,
         values: e.values.map((v) => v.name),
      }));

      // 2) Build each ModelDefinition
      // 2) Build each ModelDefinition
      const models: ModelDefinition[] = this.dmmf.datamodel.models.map(model => {
         /* ── 2.1  Model-level directives ──────────────────────────────── */
         const modelDoc = model.documentation ?? "";

         // helper → get list from @tag{a,b,c}
         const listFrom = (doc: string, tag: string): string[] => {
            const m = doc.match(new RegExp(`@${tag}\\{([^}]+)\\}`));
            return m ? m[1].split(",").map(s => s.trim()).filter(Boolean) : [];
         };

         const hasToken = (tag: string, doc: string) => new RegExp(`@${tag}\\b`).test(doc);

         const modelFillable = listFrom(modelDoc, "fillable");
         const modelHidden = listFrom(modelDoc, "hidden");
         const modelGuarded = listFrom(modelDoc, "guarded");

         // model-level eager-loads  @with(rel1,rel2)
         const modelWith = (() => {
            const m = modelDoc.match(/@with([^)]+)/);
            return m ? m[1].split(",").map(s => s.trim()).filter(Boolean) : [];
         })();

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

            // eager-load relation field
            if (flag("with") && !withList.includes(field.name)) {
               withList.push(field.name);
            }

            // custom cast
            const castMatch = doc.match(/@cast\{([^}]+)\}/);
            let cast = castMatch ? castMatch[1].trim() : undefined;

            // @type{ import:'x', type:'Y' }
            const typeMatch = doc.match(/@type\{\s*(?:import\s*:\s*'([^']+)')?\s*,?\s*type\s*:\s*'([^']+)'\s*\}/);
            const typeAnnotation = typeMatch
               ? { import: typeMatch[1], type: typeMatch[2] }
               : undefined;

            const enumMeta = enums.find(e => e.name === field.type);
            let phpType = enumMeta
               ? enumMeta.name
               : this.mapPrismaToPhpType(field.type, field.isList, this.primitiveTypes);

            if (phpType === 'mixed' || field.relationFromFields?.length || field.relationName) phpType = '';
            // Saw a fully-qualified “Some\\Namespace\\CastClass::class”
            if (phpType.endsWith('::class')) {
               // 1️⃣ keep the full FQN (including ::class) for the import list
               if (!propImps.includes(phpType)) propImps.push(phpType.slice(0, -7));

               // 2️⃣ convert to the **short** class reference *but keep* ::class,
               //    because Laravel’s $casts array expects that literal.
               //
               //    "App\\Casts\\AsObject::class"  ➜  "AsObject::class"
               //
               phpType = phpType.split('\\').pop()!; // last segment already ends with ::class
            }


            return {
               name: field.name,
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
               ? [
                  ...guardedSet,
                  ...properties.filter(p => p.guarded).map(p => p.name),
               ]
               : hasToken('guarded', modelDoc) ? [] : undefined;

         /* ── 2.4  Relations (unchanged except @ignore honoured) ────────── */
         const relations: RelationDefinition[] = model.fields
            .filter(
               f =>
                  f.kind === "object" &&
                  f.relationName &&
                  !/@ignore\b/.test(f.documentation ?? "")
            )
            .map(f => {
               const relatedModel = this.dmmf.datamodel.models.find(
                  m => m.name === f.type
               )!;
               const relatedTable = relatedModel.dbName ?? f.type;
               const thisTable = model.dbName ?? model.name;

               const isImplicitM2M =
                  f.isList && (f.relationFromFields?.length ?? 0) === 0;
               const relType = isImplicitM2M
                  ? "belongsToMany"
                  : f.isList
                     ? "hasMany"
                     : "belongsTo";

               let pivotTable: string | undefined;
               if (relType === "belongsToMany") {
                  pivotTable = [thisTable, relatedTable]
                     .map(t => t.toLowerCase())
                     .sort()
                     .join("_");
               }

               return {
                  name: f.name.replace(/Id$/, ""),
                  type: relType as any,
                  modelClass: `${f.type}::class`,
                  foreignKey: f.relationFromFields?.[0],
                  localKey: f.relationToFields?.[0],
                  pivotTable,
               };
            });

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

         // extract short-name or alias
         const shortName = (fqcn: string, alias?: string) =>
            alias ?? fqcn.split('\\').pop()!;

         // regexes -----------------------------------------------------------------
         const traitRE = /@trait:([^\s]+)(?:\s+as\s+(\w+))?/g;
         const implRE = /@implements:([^\s]+)(?:\s+as\s+(\w+))?/g;
         const observerRE = /@observer:([^\s]+)(?:\s+as\s+(\w+))?/;
         const factoryRE = /@factory:([^\s]+)(?:\s+as\s+(\w+))?/;
         const touchRE = /@touch\{([^}]+)\}/;
         const appendsRE = /@appends\{([^}]+)\}/;

         // collect traits ----------------------------------------------------------
         const traitUses: UseImport[] = [];
         const traits: string[] = [];
         for (let m; (m = traitRE.exec(modelDoc));) {
            addUse(traitUses, m[1], m[2]);
            traits.push(shortName(m[1], m[2]));
         }

         /* ---------------- NEW: @extend ----------------------------------------- */
         // Syntax:  /// @extend:App\BaseClasses\SoftModel
         // Optional alias just like traits:
         /*
            /// @extend:App\Foo\Bar as BaseBar
            → use App\Foo\Bar as BaseBar;
            → extends "BaseBar"
         */
         const extendRE = /@extend:([^\s]+)(?:\s+as\s+(\w+))?/;

         let parentClass = "Model";               // default
         let parentUse: UseImport | undefined;    // for imports[]

         const extMatch = extendRE.exec(modelDoc);
         if (extMatch) {
            parentClass = shortName(extMatch[1], extMatch[2]);      // "Bar" | "BaseBar"
            parentUse = { fqcn: extMatch[1], alias: extMatch[2] };
         }

         // collect implements ------------------------------------------------------
         const implUses: UseImport[] = [];
         const implementsArr: string[] = [];
         for (let m; (m = implRE.exec(modelDoc));) {
            addUse(implUses, m[1], m[2]);
            implementsArr.push(shortName(m[1], m[2]));
         }

         // observer / factory ------------------------------------------------------
         const obsMatch = observerRE.exec(modelDoc);
         const observer = obsMatch ? shortName(obsMatch[1], obsMatch[2]) : undefined;
         const observerUse = obsMatch ? { fqcn: obsMatch[1], alias: obsMatch[2] } : undefined;

         const facMatch = factoryRE.exec(modelDoc);
         const factory = facMatch ? shortName(facMatch[1], facMatch[2]) : undefined;
         const factoryUse = facMatch ? { fqcn: facMatch[1], alias: facMatch[2] } : undefined;

         // eager-load arrays -------------------------------------------------------
         const touches = touchRE.exec(modelDoc)?.[1]?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
         const appends = appendsRE.exec(modelDoc)?.[1]?.split(',').map(s => s.trim()).filter(Boolean) ?? [];

         // final imports list ------------------------------------------------------
         const imports = [
            ...(parentUse ? [parentUse] : []),
            ...traitUses,
            ...implUses,
            ...(observerUse ? [observerUse] : []),
            ...(factoryUse ? [factoryUse] : []),
         ].map(u => `use ${u.fqcn}${u.alias ? ` as ${u.alias}` : ''};`);

         imports.push(...propImps.map(item => `use ${item};`));
         //--- docprops
         const docblockProps: string[] = [];
         const docblockNames = new Set<string>();

         // Step 1: Skip any property name that is shadowed by a relation
         const relationNames = new Set(relations.map(r => r.name));

         // Only include properties not overridden by a relation
         for (const p of properties) {
            if (p.ignore || relationNames.has(p.name)) continue;

            const type = this.mapPrismaToPhpDocType(p.type, p.optional, p.isList);
            const line = `@property ${type} $${p.name}`;
            docblockProps.push(line);
            docblockNames.add(p.name);
         }

         // Step 2: Add all relations (they take precedence)
         for (const rel of relations) {
            const name = rel.name;
            const type =
               rel.type === 'hasMany' || rel.type === 'belongsToMany'
                  ? `\\Illuminate\\Support\\Collection<int, ${rel.modelClass}>`
                  : rel.modelClass;

            const line = `@property ${type} $${name}`;
            docblockProps.push(line);
            docblockNames.add(name); // optional: tracking
         }

         /* ── 2.6  Final ModelDefinition ────────────────────────────────── */
         return {
            className: model.name,
            tableName: model.dbName ?? model.name,
            guarded,
            properties,
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
            extends: parentClass !== 'Model' ? parentClass : undefined,
            docblockProps
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
            type = "string"; break;
         case PrismaTypes.Boolean:
         case PrismaTypes.Bool:
            type = "bool"; break;
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
            type = "int"; break;
         case PrismaTypes.Float:
         case PrismaTypes.Double:
         case PrismaTypes.Decimal:
         case PrismaTypes.Real:
         case PrismaTypes.Money:
         case PrismaTypes.SmallMoney:
            type = "float"; break;
         case PrismaTypes.DateTime:
         case PrismaTypes.Timestamp:
         case PrismaTypes.Timestamptz:
         case PrismaTypes.Date:
         case PrismaTypes.DateTimeOffset:
         case PrismaTypes.Time:
         case PrismaTypes.Timetz:
         case PrismaTypes.SmallDateTime:
         case PrismaTypes.DateTime2:
            type = "\\Carbon\\Carbon"; break;
         case PrismaTypes.Json:
         case PrismaTypes.JsonB:
            type = "array"; break;
         default:
            type = "mixed"; break;
      }

      return nullable ? `${type}|null` : type;
   }
}
