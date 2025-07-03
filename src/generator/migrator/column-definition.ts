import { DMMF } from "@prisma/generator-helper";
import { MigrationTypes } from "./migrationTypes.js";
import {
   ColumnDefinition,
   ColumnDefinitionWithDefault,
   ColumnDefinitionWithoutDefault,
   RelationshipOptions,
   ColumnExtras,
} from "../../types/column-definition-types.js";
import { getType } from "../../utils/utils.js";


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
         map[tableName] = model.fields.map(f => this.generate(f));
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
   public generate(field: DMMF.Field): ColumnDefinition {
      const base: Partial<ColumnDefinition> = {
         ...field,
         unsigned: field.isId || field.isGenerated || false,
         nullable: !field.isRequired,
         comment: field.documentation ?? undefined,
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
         (base as ColumnExtras).relationship = {
            on: tableName,
            references: field.relationToFields?.[0] ?? 'id',
            onDelete: this.mapPrismaAction(field.relationOnDelete),
            onUpdate: this.mapPrismaAction(field.relationOnUpdate),
            ignore: (field.relationFromFields?.length ?? 0) === 0
         };
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
