// generator/ts/printer.ts
// noinspection JSUnusedGlobalSymbols

import fs from "node:fs";
import path from "node:path";
import type { TsModelDefinition, TsEnumDefinition, TsImport } from "./types.js";
import { resolveStub, type StubConfig, formatStub, getStubPath } from "@/utils/utils";

/**
 * Options for the TS printer.
 *
 * - `stubConfig` is the same config object used by the PHP generators;
 *   we reuse it and call `resolveStub(cfg, 'ts', <key>)`.
 * - `moduleName` can be overridden via TypesConfigOverride.moduleName.
 */
export interface TsPrinterOptions {
   /**
    * Stub configuration (same structure as Laravel generators).
    *
    * We expect at least:
    *   { stubDir: string; groups?: FlexibleStubGroup[] }
    */
   stubConfig?: StubConfig;

   /**
    * Optional module name used for `declare module "…" { ... }`.
    * If omitted, we default to "database/prisma".
    */
   moduleName?: string;

   /**
    * Use `interface` or `type` for model declarations.
    * (You already exposed this on TypesConfigOverride.shape.)
    *
    * Default: "interface".
    */
   shape?: "interface" | "type";
}

/**
 * Very small rendering context for a single model.
 */
export interface TsModelContext {
   name: string;
   tableName?: string;
   imports: string;
   body: string; // inner shape body (properties only, already indented)
   headerComment?: string;
}

/**
 * Very small rendering context for enums.
 */
export interface TsEnumContext {
   name: string;
   imports: string;
   headerComment?: string;
   body: string; // enum declaration
}

/**
 * Override return type for `content((model) => ...)`.
 *
 * - Return a `string` to fully replace the model chunk.
 * - Return an `object` to patch the generated chunk (append/prepend/body addProps, etc).
 */
export type TsContentOverride =
   | string
   | {
      /** Replace the whole model chunk (header + shape). */
      replace?: string;

      /** Insert before/after the whole model chunk. */
      prepend?: string;
      append?: string;

      /** Patch only the shape body (inside `{ ... }`). */
      body?: {
         prepend?: string;
         append?: string;
         addProps?: string | string[];
      };
   };

/**
 * Callable content passed into stubs.
 *
 * - As a string: behaves like the original `content` (via `toString()`).
 * - As a function: `content((model) => override)` returns patched output.
 */
export type TsContentFn<TModel> = ((
   override?: (model: TModel) => TsContentOverride | undefined,
) => string) & {
   toString(): string;
   valueOf(): string;
};

type ModelStubFn = (
   model: TsModelDefinition,
   imports: string,
   content: TsContentFn<TsModelDefinition>,
   body: string,
   moduleName: string
) => string;

type ModuleStubFn = (
   imports: string,
   content: TsContentFn<TsModelDefinition>,
   body: string,
   moduleName: string,
   models: TsModelDefinition[]
) => string;

/**
 * Printer responsible for turning our TS model/enum definitions
 * into actual `.ts` source code, with TS stubs in the same spirit
 * as the PHP `StubModelPrinter`.
 *
 * Behaviour:
 * - Models:
 *    - `printModels(models)` returns string[]:
 *        [0] => main file with all "non-stubbed" models
 *        [1..] => per-model outputs for models that *do* have TS stubs
 *    - The main file is optionally wrapped in `declare module "…"`.
 *    - A module-level TS stub (index stub) can further wrap/augment it and
 *      receives:
 *         imports  → merged imports for non-stub models
 *         content  → interfaces/types only
 *         body     → declare-module-wrapped content
 *         models   → all model definitions (for advanced use)
 *
 * - Enums:
 *    - `printEnums(enums)` returns a single string with all enum declarations.
 *    - Enums **do not** use TS stubs; they are always printed directly.
 */
export class TsPrinter {
   private readonly stubConfig?: StubConfig;
   private readonly moduleName: string;
   private readonly shape: "interface" | "type";

   // cache: module-level stub
   #currentModuleStub = "";
   private moduleTmpl?: ModuleStubFn;

   // cache: per-model stub → template function
   private modelStubCache = new Map<string, ModelStubFn>();

