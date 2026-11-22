// ---- reading untrusted data (saves, files, share links): small checks shared by the readers ------

export type Obj = { [k: string]: unknown };
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export const int = (v: unknown, min: number, max: number, fallback: number) => Math.round(num(v, min, max, fallback));
export const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
export const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
