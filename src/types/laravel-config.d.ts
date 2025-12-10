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
   include?: string[] | "*";

   /** New style – blacklist applied after include / pattern */
   exclude?: string[];

   /** New style – RegExp OR minimatch glob(s) */
   pattern?: RegExp | string | Array<RegExp | string>;
}

/* ------------------------------------------------------------
 *  Per-generator overrides  (migration / modeler / ts)
 * ---------------------------------------------------------- */
export interface LaravelGeneratorConfig {
   /** Optional prefix applied to *physical* table names. */
   tablePrefix?: string;
   /** Optional suffix applied to *physical* table names. */
   tableSuffix?: string;

   /** Override stubDir only for this generator (migration/model/ts). */
   stubDir?: string;

   /**
    * Where the generated PHP/TS **primary output** goes for this generator.
    *
    * - Migrator → PHP migration files directory.
    * - Modeler  → PHP model files directory.
    * - TS       → base directory for TS types (models + enums) unless
    *              further specialised by ts.outputDir / ts.* flags.
    */
   outputDir?: string;

   overwriteExisting?: boolean;

   /** Allow formatting with prettier for this generator. */
   prettier?: boolean;

   /**
    * Stub grouping:
    *  • string  – path to a JS module exporting StubGroupConfig[]
    *  • array   – the group definitions themselves
    */
   groups?: string | StubGroupConfig[];

   /** Skip file emission for *this* generator only. */
   noEmit?: boolean;

   /** Default namespace for local imports (PHP generators). */
   namespace?: "App\\";
}

/* ------------------------------------------------------------
 *  Top-level shared config  (visible to all generators)
 * ---------------------------------------------------------- */
export interface LaravelSharedConfig {
   /** Table name decoration applied globally. */
   tablePrefix?: string;
   tableSuffix?: string;

   /** Default stub root (migration/, model/, enum/). */
   stubDir?: string;

   /** Global “don’t write files” switch. */
   noEmit?: boolean;

   /**
    * Override default output folders (PHP + TS).
    *
    * These are *global* defaults; each generator (migrate/modeler/ts)
    * can still override via its own `outputDir` / `outputEnumDir`.
    */
   output?: {
      /** Directory for PHP migrations (migrator). */
      migrations?: string;
      /** Directory for PHP models (modeler). */
      models?: string;
      /** Directory for PHP enums (modeler). */
      enums?: string;
      /**
       * Base directory for **TS types** (both models + enums bundles),
       * if not overridden by:
       *   - ts.outputDir
       *   - or generator types { outputDir = "…" } block.
       */
      ts?: string;
   };

   /** Per-generator fine-tuning (PHP migrations). */
   migrate?: Partial<MigratorConfigOverride>;
   /** Per-generator fine-tuning (PHP models + PHP enums). */
   modeler?: Partial<ModelConfigOverride>;
   /** Per-generator fine-tuning (TS types generator). */
   ts?: Partial<TypesConfigOverride>;
}

/* ------------------------------------------------------------
 *  TypeScript generator overrides
 * ---------------------------------------------------------- */
export interface TypesConfigOverride extends LaravelGeneratorConfig {
   /**
    * Base directory where generated TS types should be written.
    *
    * This is the **root** for both:
    *   - the main models bundle (e.g. `index.d.ts`)
    *   - the enums bundle (e.g. `enums.ts` / `enums.d.ts`)
    *
    * Resolution precedence for TS:
    *   1. generator types { outputDir = "…" }
    *   2. shared.ts.outputDir
    *   3. shared.output.ts
    *   4. hardcoded default ("resources/ts/prisma" or similar)
    */
   outputDir?: string;

   /**
    * Emit `.d.ts` declaration files instead of `.ts` **for enums**.
    *
    * Models are always emitted as `.d.ts` – this flag only changes the
    * extension of the enums bundle:
    *
    *   declaration === true  → `<enumsFileName>.d.ts`
    *   declaration === false → `<enumsFileName>.ts`
    */
   declaration?: boolean; // default: false → enums.ts

   /**
    * If true, **only** the enums bundle is skipped.
    *
    * Models are still generated and written (unless `noEmit` is true).
    * Useful when you already maintain enums elsewhere but still want
    * strong-typed model shapes.
    */
   noEmitEnums?: boolean;

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

   /**
    * Base filename (without extension) for the **main models bundle**.
    *
    * Defaults to `"index"`, and is always emitted as:
    *
    *   `<modelsFileName>.d.ts`
    *
    * in the configured TS types output directory.
    */
   modelsFileName?: string;

   /**
    * Base filename (without extension) for the **enums bundle**.
    *
    * Defaults to `"enums"`, and is emitted as:
    *   - `<enumsFileName>.d.ts` when `declaration === true`
    *   - `<enumsFileName>.ts`   otherwise.
    */
   enumsFileName?: string;
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
   /** Optional explicit PHP model stub file path. */
   modelStubPath?: string;
   /** Optional explicit PHP enum stub file path. */
   enumStubPath?: string;
   /**
    * Extra folder for PHP enums (modeler only).
    *
    * Resolution for enums directory:
    *   1. modeler.outputEnumDir
    *   2. shared.output.enums
    *   3. hardcoded default (e.g. "app/Enums")
    */
   outputEnumDir?: string;
   /** Use awobaz/compoships for composite keys. */
   awobaz?: boolean;
   /** Extra fields allowed on pivot models. */
   allowedPivotExtraFields?: string[];
}