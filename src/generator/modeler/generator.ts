import { DMMF } from "@prisma/generator-helper";
import {
   ModelDefinition,
   EnumDefinition,
   RelationDefinition,
   PropertyDefinition,
} from "./types";

/**
 * Build ModelDefinition[] + EnumDefinition[] from your DMMF.
 */
export class PrismaToLaravelModelGenerator {
   constructor(private dmmf: DMMF.Document) { }

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
      const models: ModelDefinition[] = this.dmmf.datamodel.models.map(
         (model) => {
            const tableName = model.dbName ?? model.name;
            const className = model.name;

            const modelDoc = model.documentation ?? "";
            const guardedMatch = modelDoc.match(/@guarded\{([^}]+)\}/);
            const guarded = guardedMatch
               ? guardedMatch[1]
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
               : undefined;
            const withList: string[] = [];
            // 2a) Properties (scalars + enums + @fillable/@hidden/@ignore/@cast/@type)
            const properties: PropertyDefinition[] = model.fields.map(
               (field) => {
                  const doc = field.documentation ?? "";
                  const fillable = /@fillable\b/.test(doc);
                  const hidden = /@hidden\b/.test(doc);
                  const ignore = /@ignore\b/.test(doc);
                  // parse a single @cast{...}
                  const castMatch = doc.match(/@cast\{([^}]+)\}/);
                  let cast = castMatch ? castMatch[1].trim() : undefined;

                  const typeMatch = doc.match(
                     /@type\s*(?:import\s*=\s*"([^"]+)")?\s*,?\s*type\s*=\s*"([^"]+)"/
                  );
                  const typeAnnotation = typeMatch
                     ? { import: typeMatch[1], type: typeMatch[2]! }
                     : undefined;

                  const enumMeta = enums.find((e) => e.name === field.type);
                  const phpType = enumMeta
                     ? `${field.type}`
                     : this.mapPrismaToPhpType(field.type);

                  // with checking
                  if (doc.includes("@with")) withList.push(field.name);

                  return {
                     name: field.name,
                     phpType,
                     fillable,
                     hidden,
                     ignore,
                     cast,
                     enumRef: enumMeta?.name,
                     typeAnnotation,
                  };
               }
            );
            // 2b) Relations: skip any field marked @ignore
            const relations: RelationDefinition[] = model.fields
               .filter(
                  (f) =>
                     f.kind === "object" &&
                     f.relationName &&
                     !/@ignore\b/.test(f.documentation ?? "")
               )
               .map((f) => {
                  const relatedModel = this.dmmf.datamodel.models.find(
                     (m) => m.name === f.type
                  )!;
                  const relatedTable = relatedModel.dbName ?? f.type;
                  const thisTable = tableName;

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
                        .map((t) => t.toLowerCase())
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

            // 2c) Interfaces from @type annotations
            const interfaces: Record<
               string,
               { import?: string; type: string }
            > = {};
            for (const prop of properties) {
               if (prop.typeAnnotation) {
                  interfaces[prop.name] = { ...prop.typeAnnotation };
               }
            }

            return {
               guarded,
               className,
               tableName,
               properties,
               relations,
               enums,
               interfaces,
               with: withList.length ? withList : undefined
            };
         }
      );

      return { models, enums };
   }

   private mapPrismaToPhpType(prismaType: string): string {
      switch (prismaType) {
         case "String":
            return "string";
         case "Boolean":
            return "bool";
         case "Int":
         case "BigInt":
            return "int";
         case "Float":
            return "float";
         case "DateTime":
            return "\\DateTimeInterface";
         case "Json":
            return "array";
         default:
            return "mixed";
      }
   }
}
