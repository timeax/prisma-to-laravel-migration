import { DMMF } from "@prisma/generator-helper";
import { MigrationTypes } from "./migrationTypes.js";
import {
   ColumnDefinition,
   ColumnDefinitionWithDefault,
   ColumnDefinitionWithoutDefault,
   RelationshipOptions,
   ColumnExtras,
} from "../../types/column-definition-types.js";
import { getConfig, getType, isForMigrator, parseLocalDirective, stripDirectives } from "../../utils/utils.js";


/**
 * Helper class to build ColumnDefinition objects from Prisma DMMF.Field.
 */
export class ColumnDefinitionGenerator {
   // private storage for each model’s column definitions
   #columns: Record<string, ColumnDefinition[]> = {};

   // build a mapping from tableName → ColumnDefinition[]
   #build(): Record<string, ColumnDefinition[]> {
      return this.dmmf.datamodel.models.reduce((map, model) => {
         const tableName = model.dbName ?? model.name;
         map[tableName] = model.fields.map(f => this.generate(f, model));
         return map;
      }, {} as Record<string, ColumnDefinition[]>);
   }

   // initialize in the constructor
   constructor(private dmmf: DMMF.Document) {
      this.#columns = this.#build();
   }

   // Overload signatures
   public getColumns(): Record<string, ColumnDefinition[]>;
   public getColumns(modelName: string): ColumnDefinition[];

   // Implementation
   public getColumns(modelName?: string):
      | Record<string, ColumnDefinition[]>
      | ColumnDefinition[] {
      if (typeof modelName === 'string') {
         return this.#columns[modelName] ?? [];
      }
      return this.#columns;
   }
   /**
    * Generate a ColumnDefinition from a DMMF.Field.
    */
   public generate(field: DMMF.Field, model: DMMF.Model): ColumnDefinition {
      const base: Partial<ColumnDefinition> = {
         ...field,
         unsigned: this.isUnsigned(model, field),
         nullable: !field.isRequired,
         comment: stripDirectives(field.documentation),
         nativeType: field.nativeType?.[0]
            ? `${field.nativeType[0]}(${(field.nativeType[1] as Array<string | number>).join(",")})`
            : field.type,
         migrationType: getType(field),
         args: field.nativeType?.[1] as Array<string | number> | undefined,
      } as any;

      // Handle enums
      if (field.kind === "enum") {
         const enumMeta = this.dmmf.datamodel.enums.find(
            (e) => e.name === field.type
         );
         base.migrationType = MigrationTypes.enum;
         //---
         const args = enumMeta?.values.map((v) => v.name);
         base.args = args ? [args] : [];
      }

      if ([MigrationTypes.uuid, MigrationTypes.ulid].includes(base.migrationType as any)) base.args = [];

      // Foreign key relationship
      if (field.kind === 'object' && field.relationName) {
         const modelName = field.type;  // target model
         const relatedModel = this.dmmf.datamodel.models.find(m => m.name === modelName);
         const tableName = relatedModel?.dbName ?? modelName;

         base.ignore = (field.relationFromFields?.length ?? 0) === 0;
         base.migrationType = 'relation'; // special marker

         (base as ColumnExtras).relationship = {
            on: tableName,
            references: (field.relationToFields as any) ?? 'id',
            onDelete: this.mapPrismaAction(field.relationOnDelete),
            onUpdate: this.mapPrismaAction(field.relationOnUpdate),
            ignore: isForMigrator(parseLocalDirective(field.documentation)) || (field.relationFromFields?.length ?? 0) === 0,
            fields: (field.relationFromFields as any) ?? [],
         };

         base.ignore = (base as ColumnExtras).relationship?.ignore;
      }

      // Discriminate default
      if (field.hasDefaultValue) {
         return {
            ...(base as ColumnExtras),
            hasDefaultValue: true,
            default: field.default! as string | number | boolean | null,
         } as ColumnDefinitionWithDefault;
      } else {
         return {
            ...(base as ColumnExtras),
            hasDefaultValue: false,
         } as ColumnDefinitionWithoutDefault;
      }
   }

   public isUnsigned(model: DMMF.Model, field: DMMF.Field): boolean {
      const isIntegerLike = (f: DMMF.Field) => {
         const t = String(f.type).toLowerCase();                    // Prisma scalar name
         const native = (f.nativeType?.[0]?.toLowerCase() ?? '');   // e.g. "BigInt", "UnsignedBigInt"
         // Allow only Int/BigInt (and native types that clearly end with int)
         return t === 'int' || t === 'bigint' || /(^|[^a-z])int(eger)?$/.test(native);
      };

      // If it's not an integer-like column, UNSIGNED must be false (even if @unsigned or id)
      if (!getConfig('migrator', 'allowUnsigned') && !isIntegerLike(field)) return false;

      // IDs / generated integer keys are unsigned by default
      if (field.isId || field.isGenerated) return true;

      const native = field.nativeType?.[0]?.toLowerCase() ?? '';
      if (native.includes('unsigned')) return true;

      if (/^\s*@unsigned\b/m.test(field.documentation ?? '')) return true;

      // Check FK: infer unsignedness from referenced PK (recursive), but only for integer-like refs
      const relationField = model.fields.find(
         f =>
            f.kind === 'object' &&
            f.relationFromFields?.includes(field.name) &&
            f.relationToFields &&
            f.type
      );

      if (relationField?.relationFromFields && relationField.relationToFields) {
         const idx = relationField.relationFromFields.indexOf(field.name);
         if (idx !== -1) {
            const relatedModel = this.dmmf.datamodel.models.find(m => m.name === relationField.type);
            const referencedFieldName = relationField.relationToFields[idx];
            const referencedField = relatedModel?.fields.find(f => f.name === referencedFieldName);

            if (referencedField && isIntegerLike(referencedField)) {
               return this.isUnsigned(relatedModel as any, referencedField); // recursive
            }
         }
      }

      return false;
   }

   private mapPrismaAction(
      action: DMMF.Field["relationOnDelete"] | undefined
   ): RelationshipOptions["onDelete"] {
      switch (action) {
         case "Cascade":
            return "cascade";
         case "Restrict":
            return "restrict";
         case "SetNull":
            return "set null";
         case "SetDefault":
            return "set default";
         case "NoAction":
         default:
            return "no action";
      }
   }
}
