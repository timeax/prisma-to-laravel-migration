// writeWithMerge.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import * as diff3 from "node-diff3";
import { backupPathFor } from "./backupPath.js";
import { prettyPhp } from "../utils/pretty.js";

/**
 * Git-style 3-way merge writer that supports moving outputs.
 *
 * @param filePath      NEW destination file (after sort/repath)
 * @param theirs        Freshly-generated FULL text
 * @param type          'migrator' | 'model'  (for prettier flag)
 * @param overwrite     Skip writing when false & file exists at NEW path
 * @param currentPath   OPTIONAL: existing/OLD file path to merge from. If omitted, uses filePath.
 */
export async function writeWithMerge(
  filePath: string,
  theirs: string,
  type: "migrator" | "model",
  overwrite = true,
  currentPath?: string | null
) {
  const readPath = currentPath ?? filePath;          // where the user's current file lives
  if (!overwrite && existsSync(filePath)) return;

  const doFormat = (code: string | null | undefined) =>
    (global as any)?._config?.[type]?.prettier
      ? (code ? prettyPhp(code, { parser: "php", filepathHint: filePath }) : code)
      : code;

  /* ---------- Paths & snapshots ---------- */
  const bakOld = backupPathFor(readPath);           // OLD baseline (pre-sort)
  const bakNew = backupPathFor(filePath);           // NEW baseline (post-sort)

  // normalize inputs
  theirs = (await doFormat(theirs)) as string;

  const base = await doFormat(existsSync(bakOld) ? readFileSync(bakOld, "utf-8") : null);
  const mine = await doFormat(existsSync(readPath) ? readFileSync(readPath, "utf-8") : null);

  /* ---------- First run: no existing file ---------- */
  if (mine === null) {
    writeFileSync(filePath, theirs, "utf-8");
    writeFileSync(bakNew, theirs, "utf-8");
    // cleanup old backup if we moved
    if (currentPath && bakOld !== bakNew && existsSync(bakOld)) safeUnlink(bakOld);
    return;
  }

  /* ---------- Up-to-date ---------- */
  if (mine === theirs) {
    // still refresh baseline at NEW location
    writeFileSync(bakNew, theirs, "utf-8");
    if (currentPath && bakOld !== bakNew && existsSync(bakOld)) safeUnlink(bakOld);
    return;
  }

  /* ---------- Generator unchanged, user edited ---------- */
  if (theirs === base) {
    // keep user edits, just refresh NEW baseline (so future merges diff against theirs)
    writeFileSync(bakNew, theirs, "utf-8");
    if (currentPath && bakOld !== bakNew && existsSync(bakOld)) safeUnlink(bakOld);
    // Do NOT overwrite user's edits at readPath/filePath; only baseline moves.
    // If readPath !== filePath (moved), also carry the user's file over:
    if (readPath !== filePath) {
      writeFileSync(filePath, mine ?? "", "utf-8");
    }
    return;
  }

  /* ---------- User untouched, generator updated ---------- */
  if (mine === base) {
    writeFileSync(filePath, theirs, "utf-8");
    writeFileSync(bakNew, theirs, "utf-8");
    if (currentPath && bakOld !== bakNew && existsSync(bakOld)) safeUnlink(bakOld);
    return;
  }

  /* ---------- Real divergence: diff3 ---------- */
  const mergedLines = diff3.merge(
    // @ts-ignore types accept string[] | {stringSeparator}
    mine.split(/\r?\n/),
    (base ?? "").split(/\r?\n/),
    theirs.split(/\r?\n/),
    { stringSeparator: "\n" }
  ).result;
  const mergedText = mergedLines.join("\n");

  // conflict marker detection (multiline)
  if (/^(<{7}|={7}|>{7})/m.test(mergedText)) {
    console.warn(
      `⚠️  Merge conflicts in ${path.relative(process.cwd(), filePath)} — resolve <<< >>> markers.`
    );
  }

  writeFileSync(filePath, mergedText, "utf-8");
  writeFileSync(bakNew, theirs, "utf-8"); // new baseline

  // cleanup old baseline if the path changed
  if (currentPath && bakOld !== bakNew && existsSync(bakOld)) safeUnlink(bakOld);
}

/* ---------------- helpers ---------------- */
function safeUnlink(p: string) {
  try { unlinkSync(p); } catch {}
}