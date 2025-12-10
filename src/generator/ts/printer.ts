// generator/ts/printer.ts
// noinspection JSUnusedGlobalSymbols

import fs from "node:fs";
import path from "node:path";
import type { TsModelDefinition, TsEnumDefinition, TsImport } from "./types.js";
import { resolveStub, type StubConfig, formatStub } from "../../utils/utils.js";

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

type ModelStubFn = (
   model: TsModelDefinition,
   imports: string,
   content: string,
   body: string,
   moduleName: string
) => string;

type ModuleStubFn = (
   imports: string,
   content: string,
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

      const specialOutputs: string[] = [];

      for (const model of models) {
         const ctx = this.buildModelContext(model);
         const hasSpecialStub = this.hasModelSpecificStub(model);

         if (hasSpecialStub) {
            const singleContent = this.renderModelStandalone(ctx); // header + shape, no imports
            const body = this.wrapInModule(singleContent);
            const code = this.renderModelWithStub(model, ctx, singleContent, body);
            specialOutputs.push(code);
         } else {
            regularModelContexts.push(ctx);
            regularModelDefs.push(model);
         }
      }

      const importsBlock = this.collectImports(regularModelContexts);
      const interfacesContent = this.renderModelsBlock(regularModelContexts); // headers + shapes only
      const body = this.wrapInModule(interfacesContent);
      const mainFile = this.renderModuleWithStub(
         importsBlock,
         interfacesContent,
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
    */
   private collectImports(ctxs: TsModelContext[]): string {
      const set = new Set<string>();

      for (const ctx of ctxs) {
         const raw = (ctx.imports || "").replace(/\r\n/g, "\n");
         if (!raw.trim()) continue;

         for (const line of raw.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            set.add(trimmed);
         }
      }

      return Array.from(set).join("\n");
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
         lines.push(
            `${doc}${p.name}${optional}: ${p.type};`
         );
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
      content: string,
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
      content: string,
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
      const stubPath = resolveStub(this.stubConfig, "ts", "index");
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