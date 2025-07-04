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
const DIRECTIVE_NAMES = [
   // simple flags
   'fillable', 'hidden', 'guarded', 'ignore', 'with',
   // block args
   'cast', 'type', 'touch', 'appends',
   // namespaced
   'trait', 'implements', 'observer', 'factory', 'extend',
];

/* Build one giant, *explicit* RegExp */
const DIRECTIVE_RE = new RegExp(
   String.raw`@(?:${[
      //  @fillable   @ignore   @with
      ...DIRECTIVE_NAMES.map(n => `${n}\\b`).join('|'),
      //  @with(...)   (keep directive name before parens)
      'with\\([^)]*\\)',
      //  @cast{..}  @type{..}  @touch{..}  @appends{..}
      '(?:cast|type|touch|appends)\\{[^}]*\\}',
      //  @trait:Namespace\Foo  (@implements may have " as Alias")
      '(?:trait|implements|observer|factory|extend):[^\\s]+(?:\\s+as\\s+\\w+)?',
   ].join('|')
      })`,
   'gi'
);

/** Remove our directives only */
export function stripDirectives(doc?: string): string | undefined {
   if (!doc) return undefined;
   const cleaned = doc.replace(DIRECTIVE_RE, '').trim();
   return cleaned.length ? cleaned : undefined;
}