// generator/ts/types.ts
export interface TsImport {
   from: string;
   types: string[]; // e.g. ['UserId', 'Email']
}

export interface TsModelField {
   name: string;
   type: string;
   optional: boolean;
   isList: boolean;
   isId?: boolean;
   isGenerated?: boolean;
   isUpdatedAt?: boolean;
   hidden?: boolean;
   // ...other flags
}

export interface TsAppendProperty {
   name: string;
   type: string; // resolved TS type, or 'any' if not specified
}

export interface TsModelDefinition {
   name: string;
   fields: TsModelField[];
   appends: TsAppendProperty[];
   imports: TsImport[];
   doc: string
}

export interface TsEnumDefinition {
   name: string;
   values: string[];
   doc: string
}