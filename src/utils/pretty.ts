// src/utils/pretty.ts
import * as prettier from "prettier";
import * as prettierPhp from "@prettier/plugin-php";

let cachedConfig: prettier.Config | null | undefined;

/** Load user's Prettier config once (respects .prettierrc / package.json / overrides). */
async function loadConfig(filePath?: string) {
  if (cachedConfig !== undefined) return cachedConfig;
  try {
    cachedConfig = await prettier.resolveConfig(filePath || process.cwd());
  } catch {
    cachedConfig = null; // fall back to defaults
  }
  return cachedConfig;
}

/** Safe formatter for php strings. */
export async function prettyPhp(
  content: string,
  opts: { parser?: "php"; filepathHint?: string } = {}
) {
  const parser = opts.parser ?? "css";
  try {
    const base = (await loadConfig(opts.filepathHint)) ?? {};
    return await prettier.format(content, {
      ...base,
      parser,
      tabWidth: 4,
      plugins: [prettierPhp as any],
      useTabs: true
    });
  } catch {
    // If Prettier throws (broken snippet etc.), return the original unformatted content
    return content;
  }
}