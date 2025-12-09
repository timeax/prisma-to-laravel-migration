/** Safe formatter for php strings. */
export declare function prettify(content: string, opts?: {
    parser?: "php" | 'typescript';
    filepathHint?: string;
}): Promise<string>;
