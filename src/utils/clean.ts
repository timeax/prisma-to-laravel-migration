/* ------------------------------------------------------------------
 *  1️⃣  Whitelist of recognised directives
 * ------------------------------------------------------------------
 *  • simple flags   →   @fillable   @hidden   @guarded   @ignore   @with
 *  • params (…)     →   @with(...)                (@with with args)
 *  • params {…}     →   @cast{…}   @type{…}   @touch{…}   @appends{…}
 *  • namespaced     →   @trait:Foo\Bar
 *                       @implements:Foo\Bar as Alias
 *                       @observer:App\Observers\Thing
 *                       @factory:Database\Factories\UserFactory
 *                       @extend:Foo\Bar
 * ------------------------------------------------------------------ */
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
export function stripDirectives(doc?: string): string | undefined {
  if (!doc) return undefined;
  // 1) remove all @directives with optional (), {} or :… args
  const cleaned = doc
    .replace(/@\w+(?:\([^)]*\)|\{[^}]*\}|:[^\s]*)?/g, '')
    // 2) collapse multiple spaces/newlines into single space
    .replace(/[\s\uFEFF\xA0]{2,}/g, ' ')
    .trim();
  return cleaned.length ? cleaned : undefined;
}