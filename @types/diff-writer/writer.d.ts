/**
 * Git-style 3-way merge writer.
 * @param filePath      Destination file
 * @param newContent    Freshly generated FULL text
 * @param overwrite     Skip write if false and file exists
 */
export declare function writeWithMerge(filePath: string, newContent: string, overwrite?: boolean): void;
