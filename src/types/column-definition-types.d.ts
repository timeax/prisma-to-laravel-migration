import { DMMF } from '@prisma/generator-helper';
import { MigrationTypes } from '../generator/migrator/migrationTypes';

/**
 * The union of all values in the MigrationTypes object.
 */
export type MigrationType = typeof MigrationTypes[keyof typeof MigrationTypes];

/**
 * Options for defining a foreign key relationship.
 */
export interface RelationshipOptions {
   /* the local column(s) that hold the foreign key */
   fields: string[];  
   /** The column this references (defaults to 'id') */
   references?: string[] | string;
   /** The table this references */
   on: string;
   /** Action on delete */
   onDelete?: 'cascade' | 'restrict' | 'set null' | 'no action' | 'set default';
   /** Action on update */
   onUpdate?: 'cascade' | 'restrict' | 'set null' | 'no action' | 'set default';
   /**Ignore for migrations */
   ignore?: boolean;
}

/**
 * Extra properties for Laravel migration column definitions.
 */
export interface ColumnExtras {
   /** The native DB type, e.g., "VarChar(255)" */
   nativeType: string;
   /** Parsed args from the nativeType, e.g. [255] or [10,2] */
   args?: Array<number | string | any[]>;
   /** The mapped Laravel migration type (strictly one of MigrationType) */
   migrationType: MigrationType | 'relation';
   /** Marks the column as unsigned */
   unsigned?: boolean;
   /** Marks the column as nullable */
   nullable?: boolean;
   /** Column comment */
   comment?: string;
   /** Foreign key relationship options */
   relationship?: RelationshipOptions;
   /** Ignore definition */
   ignore?: boolean;
   //---
   [x: string]: any
}

/**
 * Column definition when no default value is present.
 */
export type ColumnDefinitionWithoutDefault = DMMF.Field &
   ColumnExtras & {
      hasDefaultValue: false;
   };

/**
 * Column definition when a default value is present.
 */
export type ColumnDefinitionWithDefault = DMMF.Field &
   ColumnExtras & {
      hasDefaultValue: true;
      /** Default value (string, number, boolean, or null) */
      default: string | number | boolean | null;
   };

/**
 * A strict union of column definitions, discriminated by `hasDefaultValue`.
 */
export type ColumnDefinition =
   | ColumnDefinitionWithoutDefault
   | ColumnDefinitionWithDefault;