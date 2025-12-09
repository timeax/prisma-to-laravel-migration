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
 *
 * We keep the syntax forgiving:
 *  - parentheses () or braces {} are both allowed
 *  - entries separated by comma
 *  - each entry is `name` or `name:type`
 */
export function parseAppendsDirective(doc?: string | null): AppendsDirective | undefined {
   if (!doc) return undefined;

   // Find the first "@appends..." occurrence
   const m = doc.match(/@appends\s*(\{[^}]*\}|\([^)]*\)|[^\r\n]*)/);
   if (!m) return undefined;

   let body = m[1].trim();

   // Strip surrounding {} or ()
   if ((body.startsWith("{") && body.endsWith("}")) || (body.startsWith("(") && body.endsWith(")"))) {
      body = body.slice(1, -1).trim();
   }

   if (!body) return undefined;

   const entries: AppendEntry[] = [];

   // Split by commas at top-level (no need for deep parsing here)
   for (const raw of body.split(",")) {
      const token = raw.trim();
      if (!token) continue;

      // Support "name" or "name:type"
      const [nameRaw, typeRaw] = token.split(":").map((s) => s.trim());
      if (!nameRaw) continue;

      const name = nameRaw;
      const type = typeRaw && typeRaw.length ? typeRaw : undefined;

      entries.push({ name, type });
   }

   if (!entries.length) return undefined;
   return { entries };
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