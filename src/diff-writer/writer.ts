// writeWithMerge.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import * as diff3 from "node-diff3";
import { backupPathFor } from "./backupPath.js";

/**
 * Git-style 3-way merge writer.
 *
 * @param filePath    Destination file
 * @param theirs      Freshly-generated FULL text
 * @param overwrite   Skip writing when false & file exists
 */
export function writeWithMerge(
   filePath: string,
   theirs: string,
   overwrite = true
) {
   if (!overwrite && existsSync(filePath)) return;

   /* ---------- Paths & snapshots ---------- */
   const bakPath = backupPathFor(filePath);          // .prisma-laravel/backups/…
   const base = existsSync(bakPath)
      ? readFileSync(bakPath, "utf-8")
      : null;                                         // previous generator output
   const mine = existsSync(filePath)
      ? readFileSync(filePath, "utf-8")
      : null;                                         // user’s current file

   /* ---------- First run: file missing ---------- */
   if (mine === null) {
      writeFileSync(filePath, theirs, "utf-8");
      writeFileSync(bakPath, theirs, "utf-8");
      return;
   }

   /* ---------- Up-to-date ---------- */
   if (mine === theirs) return; // nothing changed

   /* ---------- Generator unchanged, user edited ---------- */
   if (theirs === base) {
      // keep user edits, just refresh baseline
      writeFileSync(bakPath, theirs, "utf-8");
      return;
   }

   /* ---------- User untouched, generator updated ---------- */
   if (mine === base) {
      writeFileSync(filePath, theirs, "utf-8");
      writeFileSync(bakPath, theirs, "utf-8");
      return;
   }

   /* ---------- Real divergence: diff3 ---------- */
   const mergedLines = diff3.merge(
      mine.split(/\r?\n/),
      (base ?? "").split(/\r?\n/),
      theirs.split(/\r?\n/),
      { stringSeparator: "\n" }
   ).result;
   const mergedText = mergedLines.join("\n");
   /* conflict marker detection */
   if (/^(<{7}|={7}|>{7})/gm.test(mergedText)) {
      console.warn(
         `⚠️  Merge conflicts in ${path.relative(process.cwd(), filePath)} ` +
         "— resolve <<< >>> markers."
      );
   }

   writeFileSync(filePath, mergedText, "utf-8");
   writeFileSync(bakPath, theirs, "utf-8"); // new baseline
}