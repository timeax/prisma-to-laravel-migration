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
 *  Per-generator overrides  (migration / modeler / ts)
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

   /** Default namespace for local imports (PHP generators) */
   namespace?: "App\\";
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

   /** Override default output folders (PHP + TS) */
   output?: {
      migrations?: string;
      models?: string;
      enums?: string;
      /** Where TS types go if not overridden in ts.outputDir */
      ts?: string;
   };

   /** Per-generator fine-tuning */
   migrate?: Partial<MigratorConfigOverride>;
   modeler?: Partial<ModelConfigOverride>;
   ts?: Partial<TypesConfigOverride>;
}

/* ------------------------------------------------------------
 *  TypeScript generator overrides
 * ---------------------------------------------------------- */
export interface TypesConfigOverride extends LaravelGeneratorConfig {
   /** Where generated TS types should be written, e.g. "resources/ts/prisma" */
   outputDir?: string;

   /** Emit `.d.ts` declaration files instead of `.ts` source files. */
   declaration?: boolean; // default: false → .ts

   /** Use `interface` or `type` for model declarations. */
   shape?: "interface" | "type"; // default: "interface"

   /**
    * Map Prisma scalar types → TypeScript types.
    * Keys are Prisma scalar names ("Int", "BigInt", "Decimal", "Json", "DateTime", etc.).
    *
    * Example:
    *   scalarMap: {
    *     BigInt: "bigint",
    *     Decimal: "string",
    *     Json: "unknown",
    *   }
    */
   scalarMap?: Record<string, string>;

   /**
    * If true, nullable fields become optional:
    *   `foo?: string`
    * instead of:
    *   `foo: string | null`
    */
   nullableAsOptional?: boolean;

   /**
    * If true, lists are emitted as `ReadonlyArray<T>` instead of `T[]`.
    */
   readonlyArrays?: boolean;

   /**
    * Optional name decoration for generated types/interfaces.
    * e.g. `namePrefix: "I"` → `IUser`, `IAccount`.
    */
   namePrefix?: string;
   nameSuffix?: string;

   /**
    * Optional root module/namespace hint if you want to wrap types
    * in a `declare module "…" {}` or similar structure.
    * (Purely for the TS generator; ignored by PHP generators.)
    */
   moduleName?: string;
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
   /** Allow unsigned on non-int types */
   allowUnsigned?: boolean;
   defaultMaps?: DefaultMaps;
}


export interface ModelConfigOverride extends LaravelGeneratorConfig {
   modelStubPath?: string;
   enumStubPath?: string;
   /** Extra folder for enums (modeler only) */
   outputEnumDir?: string;
   /** use awobaz/compoships */
   awobaz?: boolean;
   /** Extra fields allowed on pivot models */
   allowedPivotExtraFields?: string[];
}