   constructor(options: TsPrinterOptions = {}) {
      this.stubConfig = options.stubConfig;
      this.moduleName = options.moduleName || "database/prisma";
      this.shape = options.shape ?? "interface";
   }

   // ---------------------------------------------------------------------------
   // PUBLIC API
   // ---------------------------------------------------------------------------

   /**
    * Print *all* models.
    *
    * Returns:
    *   [0] - main file (all models without a dedicated TS stub)
    *   [1..] - one string per model that has a dedicated TS stub
    */
   public printModels(models: TsModelDefinition[]): string[] {
      const regularModelContexts: TsModelContext[] = [];
      const regularModelDefs: TsModelDefinition[] = [];

      // Keep per-model default chunks so `content((m)=>...)` can patch them.
      const regularModelChunks = new Map<TsModelDefinition, string>();

      const specialOutputs: string[] = [];

      for (const model of models) {
         const ctx = this.buildModelContext(model);
         const hasSpecialStub = this.hasModelSpecificStub(model);

         if (hasSpecialStub) {
            const singleContentStr = this.renderModelStandalone(ctx); // header + shape, no imports
            const content = makeContentFn(
               [model],
               () => singleContentStr,
               this.shape,
            );

            const body = this.wrapInModule(singleContentStr);
            const code = this.renderModelWithStub(model, ctx, content, body);
            specialOutputs.push(code);
         } else {
            regularModelContexts.push(ctx);
            regularModelDefs.push(model);

            regularModelChunks.set(model, this.renderModelStandalone(ctx));
         }
      }

      const importsBlock = this.collectImports(regularModelContexts);

      const content = makeContentFn(
         regularModelDefs,
         (m) => regularModelChunks.get(m) ?? "",
         this.shape,
      );

      const body = this.wrapInModule(content.toString());
      const mainFile = this.renderModuleWithStub(
         importsBlock,
         content,
         body,
         models
      );

      return [mainFile, ...specialOutputs];
   }

   /**
    * Print all enums as a single string.
    *
    * Uses TS `enum` declarations by default.
    * No stubs here (by design).
    */
   public printEnums(enums: TsEnumDefinition[]): string {
      const chunks: string[] = [];

      for (const en of enums) {
         const ctx = this.buildEnumContext(en);
         const code = this.renderEnumStandalone(ctx);
         if (code.trim()) {
            chunks.push(code.trim());
         }
      }

      return chunks.join("\n\n") + (chunks.length ? "\n" : "");
   }

   // ---------------------------------------------------------------------------
   // CONTEXT BUILDERS
   // ---------------------------------------------------------------------------

   private buildModelContext(model: TsModelDefinition): TsModelContext {
      const headerComment = this.renderHeaderComment((model as any).doc);
      const imports = this.renderImports(model);
      const body = this.renderModelShape(model);

      return {
         name: model.name,
         tableName: (model as any).tableName,
         imports,
         body,
         headerComment,
      };
   }

   private buildEnumContext(en: TsEnumDefinition): TsEnumContext {
      const headerComment = this.renderHeaderComment((en as any).doc);
      const imports = this.renderImports(en as any);
      const body = this.renderEnumDeclaration(en);

      return {
         name: en.name,
         imports,
         headerComment,
         body,
      };
   }

   // ---------------------------------------------------------------------------
   // IMPORTS
   // ---------------------------------------------------------------------------

   private normalizeTsImports(imports: TsImport[]): TsImport[] {
      const grouped = new Map<string, Set<string>>();

      for (const imp of imports) {
         if (!imp.from) continue;

         const set = grouped.get(imp.from) ?? new Set<string>();
         for (const t of imp.types ?? []) {
            if (!t) continue;
            set.add(t);
         }
         grouped.set(imp.from, set);
      }

      return Array.from(grouped.entries())
         .map(([from, set]) => ({
            from,
            types: Array.from(set).sort(),
         }))
         .sort((a, b) => a.from.localeCompare(b.from));
   }
   /**
    * Render import statements for a node that has an `imports` property:
    *   node.imports?: { from: string; types: string[] }[];
    *
    * (If your actual shape differs, tweak here.)
    */
   private renderImports(node: { imports?: { from: string; types: string[] }[] }): string {
      const imports = node.imports ?? [];
      if (!imports.length) return "";

      return this.normalizeTsImports(imports)
         .map((i) => {
            const names = i.types.join(", ");
            return `import { ${names} } from ${JSON.stringify(i.from)};`;
         })
         .join("\n");
   }

