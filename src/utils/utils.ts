import { DMMF } from "@prisma/generator-helper";
import { MigrationType } from "../types/column-definition-types";
import { MigrationTypes } from "../generator/migrator/migrationTypes.js";
import { StubGroupConfig } from "types/laravel-config";
import { NativeToMigrationTypeMap, PrismaTypes } from "../generator/migrator/column-maps.js";
import { DefaultMaps } from "generator/migrator/rules";
import { ModelConfig } from "generator/modeler";
import { MigratorConfig } from "generator/migrator";

/**
 * Given a Prisma field default, return the PHP code fragment
 * to append to your migration column definition.
 *
 * You’ll need to have `use Illuminate\Support\Facades\DB;`
 * at the top of your migration stub for the `DB::raw()` calls.
 */
export function formatDefault(field: DMMF.Field, defaultMaps: DefaultMaps): string {
   const def = field.default as
      | { name: string; args: Array<string | number> }
      | string
      | number
      | undefined;

   // No default → nothing to append
   if (def == null) {
      return "";
   }

   // 1) if there's a custom function, call it
   if (typeof def === "object" && "name" in def) {
      const fn = defaultMaps[def.name];
      if (fn) {
         const snippet = fn(field);
         // ensure we return leading `->`
         return snippet.startsWith("->") ? snippet : `->${snippet}`;
      }
   }

   // Prisma‐built functions
   if (typeof def === "object" && "name" in def) {
      const { name, args } = def;

      switch (name) {
         case "autoincrement":
            // already handled by getType()
            return "";

         case "dbgenerated":
            // DB‐generated expression
            const expr = args[0] ?? "";
            return `->default(DB::raw(${JSON.stringify(expr)}))`;

         case "sequence":
            // CockroachDB sequences
            // if sequence name passed → use that, otherwise guess "<column>_seq"
            const seqName = args[0] ?? `${field.name}_seq`;
            return `->default(DB::raw("nextval('${seqName}')"))`;

         case "now":
            // Laravel’s built‐in CURRENT_TIMESTAMP shorthand
            return "->useCurrent()";

         case "cuid":
         case "ulid":
         case "nanoid":
            // No first‐class DB functions, so emit raw call
            return `->default(DB::raw('${name}()'))`;

         case "uuid":
            // Postgres: gen_random_uuid(); MySQL: UUID()
            return `->default(DB::raw('gen_random_uuid()'))`;

         // Prisma also has sequence(), cuid(2), uuid(4/7) etc.
         // we ignore args for those variants and emit same DB call
      }
   }

   // Static literal defaults (numbers or strings)
   // e.g. →default(4), →default("hello")
   return `->default(${JSON.stringify(def)})`;
}

const intTypes = [PrismaTypes.BigInt, PrismaTypes.Int, PrismaTypes.UnsignedBigInt, PrismaTypes.UnsignedInt];

export function getType(field: DMMF.Field): MigrationType {
   const {
      name,
      type: prismaType,
      nativeType,
      default: def,
      kind,
      isId,
      isList
   } = field;

   if (isList) return MigrationTypes.json;

   // 1. Only map a true auto-increment PK called "id" to Laravel's id()
   if (
      name === "id" &&
      kind === "scalar" &&
      intTypes.includes(prismaType as any) &&
      isId &&
      (def as any)?.name === "autoincrement"
   ) {
      return MigrationTypes.id;
   }

   // 2. Other @default(autoincrement()) fields
   if ((def as any)?.name === "autoincrement") {
      return prismaType === PrismaTypes.BigInt
         ? MigrationTypes.bigIncrements
         : MigrationTypes.increments;
   }

   // 3. Char-length UUID/ULID shortcuts
   if (prismaType === PrismaTypes.String && (nativeType?.[0] === PrismaTypes.Char || nativeType?.[0] === PrismaTypes.Binary)) {
      const len = Number(nativeType[1]?.[0]);
      if (len === 36) return MigrationTypes.uuid;
      if (len === 26) return MigrationTypes.ulid;
   }

   // 4. Fallback to your nativeType/prismaType lookup
   const key = nativeType?.[0] ?? prismaType;
   // @ts-ignore
   return NativeToMigrationTypeMap[key] ?? MigrationTypes.string;
}

/**
 * Escape a stub’s contents so it can be safely wrapped in a JS template literal.
 * This will:
 *  - Escape all backslashes
 *  - Escape all backticks
 */
export function formatStub(stub: string): string {
   return stub;
}

export interface StubConfig {
   stubDir: string;          // root folder for all stubs
   groups?: StubGroupConfig[];
   tablePrefix?: string;
   tableSuffix?: string
}

// utils/prefixSuffix.ts
export interface NameOpts {
   tablePrefix?: string;
   tableSuffix?: string;
}

/** tx_ + users + _tx → returns "tx_users_tx" */
export function decorate(name: string, opts: NameOpts): string {
   const pre = opts.tablePrefix ?? "";
   const suf = opts.tableSuffix ?? "";
   return `${pre}${name}${suf}`.trim();
}

export function addToConfig(key: 'model' | 'migrator', value: any) {
   global._config = global._config ?? {};
   global._config[key] = value;
}


export { resolveStub } from './stubResolver.js'
export { stripDirectives } from './clean.js'



type GlobalCfg = {
   model?: ModelConfig;
   migrator?: MigratorConfig;
};



// Impl
// Overloads
export function getConfig<K extends keyof GlobalCfg>(
   key: K
): GlobalCfg[K] | undefined;
export function getConfig<
   K extends keyof GlobalCfg,
   P extends keyof NonNullable<GlobalCfg[K]>
>(
   key: K,
   property: P
): NonNullable<GlobalCfg[K]>[P] | undefined;

// Impl
export function getConfig(
   key: keyof GlobalCfg,
   property?: string
) {
   const cfg = (global._config ?? {}) as GlobalCfg;
   const section = cfg[key];
   return property ? (section as any)?.[property] : section;
}