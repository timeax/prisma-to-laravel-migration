import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import * as diff3 from "node-diff3";
import { backupPathFor } from "./backupPath.js";
import { prettify } from "../utils/pretty.js";

/**
 * Git-style 3-way merge writer that supports moving outputs.
 *
 * @param filePath      NEW destination file (after sort/repath)
 * @param theirs        Freshly-generated FULL text
 * @param type          'migrator' | 'model' | 'ts'  (selects prettier section)
 * @param overwrite     Skip writing when false & file exists at NEW path
 * @param currentPath   OPTIONAL: existing/OLD file path to merge from. If omitted, uses filePath.
 * @param removeOld     After success, delete old file if path moved (default true)
 */
export async function writeWithMerge(
   filePath: string,
   theirs: string,
   type: "migrator" | "model" | "ts",
   overwrite = true,
   currentPath?: string | null,
   removeOld = true
) {
   const readPath = currentPath ?? filePath; // source for mine/base
   if (!overwrite && existsSync(filePath)) return;

   /**
    * Format helper aware of:
    *   global._config[type].prettier  → boolean
    *   global._config[type].parser   → 'php' | 'ts' (optional)
    *
    * Defaults:
    *   - parser = 'ts' when type === 'ts'
    *   - parser = 'php' otherwise
    */
   const doFormat = (code: string | null | undefined) => {
      const globalCfg = (global as any)?._config ?? {};
      const typeCfg = globalCfg[type] ?? {};
      const usePrettier = !!typeCfg.prettier;

      if (!usePrettier || !code) return code;

      const parser: "php" | "typescript" =
         typeCfg.parser ?? (type === "ts" ? "typescript" : "php");

      return prettify(code, {
         parser,
         filepathHint: filePath,
      });
   };

   const bakOld = backupPathFor(readPath);
   const bakNew = backupPathFor(filePath);

   theirs = (await doFormat(theirs)) as string;
   const base = await doFormat(
      existsSync(bakOld) ? readFileSync(bakOld, "utf-8") : null
   );
   const mine = await doFormat(
      existsSync(readPath) ? readFileSync(readPath, "utf-8") : null
   );

   const moved = readPath !== filePath;

   // helper to clean old artifacts when path moved
   const cleanupOld = () => {
      if (moved && existsSync(bakOld)) safeUnlink(bakOld);
      if (moved && removeOld && existsSync(readPath)) safeUnlink(readPath);
   };

   // 1) First run: no existing file
   if (mine == null) {
      writeFileSync(filePath, theirs, "utf-8");
      writeFileSync(bakNew, theirs, "utf-8");
      cleanupOld();
      return;
   }

   // 2) Up-to-date
   if (mine === theirs) {
      // ensure file exists at new path if moved
      if (moved) writeFileSync(filePath, mine, "utf-8");
      writeFileSync(bakNew, theirs, "utf-8");
      cleanupOld();
      return;
   }

   // 3) Generator unchanged, user edited (or file missing but backup exists)
   if (theirs === base) {
      const destMissing = !existsSync(filePath);
      // keep user edits if present; otherwise rehydrate from theirs
      if (moved || destMissing) writeFileSync(filePath, mine ?? theirs, "utf-8");
      writeFileSync(bakNew, theirs, "utf-8");
      cleanupOld();
      return;
   }

   // 4) User untouched, generator updated
   if (mine === base) {
      writeFileSync(filePath, theirs, "utf-8");
      writeFileSync(bakNew, theirs, "utf-8");
      cleanupOld();
      return;
   }

   // 5) Real divergence: diff3 merge (be null-safe on mine/base)
   const mergedLines = diff3.merge(
      (mine ?? "").split(/\r?\n/),
      (base ?? "").split(/\r?\n/),
      theirs.split(/\r?\n/),
      { stringSeparator: "\n" }
   ).result;

   const mergedText = mergedLines.join("\n");

   if (/^(<{7}|={7}|>{7})/m.test(mergedText)) {
      console.warn(
         `⚠️  Merge conflicts in ${path.relative(
            process.cwd(),
            filePath
         )} — resolve <<< >>> markers.`
      );
   }

   writeFileSync(filePath, mergedText, "utf-8");
   writeFileSync(bakNew, theirs, "utf-8");
   cleanupOld();
}

/* ---------------- helpers ---------------- */
function safeUnlink(p: string) {
   try {
      unlinkSync(p);
   } catch {
      // ignore
   }
}