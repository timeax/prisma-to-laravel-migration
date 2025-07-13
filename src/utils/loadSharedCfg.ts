// utils/loadSharedCfg.ts
import fs from "fs";
import { LaravelSharedConfig } from "types/laravel-config";
import path from "path";
/** ---------------- shared-config loader ---------------- */
export async function loadSharedConfig(schemaDir: string): Promise<LaravelSharedConfig> {
  const envOverride = process.env.PRISMA_LARAVEL_CFG;
  const defaultPath = path.join(schemaDir, "prisma-laravel.config.js");
  const cfgPath = envOverride ? path.resolve(envOverride) : defaultPath;

  console.log("Loading shared config from - " + schemaDir)

  try {
    await fs.accessSync(cfgPath);
    const mod = await import(cfgPath);
    return (mod.default ?? mod) as LaravelSharedConfig;
  } catch (err) {
    console.error((err as Error).message);
    return {}; // no shared config
  }
}
