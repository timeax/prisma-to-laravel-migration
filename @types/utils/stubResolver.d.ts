import type { StubConfig } from './utils';
/**
 * Resolve the actual stub file for a given table / enum / TS symbol.
 *
 * Layout convention:
 *   <stubDir>/
 *     migration/
 *       index.stub
 *       users.stub
 *       posts.stub
 *     model/
 *       index.stub
 *       User.stub
 *       Post.stub
 *     enum/
 *       index.stub
 *       Status.stub
 *     ts/
 *       index.stub
 *       User.stub
 *       Post.stub
 *
 * Returns `undefined` when *nothing* can be found — the caller may then
 * choose to fall back to a built-in template or throw.
 */
export declare function resolveStub(cfg: StubConfig | undefined, type: 'migration' | 'model' | 'enum' | 'ts', table: string): string | undefined;
