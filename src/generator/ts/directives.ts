// generator/ts/directives.ts
import type { DMMF } from "@prisma/generator-helper";

export interface TypeDirective {
   import?: string;
   type: string;
}

/**
 * Single entry in `@appends(...)`
 * - `name` is the append key
 * - `type` is optional; if omitted, TS generator can treat it as `any` or skip.
 */
export interface AppendEntry {
   name: string;
   type?: string;
}

/**
 * Parsed `@appends(...)` directive.
 */
export interface AppendsDirective {
   entries: AppendEntry[];
}

/**
 * Parse a `@type{ import: 'foo', type: 'Bar' }` directive
 * from a documentation string.
 *
 * Works for both **field-level** and **model-level** docs.
 */
export function parseTypeDirective(doc?: string | null): TypeDirective | undefined {
   if (!doc) return undefined;

   const m = doc.match(
      /@type\{\s*(?:import\s*:\s*'([^']+)')?\s*,?\s*type\s*:\s*'([^']+)'\s*\}/
   );

   return m
      ? {
         import: m[1] || undefined,
         type: m[2],
      }
      : undefined;
}

/**
 * Parse `@appends` from model-level documentation.
 *
 * Supports:
 * - @appends(foo, bar)
 * - @appends(foo:string, bar:Record<string, any>)
 * - @appends{ foo, bar }
 * - @appends{ foo:string, bar:number }
 * - @appends: foo, bar
 * - @appends: foo:string, bar:Record<string, any>
 *
 * Forgiving rules:
 *  - parentheses () or braces {} or colon-form are allowed
 *  - entries separated by comma
 *  - each entry is `name` or `name:type`
 */
export function parseAppendsDirective(doc?: string | null): AppendsDirective | undefined {
   if (!doc) return undefined;

   // Capture the directive body, supporting:
   //   @appends{...}
   //   @appends(...)
   //   @appends: ...
   //   @appends ... (rest of line)
   const m = doc.match(/@appends\s*(?::\s*)?(\{[^}]*\}|\([^)]*\)|[^\r\n]*)/i);
   if (!m) return undefined;

   let body = (m[1] ?? "").trim();

   // Strip surrounding {} or ()
   if (
      (body.startsWith("{") && body.endsWith("}")) ||
      (body.startsWith("(") && body.endsWith(")"))
   ) {
      body = body.slice(1, -1).trim();
   }

   // Safety: if something slipped through like ":owner,..."
   if (body.startsWith(":")) body = body.slice(1).trim();

   if (!body) return undefined;

   const entries: AppendEntry[] = [];

   // Split by commas (simple, forgiving)
   for (const raw of body.split(",")) {
      const token = raw.trim();
      if (!token) continue;

      // Split ONLY on the first ":" so types can contain ":" safely
      const idx = token.indexOf(":");
      const name = (idx === -1 ? token : token.slice(0, idx)).trim();
      const type = (idx === -1 ? "" : token.slice(idx + 1)).trim();

      if (!name) continue;

      entries.push({
         name,
         type: type.length ? type : undefined,
      });
   }

   return entries.length ? { entries } : undefined;
}

/**
 * Convenience helpers to get directives directly from DMMF.
 */
export function getModelTypeDirective(model: DMMF.Model): TypeDirective | undefined {
   return parseTypeDirective(model.documentation);
}

export function getFieldTypeDirective(field: DMMF.Field): TypeDirective | undefined {
   return parseTypeDirective(field.documentation);
}

export function getModelAppendsDirective(model: DMMF.Model): AppendsDirective | undefined {
   return parseAppendsDirective(model.documentation);
}