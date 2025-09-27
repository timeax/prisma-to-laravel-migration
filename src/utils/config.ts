// loaders/config.ts
import { pathToFileURL, fileURLToPath } from "url";
import { createRequire } from "module";
import { extname, dirname, resolve } from "path";
import fs from "fs";

/** find nearest package.json and read its "type" (defaults to "commonjs") */
function getNearestPkgType(fromPath: string): "module" | "commonjs" {
  try {
    let dir = dirname(fromPath);
    while (true) {
      const pj = resolve(dir, "package.json");
      if (fs.existsSync(pj)) {
        const type = JSON.parse(fs.readFileSync(pj, "utf8")).type;
        return type === "module" ? "module" : "commonjs";
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch { }
  return "commonjs";
}

// simple singleton cache to avoid double-loading the same file concurrently
const configCache = new Map<string, Promise<any>>();

async function loadConfigUniversal(absPath: string): Promise<any> {
  const key = absPath;
  if (configCache.has(key)) return configCache.get(key)!;

  const promise = (async () => {
    const ext = extname(absPath).toLowerCase();
    const projType = getNearestPkgType(absPath);
    const asUrl = pathToFileURL(absPath).href;
    const req = createRequire(import.meta.url);

    // Explicit extensions win:
    if (ext === ".mjs") {
      const mod = await import(asUrl);
      return mod.default ?? mod;
    }
    if (ext === ".cjs") {
      const mod = req(absPath);
      return (mod as any).default ?? mod;
    }

    // .js is ambiguous: respect package.json "type"
    if (projType === "module") {
      // ESM project: load as ESM
      const mod = await import(asUrl);
      return (mod as any).default ?? mod;
    } else {
      // CJS project: load via require
      const mod = req(absPath);
      return (mod as any).default ?? mod;
    }
  })();

  configCache.set(key, promise);
  try {
    const cfg = await promise;
    return cfg;
  } finally {
    // keep it cached for this process; remove if you prefer one-shot
  }
}

export async function loadConfig(configPath: string) {
  return await loadConfigUniversal(configPath);                // works for CJS or ESM
}