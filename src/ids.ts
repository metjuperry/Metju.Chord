// ---- ids: branded strings, so a part's id, a section's and an engine strip's can't be mixed up ----
//
// Each is a plain string at run time (in saves, links, records and the DOM), but the compiler keeps them
// apart: a `PartId` can't go where a `StripId` is wanted (a live note goes to the strip its section plays
// the part through, `stripId`), and a plain string can't go where either is. They're made only by the id
// generators (`newPart`, `addSection`…), by the readers through `isPartId` / `isSectionId`, and by `stripId`.

export type PartId = string & { readonly __brand: 'PartId' };
export type SectionId = string & { readonly __brand: 'SectionId' };
/** An engine strip: a part's own (`partId`), or a section's for it (`partId@sectionId`), see `stripId`. */
export type StripId = string & { readonly __brand: 'StripId' };

/**
 * An id from a save: short, and only letters, digits, - and _. Ids are keys of plain records (content,
 * mutes, sound) and part of engine strip names (`part@section`), so "__proto__" or "p1@s1" aren't ids.
 */
const isIdText = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) && !(v in Object.prototype);
export const isPartId = (v: unknown): v is PartId => isIdText(v);
export const isSectionId = (v: unknown): v is SectionId => isIdText(v);

/** Part ids are `p` and a number, section ids `s` and a number (with a letter after when that's taken). */
export const partIdFor = (n: number) => `p${n}` as PartId;
export const sectionIdFor = (n: number, suffix = '') => `s${n}${suffix}` as SectionId;

/** The strip a part plays through where nothing sounds it differently: its own. */
export const partStrip = (id: PartId) => id as string as StripId;
/** The strip a section plays a part through when it sounds that part its own way. */
export const sectionStrip = (partId: PartId, sectionId: SectionId) => `${partId}@${sectionId}` as StripId;

/** The keys of a record keyed by ids (content, mutes, sound), as those ids. */
export const idsOf = <K extends string>(rec: { [k in K]?: unknown }): K[] => Object.keys(rec) as K[];
