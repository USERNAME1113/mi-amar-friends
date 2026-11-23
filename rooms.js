// Keep these identifiers stable across visual and gameplay updates.
export const ROOM_PREFIXES = ['mwparty-v1-', 'mwparty-v2-'];
export function normalizeRoomCode(value) {
  return String(value || '').normalize('NFKC').replace(/[\s\-\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').toUpperCase();
}
export function isRoomCode(value) { return /^[A-Z0-9]{6}$/.test(normalizeRoomCode(value)); }
export function roomPeerIds(code) { return ROOM_PREFIXES.map(prefix => prefix + normalizeRoomCode(code)); }
