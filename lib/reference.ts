// lib/reference.ts
// Parishioner-facing booking reference numbers, e.g. SAC-2026-K7M4QX.

import { randomInt } from 'crypto';
import { manilaYear } from '@/lib/dates';

// No 0/O/1/I/L so a reference read over the phone cannot be misheard.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const REFERENCE_PATTERN = /^SAC-\d{4}-[A-Z0-9]{6}$/;

export function generateReferenceNumber(now: Date = new Date()): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `SAC-${manilaYear(now)}-${suffix}`;
}

/** Forgiving normalisation of what a parishioner types: case, spaces, dashes. */
export function normalizeReference(input: string): string {
  const compact = input.trim().toUpperCase().replace(/[\s_]+/g, '');
  const m = /^SAC-?(\d{4})-?([A-Z0-9]{6})$/.exec(compact);
  return m ? `SAC-${m[1]}-${m[2]}` : compact;
}
