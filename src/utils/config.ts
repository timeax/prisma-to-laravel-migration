// loaders/config.ts
import fs from "fs";
import { readFile } from "fs/promises";
import { createRequire } from "module";
import { extname, dirname, resolve } from "path";
import { pathToFileURL } from "url";

function nearestPkgType(fromPath: string): "module" | "commonjs" {
  try {
    let dir = dirname(fromPath);
    for (; ;) {
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

const cache = new Map<string, Promise<any>>();

async function loadConfigUniversal(absPath: string): Promise<any> {
  if (cache.has(absPath)) return cache.get(absPath)!;

  const p = (async () => {
    const ext = extname(absPath).toLowerCase();
    const projType = nearestPkgType(absPath);
    const asUrl = pathToFileURL(absPath).href;
    const req = createRequire(import.meta.url);

    // Explicit extensions
    if (ext === ".cjs") {
      const mod = req(absPath);
      return (mod as any).default ?? mod;
    }
    if (ext === ".mjs") {
      const mod = await import(asUrl);
      return (mod as any).default ?? mod;
    }

    // .js — ambiguous; read file to decide calmly
    const code = await readFile(absPath, "utf8");
    const looksCJS = /\bmodule\.exports\b|\bexports\s*=/.test(code);

    if (projType === "commonjs" && looksCJS) {
      // CJS project, CJS code → require
      const mod = req(absPath);
      return (mod as any).default ?? mod;
    }

    if (projType === "module" && looksCJS) {
      // ESM project but CJS code → wrap on the fly via data URL
      const wrapped =
        `const module = { exports: {} }; const exports = module.exports;\n` +
        code +
        `\nexport default module.exports;`;
      const dataUrl =
        "data:text/javascript;base64," +
        Buffer.from(wrapped, "utf8").toString("base64");
      const mod = await import(dataUrl);
      return (mod as any).default ?? mod;
    }

    // Otherwise: treat as ESM
    const mod = await import(asUrl);
    return (mod as any).default ?? mod;
  })();

  cache.set(absPath, p);
  return p;
}

export async function loadConfig(configPath: string) {
  return await loadConfigUniversal(resolve(process.cwd(), configPath));
}