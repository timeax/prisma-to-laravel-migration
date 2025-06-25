// writeWithMerge.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import * as diff3 from "node-diff3";
import { backupPathFor } from "./backupPath.js";

/**
 * Git-style 3-way merge writer.
 * @param filePath      Destination file
 * @param newContent    Freshly generated FULL text
 * @param overwrite     Skip write if false and file exists
 */
export function writeWithMerge(
   filePath: string,
   newContent: string,
   overwrite = true
) {
   if (!overwrite && existsSync(filePath)) return;

   const bakPath = backupPathFor(filePath);
   const base = existsSync(bakPath) ? readFileSync(bakPath, "utf-8") : null;

   /* initial write */
   if (!existsSync(filePath)) {
      writeFileSync(filePath, newContent, "utf-8");
      writeFileSync(bakPath, newContent, "utf-8");
      return;
   }

   const mine = readFileSync(filePath, "utf-8");
   if (mine === newContent) return; // already up-to-date

   /* no baseline yet → save current as baseline, overwrite */
   if (!base) {
      writeFileSync(bakPath, mine, "utf-8");
      writeFileSync(filePath, newContent, "utf-8");
      return;
   }

   /* diff3 merge */
   const merged = diff3
      .merge(
         mine.split(/\r?\n/),
         base.split(/\r?\n/),
         newContent.split(/\r?\n/),
         { stringSeparator: "\n" }
      ).result.join("\n");

   writeFileSync(filePath, merged, "utf-8");
   writeFileSync(bakPath, newContent, "utf-8"); // update baseline
}