
/** Reuse these from your model‐generator file */
export interface EnumDefinition {
   name: string;
   values: string[];
}

export interface RelationDefinition {
   name: string;
   type:
   | 'belongsTo'
   | 'hasOne'
   | 'hasMany'
   | 'belongsToMany'
   | 'morphTo'
   | 'morphMany'
   | 'morphToMany';
   modelClass: string;
   foreignKey?: string;
   localKey?: string;
   pivotTable?: string;
   morphType?: string;
}

export interface PropertyDefinition {
   name: string;
   phpType: string;
   type: string;
   fillable: boolean;
   hidden: boolean;
   ignore: boolean;
   optional: boolean;
   cast?: string;
   enumRef?: string;
   isList: boolean;
   guarded?: boolean;
   relation?: RelationDefinition;
   typeAnnotation?: {
      import?: string;
      type: string;
   };
}

export interface ModelDefinition {
  /* Core identity */
  className : string;
  tableName : string;

  /* Columns & relations */
  properties : PropertyDefinition[];
  relations  : RelationDefinition[];

  /* Enum metadata referenced by fields */
  enums : EnumDefinition[];

  /* Type-hint interfaces for fumeapp/modeltyper, etc. */
  interfaces : Record<string, { import?: string; type: string }>;

  /* Mass-assignment & eager-loading */
  guarded?: string[];    //  $guarded
  with?   : string[];    //  $with

  /* Generated PHP imports (filled by printer) */
  imports?: string[];

  /* ── NEW model-level helpers ─────────────────────── */
  extends?    : string
  traits?     : string[];                           // use TraitA, TraitB
  implements? : string[];// implements Interface as Alias
  observer?   : string;                             // boot() -> observe(...)
  factory?    : string;                             // static $factory = FooFactory::class
  touches?    : string[];                           // protected $touches = [...]
  appends?    : string[];                           // protected $appends = [...]
  docblockProps?: string[]
}