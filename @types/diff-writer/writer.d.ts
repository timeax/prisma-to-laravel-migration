/**
 * Git-style 3-way merge writer that supports moving outputs.
 *
 * @param filePath      NEW destination file (after sort/repath)
 * @param theirs        Freshly-generated FULL text
 * @param type          'migrator' | 'model'  (for prettier flag)
 * @param overwrite     Skip writing when false & file exists at NEW path
 * @param currentPath   OPTIONAL: existing/OLD file path to merge from. If omitted, uses filePath.
 */
export declare function writeWithMerge(filePath: string, theirs: string, type: "migrator" | "model", overwrite?: boolean, currentPath?: string | null): Promise<void>;
