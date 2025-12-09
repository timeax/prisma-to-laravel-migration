/**
 * Remove any @-directive (and its immediate args) from a Prisma doc string.
 *
 * Matches:
 *  • @name
 *  • @name(...)
 *  • @name{...}
 *  • @name:Something
 *
 * Leaves all other text intact.
 *
 * @param doc  the original documentation string (may be `///` above or inline)
 * @returns    the cleaned doc, or `undefined` if it’s empty
 */
export declare function stripDirectives(doc?: string): string;
