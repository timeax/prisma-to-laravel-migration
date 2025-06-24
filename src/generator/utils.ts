import { DMMF } from "@prisma/generator-helper";
import { NativeToMigrationTypeMap } from "./migrator/column-maps.js";
import { MigrationType } from "./migrator/column-definition-types.js";
import { MigrationTypes } from "./migrator/migrationTypes.js";
import { ModelDefinition } from "./modeler/types.js";
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from "path";

/**
 * Given a Prisma field default, return the PHP code fragment
 * to append to your migration column definition.
 *
 * You’ll need to have `use Illuminate\Support\Facades\DB;`
 * at the top of your migration stub for the `DB::raw()` calls.
 */
export function formatDefault(field: DMMF.Field): string {
   const def = field.default as
      | { name: string; args: Array<string | number> }
      | string
      | number
      | undefined;

   // No default → nothing to append
   if (def == null) {
      return "";
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

export function getType(field: DMMF.Field): MigrationType {
   const {
      name,
      type: prismaType,
      nativeType,
      default: def,
      kind,
      isId,
   } = field;

   // 1. Only map a true auto-increment PK called "id" to Laravel's id()
   if (
      name === "id" &&
      kind === "scalar" &&
      isId &&
      (def as any)?.name === "autoincrement"
   ) {
      return MigrationTypes.id;
   }

   // 2. Other @default(autoincrement()) fields
   if ((def as any)?.name === "autoincrement") {
      return prismaType === "BigInt"
         ? MigrationTypes.bigIncrements
         : MigrationTypes.increments;
   }

   // 3. Char-length UUID/ULID shortcuts
   if (prismaType === "String" && nativeType?.[0] === "Char") {
      const len = Number(nativeType[1]?.[0]);
      if (len === 36) return MigrationTypes.uuid;
      if (len === 26) return MigrationTypes.ulid;
   }

   // 4. Fallback to your nativeType/prismaType lookup
   const key = nativeType?.[0] ?? prismaType;
   // @ts-ignore
   return NativeToMigrationTypeMap[key] ?? MigrationTypes.string;
}


export function buildModelContent(model: ModelDefinition): string {
   const lines: string[] = [];

   // 1) If @guarded is used, emit $guarded instead of $fillable
   if (model.guarded) {
      lines.push(
         `protected $guarded = [\n${model.guarded.map(f => `        '${f}'`).join(",\n")
         }\n    ];`
      );
   }
   else if (model.properties.some(p => p.fillable)) {
      lines.push(
         `protected $fillable = [\n${model.properties
            .filter(p => p.fillable)
            .map(p => `        '${p.name}'`)
            .join(",\n")
         }\n    ];`
      );
   }

   // 2) Hidden (unchanged)
   if (model.properties.some(p => p.hidden)) {
      lines.push(
         `protected $hidden = [\n${model.properties
            .filter(p => p.hidden)
            .map(p => `        '${p.name}'`)
            .join(",\n")
         }\n    ];`
      );
   }


   // 0) If any @with, emit protected $with = [...]
   if (model.with?.length) {
      lines.push(
         `protected $with = [\n${model.with.map(r => `    '${r}'`).join(',\n')
         }\n];`
      );
   }

   // 3) Casts (unchanged)
   if (model.properties.some(p => p.cast || p.enumRef)) {
      lines.push(
         `protected $casts = [\n${model.properties
            .filter(p => p.cast || p.enumRef)
            .map(p => `        '${p.name}' => ${p.enumRef ? `${p.enumRef}::class` : `'${p.cast}'`}`)
            .join(",\n")
         }\n    ];`
      );
   }

   // 4) Relations (unchanged)
   for (const rel of model.relations) {
      const args = [
         `${rel.modelClass}`,
         rel.foreignKey ? ` '${rel.foreignKey}'` : "",
         rel.localKey ? ` '${rel.localKey}'` : "",
      ]
         .filter(Boolean)
         .join(",");
      lines.push(
         `public function ${rel.name}()\n    {\n` +
         `        return $this->${rel.type}(${args});\n` +
         `    }`
      );
   }

   return lines.map(l => "    " + l).join("\n\n");
}
/**
 * Escape a stub’s contents so it can be safely wrapped in a JS template literal.
 * This will:
 *  - Escape all backslashes
 *  - Escape all backticks
 */
export function formatStub(stub: string): string {
   return stub
   // escape backslashes first
   // .replace(/\\/g, '\\\\')
   // then escape any backticks
   // .replace(/`/g, '\\`');
}


/**
 * Safely write or update a file by replacing the region between
 * startMarker and endMarker if both exist, otherwise overwrite the whole file.
 *
 * @param filePath      Path to the target file
 * @param fullContent   The full text to write if markers are missing
 * @param generated     The text to inject between the markers
 * @param startMarker   Literal string marking the region start
 * @param endMarker     Literal string marking the region end
 * @param overwrite     If false and file exists, do nothing
 */
export function writeWithMarkers(
   filePath: string,
   fullContent: string,
   generated: string,
   startMarker: string,
   endMarker: string,
   overwrite: boolean
) {
   // If the file exists but we're *not* overwriting, skip entirely
   if (existsSync(filePath) && !overwrite) return;

   if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');

      // If both markers are present, do an in‐place replace
      if (existing.includes(startMarker) && existing.includes(endMarker)) {
         const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
         const re = new RegExp(
            `${escaped(startMarker)}[\\s\\S]*?${escaped(endMarker)}`,
            'm'
         );

         const updated = existing.replace(
            re,
            `${startMarker}\n${generated}\n${endMarker}`
         );

         return writeFileSync(filePath, updated, 'utf-8');
      }
   }

   // Otherwise write the full content (which itself can include the markers)
   writeFileSync(filePath, fullContent, 'utf-8');
}

export interface StubGroupConfig {
   /** path relative to stubDir/<type>/, e.g. "fancy-orders.stub" */
   stubFile: string;
   tables: string[];         // e.g. ["orders","order_items"]
}

export interface StubConfig {
   stubDir: string;          // root folder for all stubs
   groups?: StubGroupConfig[];
}

export function resolveStub(
   cfg: StubConfig,
   type: "migration" | "model" | "enum",
   tableName: string
): string | undefined {
   if (!cfg.stubDir) return;
   //---
   const dir = path.resolve(process.cwd(), cfg.stubDir, type);

   // A) 1st: file‐based override: <tableName>.stub
   const fileOverride = path.join(dir, `${tableName}.stub`);
   if (existsSync(fileOverride)) {
      return fileOverride;
   }

   // B) 2nd: group‐based override
   if (cfg.groups) {
      for (const { stubFile, tables } of cfg.groups) {
         if (tables.includes(tableName)) {
            const groupPath = path.join(dir, stubFile);
            if (existsSync(groupPath)) {
               return groupPath;
            }
         }
      }
   }

   // C) Fallback to index.stub
   const defaultPath = path.join(dir, "index.stub");
   if (!existsSync(defaultPath)) return;
   return defaultPath;
}