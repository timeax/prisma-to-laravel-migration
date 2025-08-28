/** Safe formatter for php strings. */
export declare function prettyPhp(content: string, opts?: {
    parser?: "php";
    filepathHint?: string;
}): Promise<string>;
