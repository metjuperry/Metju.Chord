import type { PartId, SectionId, StripId } from './ids';

// ---- for tests only: literal ids as the branded ids they stand for --------------------------------

export const pid = (id: string) => id as PartId;
export const sid = (id: string) => id as SectionId;
export const strip = (id: string) => id as StripId;
/** A record keyed by part ids (content, mutes, sound), written with literal keys. */
export const byPart = <T>(rec: { [id: string]: T }): { [id: PartId]: T } => rec;
