import { DefaultMaps, Rule } from "generator/migrator/rules";

/* ------------------------------------------------------------
 *  Re-usable stub-group description
 * ---------------------------------------------------------- */
export interface StubGroupConfig extends FlexibleStubGroup {
   /** Path relative to stubDir/<type>/  (e.g. "auth.stub") */
   stubFile: string;
   tables: string[];      // ["users","accounts",…] or enum names
}

/**
 * Back-compat + new matching options.
 * Supply EITHER `tables` *or* (`include` / `exclude` / `pattern`).
 */
interface FlexibleStubGroup {
   /** Path relative to stubDir/<type>/, e.g. "auth.stub" */
   stubFile: string;

   /** Old style - explicit white-list */
   tables?: string[];

   /** New style – include list ( '*' means “all tables” ) */
   include?: string[] | '*';

   /** New style – blacklist applied after include / pattern */
   exclude?: string[];

   /** New style – RegExp OR minimatch glob(s) */
   pattern?: RegExp | string | Array<RegExp | string>;
}


/* ------------------------------------------------------------
 *  Per-generator overrides  (migration / modeler)
 * ---------------------------------------------------------- */
export interface LaravelGeneratorConfig {
   tablePrefix?: string;
   tableSuffix?: string;

   /** Override stubDir only for this generator */
   stubDir?: string;

   /** Where the generated PHP goes (overrides block) */
   outputDir?: string;

   overwriteExisting?: boolean;
   /** Allow formatting with prettier */
   prettier?: boolean;
   /**
    * Stub grouping:
    *  • string  – path to a JS module exporting StubGroupConfig[]
    *  • array   – the group definitions themselves
    */
   groups?: string | StubGroupConfig[];

   /** Skip file emission for *this* generator only */
   noEmit?: boolean;

   /**Default namespace for local imports */
   namespace?: "App\\"
}

/* ------------------------------------------------------------
 *  Top-level shared config  (visible to all generators)
 * ---------------------------------------------------------- */
export interface LaravelSharedConfig {
   /** Table name decoration */
   tablePrefix?: string;
   tableSuffix?: string;

   /** Default stub root (migration/, model/, enum/) */
   stubDir?: string;

   /** Global “don’t write files” switch */
   noEmit?: boolean;

   /** Override default output folders */
   output?: {
      migrations?: string;
      models?: string;
      enums?: string;
   };

   /** Per-generator fine-tuning */
   migrate?: Partial<MigratorConfigOverride>;
   modeler?: Partial<ModelConfigOverride>;
}


/* --- Migrator-specific extra keys ---------------------------------------- */
export interface MigratorConfigOverride extends LaravelGeneratorConfig {
   /**
    * Custom migration rules:
    *  • string – path to JS module exporting Rule[]
    *  • Rule[] – rules array inline
    */
   rules?: string | Rule[];
   stubPath?: string;
   defaultMaps?: DefaultMaps
}


export interface ModelConfigOverride extends LaravelGeneratorConfig {
   modelStubPath?: string;
   enumStubPath?: string;
   /** Extra folder for enums (modeler only) */
   outputEnumDir?: string;
   /** use awobaz/compoships */
   awobaz?: boolean;
}