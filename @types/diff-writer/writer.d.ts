/**
 * Git-style 3-way merge writer.
 *
 * @param filePath    Destination file
 * @param theirs      Freshly-generated FULL text
 * @param overwrite   Skip writing when false & file exists
 */
export declare function writeWithMerge(filePath: string, theirs: string, type: 'migrator' | 'model', overwrite?: boolean): Promise<void>;
