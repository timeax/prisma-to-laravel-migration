import { StubConfig } from './utils';
/**
 * Resolve the actual stub file for a given table / enum.
 * Returns `undefined` when *nothing* can be found — caller may throw.
 */
export declare function resolveStub(cfg: StubConfig | undefined, type: 'migration' | 'model' | 'enum', table: string): string | undefined;