   /**
    * Merge & dedupe imports from multiple model contexts.
    *
    * We re-parse the per-model import lines into TsImport objects so that
    * `normalizeTsImports` can group everything by `from` and merge type lists.
    */
   private collectImports(ctxs: TsModelContext[]): string {
      const collected: TsImport[] = [];

      // Very small parser for lines like: import { A, B } from "./enums";
      const importRe =
         /^import\s*\{\s*([^}]+)\}\s*from\s*(['"])([^'"]+)\2;?$/;

      for (const ctx of ctxs) {
         const raw = (ctx.imports || "").replace(/\r\n/g, "\n");
         if (!raw.trim()) continue;

         for (const line of raw.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const m = importRe.exec(trimmed);
            if (!m) {
               // If it's some other kind of import (`import "./x"`), just keep it as-is
               // by treating it as a TsImport with empty type list.
               if (trimmed.startsWith("import ")) {
                  collected.push({
                     from: trimmed, // sentinel; will emit as-is below
                     types: [], // no types
                  } as any);
               }
               continue;
            }

            const typeList = m[1]
               .split(",")
               .map((t) => t.trim())
               .filter(Boolean);
            const from = m[3];

            collected.push({ from, types: typeList });
         }
      }

      // Split “raw” imports (non `{ A } from "x"` style) from structured ones
      const rawLines = collected
         .filter((imp) => !imp.types?.length && imp.from.startsWith("import "))
         .map((imp) => imp.from);

      const structured = collected.filter(
         (imp) => imp.types && imp.types.length && !imp.from.startsWith("import "),
      );

      const normalized = this.normalizeTsImports(structured);

      const structuredLines = normalized.map(
         (i) => `import { ${i.types.join(", ")} } from ${JSON.stringify(i.from)};`,
      );

      // Deduplicate everything
      const allLines = Array.from(new Set([...rawLines, ...structuredLines]));

      return allLines.join("\n");
   }
   // ---------------------------------------------------------------------------
   // MODEL RENDERING (DEFAULT)
   // ---------------------------------------------------------------------------

   /**
    * Render a *single* model in isolation (header + shape).
    *
    * NOTE: no imports here; imports are passed separately into stubs.
    */
   private renderModelStandalone(ctx: TsModelContext): string {
      const chunks: string[] = [];

      if (ctx.headerComment) {
         chunks.push(ctx.headerComment.trimEnd());
      }

      chunks.push(this.wrapShape(ctx.name, ctx.body));

      return chunks.join("\n\n") + "\n";
   }

   /**
    * Render a *block* of models (all non-stubbed) into one text chunk.
    * Again, this is header + shape only; imports are handled separately.
    */
   private renderModelsBlock(ctxs: TsModelContext[]): string {
      if (!ctxs.length) return "";

      const pieces = ctxs.map((ctx) => this.renderModelStandalone(ctx).trimEnd());
      return pieces.join("\n\n") + "\n";
   }

   private renderModelShape(model: TsModelDefinition): string {
      const props = (model as any).properties ?? (model as any).fields ?? [];

      const lines: string[] = [];

      for (const p of props) {
         const doc = p.doc ? this.renderHeaderComment(p.doc) + "\n" : "";
         const optional = p.optional ? "?" : "";
         lines.push(`${doc}${p.name}${optional}: ${p.type};`);
      }

      return indentBlock(lines.join("\n"));
   }

   private wrapShape(name: string, body: string): string {
      if (this.shape === "type") {
         // type alias
         return `export type ${name} = {\n${body}\n};`;
      }

      // interface
      return `export interface ${name} {\n${body}\n}`;
   }

   // ---------------------------------------------------------------------------
   // ENUM RENDERING (DEFAULT, NO STUBS)
   // ---------------------------------------------------------------------------
   private renderEnumDeclaration(en: TsEnumDefinition): string {
      const values = en.values ?? [];

      const lines: string[] = [];
      lines.push(`export enum ${en.name} {`);

      for (const memberName of values) {
         // We assume Prisma enum member names are valid identifiers.
         // Emit: Foo = "Foo",
         const stringLiteral = JSON.stringify(memberName);
         lines.push(`  ${memberName} = ${stringLiteral},`);
      }

      lines.push("}");

      return lines.join("\n");
   }

   private renderEnumStandalone(ctx: TsEnumContext): string {
      const parts: string[] = [];

      if (ctx.imports.trim()) {
         parts.push(ctx.imports.trimEnd());
      }

      if (ctx.headerComment) {
         parts.push(ctx.headerComment.trimEnd());
      }

      parts.push(ctx.body);

      return parts.join("\n\n") + "\n";
   }

   // ---------------------------------------------------------------------------
   // HEADER COMMENT
   // ---------------------------------------------------------------------------

   private renderHeaderComment(doc?: string | null): string | undefined {
      if (!doc) return undefined;

      const lines = doc.split(/\r?\n/).map((l) => l.trimEnd());
      if (!lines.length) return undefined;

      const body = lines.map((l) => (l ? ` * ${l}` : " *")).join("\n");
      return `/**\n${body}\n */`;
   }

   // ---------------------------------------------------------------------------
   // MODULE WRAPPING
   // ---------------------------------------------------------------------------

   /**
    * Wrap a piece of `content` in a `declare module "<moduleName>" { ... }`
    * block, if moduleName is present. Otherwise, just return content.
    *
    * This result is what we pass to module stubs as `body`.
    */
   private wrapInModule(content: string): string {
      const trimmed = content.trim();
      if (!trimmed) return "";

      const indented = indentBlock(trimmed);
      return `declare module ${JSON.stringify(this.moduleName)} {\n${indented}\n}\n`;
   }

   // ---------------------------------------------------------------------------
   // STUB HANDLING — MODELS
   // ---------------------------------------------------------------------------

   /**
    * Does this model have a *specific* TS stub?
    *
    * We treat `ts/index.stub` as the module-level stub, not as a per-model stub.
    * So "specific stub" means a resolved stub whose basename is **not** index.stub.
    */
   private hasModelSpecificStub(model: TsModelDefinition): boolean {
      if (!this.stubConfig?.stubDir) return false;

      const key = (model as any).tableName || model.name;
      const stubPath = resolveStub(this.stubConfig, "ts", key);
      if (!stubPath) return false;

      const base = path.basename(stubPath);
      return base !== "index.stub";
   }

   private renderModelWithStub(
      model: TsModelDefinition,
      ctx: TsModelContext,
      content: TsContentFn<TsModelDefinition>,
      body: string,
   ): string {
      if (!this.stubConfig?.stubDir) {
         // No stub config at all → default: imports + body
         const parts = [];
         if (ctx.imports.trim()) parts.push(ctx.imports.trimEnd());
         if (body.trim()) parts.push(body.trimEnd());
         return parts.join("\n\n") + "\n";
      }

      const key = (model as any).tableName || model.name;
      const stubPath = resolveStub(this.stubConfig, "ts", key);
      if (!stubPath || path.basename(stubPath) === "index.stub") {
         // No specific stub (or only index) → default: imports + body
         const parts = [];
         if (ctx.imports.trim()) parts.push(ctx.imports.trimEnd());
         if (body.trim()) parts.push(body.trimEnd());
         return parts.join("\n\n") + "\n";
      }

      let tmpl = this.modelStubCache.get(stubPath);
      if (!tmpl) {
         const raw = fs.readFileSync(path.resolve(stubPath), "utf8").trim();
         tmpl = new Function(
            "model",
            "imports",
            "content",
            "body",
            "moduleName",
            `return \`${formatStub(raw)}\`;`,
         ) as ModelStubFn;
         this.modelStubCache.set(stubPath, tmpl);
      }

      const out = tmpl(
         model,
         ctx.imports || "",
         content,
         body,
         this.moduleName,
      );
      return out.replace(/\r\n/g, "\n");
   }

   // ---------------------------------------------------------------------------
   // STUB HANDLING — MODULE LEVEL
   // ---------------------------------------------------------------------------

   /**
    * Apply the module-level TS stub (typically `stubs/ts/index.stub`),
    * if present. The stub receives:
    *
    *   - `imports`: merged import block for non-stub models
    *   - `content`: raw interfaces/types only (no imports)
    *   - `body`: the same content wrapped in `declare module "…" { ... }`
    *   - `moduleName`: the configured module name (or default "database/prisma")
    *   - `models`: the *full* list of model definitions (in case the stub wants them)
    */
   private renderModuleWithStub(
      imports: string,
      content: TsContentFn<TsModelDefinition>,
      body: string,
      models: TsModelDefinition[],
   ): string {
      const hasImports = imports.trim().length > 0;

      if (!this.stubConfig?.stubDir) {
         // No stub config → default: imports + body
         const parts = [];
         if (hasImports) parts.push(imports.trimEnd());
         if (body.trim()) parts.push(body.trimEnd());
         return parts.join("\n\n") + "\n";
      }

      // Resolve module-level stub via 'index' key.
      const stubPath =
         resolveStub(this.stubConfig, "ts", "index") ?? getStubPath("ts.stub");
      if (!stubPath) {
         // No module stub → default: imports + body
         const parts = [];
         if (hasImports) parts.push(imports.trimEnd());
         if (body.trim()) parts.push(body.trimEnd());
         return parts.join("\n\n") + "\n";
      }

      if (!this.moduleTmpl || stubPath !== this.#currentModuleStub) {
         const raw = fs.readFileSync(path.resolve(stubPath), "utf8").trim();
         this.moduleTmpl = new Function(
            "imports",
            "content",
            "body",
            "moduleName",
            "models",
            `return \`${formatStub(raw)}\`;`,
         ) as ModuleStubFn;
         this.#currentModuleStub = stubPath;
      }

      const tmpl = this.moduleTmpl!;
      const out = tmpl(
         imports || "",
         content,
         body,
         this.moduleName,
         models,
      );

      return out.replace(/\r\n/g, "\n");
   }
}

// ---------------------------------------------------------------------------
// Content helpers (stub patching)
// ---------------------------------------------------------------------------

function makeContentFn<TModel>(
   models: TModel[],
   getDefaultChunk: (model: TModel) => string,
   shape: "interface" | "type",
): TsContentFn<TModel> {
   const compute = (override?: (model: TModel) => TsContentOverride | undefined) => {
      const parts: string[] = [];

      for (const m of models) {
         const base = normalizeLf(getDefaultChunk(m));
         const ov = override ? override(m) : undefined;
         const out = applyOverrideToChunk(base, ov, shape);

         if (out && out.trim()) {
            parts.push(out.trimEnd());
         }
      }

      return parts.join("\n\n") + (parts.length ? "\n" : "");
   };

   const fn = ((override?: (model: TModel) => TsContentOverride | undefined) =>
      compute(override)) as TsContentFn<TModel>;

   const defaultString = compute();

   // Preserve original behavior in stubs: `${content}` prints default content.
   fn.toString = () => defaultString;
   fn.valueOf = () => defaultString;

   return fn;
}

function applyOverrideToChunk(
   chunk: string,
   override: TsContentOverride | undefined,
   shape: "interface" | "type",
): string {
   if (!override) return chunk;

   // string = full replace
   if (typeof override === "string") {
      return normalizeLf(ensureEndsWithNewline(override));
   }

   if (override.replace) {
      return normalizeLf(ensureEndsWithNewline(override.replace));
   }

   let out = chunk;

   if (override.body) {
      out = patchShapeBody(out, shape, override.body);
   }

   if (override.prepend) {
      out = normalizeLf(override.prepend).trimEnd() + "\n" + out;
   }

   if (override.append) {
      out = out.trimEnd() + "\n" + normalizeLf(override.append).trimEnd() + "\n";
   }

   return ensureEndsWithNewline(out);
}

function patchShapeBody(
   chunk: string,
   shape: "interface" | "type",
   body: {
      prepend?: string;
      append?: string;
      addProps?: string | string[];
   },
): string {
   const declNeedle = shape === "type" ? "export type " : "export interface ";
   const declIdx = chunk.indexOf(declNeedle);
   if (declIdx === -1) return chunk;

   const openIdx = chunk.indexOf("{", declIdx);
   if (openIdx === -1) return chunk;

   const closeIdx = findMatchingBrace(chunk, openIdx);
   if (closeIdx === -1) return chunk;

   const before = chunk.slice(0, openIdx + 1);
   let inner = normalizeLf(chunk.slice(openIdx + 1, closeIdx));
   const after = chunk.slice(closeIdx);

   // Normalize inner to have leading & trailing newline for clean insertion.
   if (!inner.startsWith("\n")) inner = "\n" + inner;
   if (!inner.endsWith("\n")) inner = inner + "\n";

   // Insert right after the opening newline.
   if (body.prepend) {
      const inj = indentBlock(normalizeLf(body.prepend).trimEnd());
      if (inj.trim()) {
         inner = "\n" + inj + "\n" + inner.slice(1);
      }
   }

   // Append props and/or append text before the final newline.
   const tailInsert: string[] = [];

   if (body.addProps) {
      const props = Array.isArray(body.addProps) ? body.addProps : [body.addProps];
      const lines = props
         .flatMap((p) => normalizeLf(p).split("\n"))
         .map((l) => l.trimEnd())
         .filter((l) => l.length > 0);

      const normalized = lines.map((l) => normalizePropLine(l));
      if (normalized.length) {
         tailInsert.push(normalized.join("\n"));
      }
   }

   if (body.append) {
      const app = normalizeLf(body.append).trimEnd();
      if (app.trim()) {
         tailInsert.push(app);
      }
   }

   if (tailInsert.length) {
      const inj = indentBlock(tailInsert.join("\n").trimEnd());
      if (inj.trim()) {
         inner = inner.trimEnd();
         inner = inner + "\n" + inj + "\n";
      }
   }

   return before + inner + after;
}

function normalizePropLine(line: string): string {
   const t = line.trim();
   if (!t) return line;

   // Doc/comment lines should pass through.
   if (t.startsWith("/**") || t.startsWith("*/") || t.startsWith("*") || t.startsWith("//")) {
      return line;
   }

   // If it's already terminated, keep it.
   if (t.endsWith(";") || t.endsWith(",")) return line;

   return line + ";";
}

function findMatchingBrace(text: string, openIndex: number): number {
   let depth = 0;

   let inLineComment = false;
   let inBlockComment = false;
   let inSingle = false;
   let inDouble = false;
   let inTemplate = false;

   for (let i = openIndex; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      // Line comment
      if (inLineComment) {
         if (ch === "\n") inLineComment = false;
         continue;
      }

      // Block comment
      if (inBlockComment) {
         if (ch === "*" && next === "/") {
            inBlockComment = false;
            i++;
         }
         continue;
      }

      // Strings
      if (inSingle) {
         if (ch === "\\") {
            i++;
            continue;
         }
         if (ch === "'") inSingle = false;
         continue;
      }
      if (inDouble) {
         if (ch === "\\") {
            i++;
            continue;
         }
         if (ch === '"') inDouble = false;
         continue;
      }
      if (inTemplate) {
         if (ch === "\\") {
            i++;
            continue;
         }
         if (ch === "`") inTemplate = false;
         continue;
      }

      // Enter comment
      if (ch === "/" && next === "/") {
         inLineComment = true;
         i++;
         continue;
      }
      if (ch === "/" && next === "*") {
         inBlockComment = true;
         i++;
         continue;
      }

      // Enter string
      if (ch === "'") {
         inSingle = true;
         continue;
      }
      if (ch === '"') {
         inDouble = true;
         continue;
      }
      if (ch === "`") {
         inTemplate = true;
         continue;
      }

      // Braces
      if (ch === "{") {
         depth++;
         continue;
      }

      if (ch === "}") {
         depth--;
         if (depth === 0) return i;
      }
   }

   return -1;
}

function normalizeLf(s: string): string {
   return s.replace(/\r\n/g, "\n");
}

function ensureEndsWithNewline(s: string): string {
   const t = normalizeLf(s);
   return t.endsWith("\n") ? t : t + "\n";
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function indentBlock(text: string, indent = "  "): string {
   const trimmed = text.replace(/\r\n/g, "\n");
   if (!trimmed.trim()) return "";
   return trimmed
      .split("\n")
      .map((line) => (line.length ? indent + line : line))
      .join("\n");
}