/** User-supplied artwork. IDs stay stable when the presentation order changes. */
export const AVATARS = [
  { id: 'avatar-01', label: 'Surprised' }, { id: 'avatar-02', label: 'Wink' },
  { id: 'avatar-03', label: 'Peaceful' }, { id: 'avatar-04', label: 'Cloud' },
  { id: 'avatar-05', label: 'Curious' }, { id: 'avatar-06', label: 'Ripple' },
  { id: 'avatar-07', label: 'Thoughtful' }, { id: 'avatar-08', label: 'Cheerful' },
  { id: 'avatar-09', label: 'Spark' }, { id: 'avatar-10', label: 'Sleepy' },
  { id: 'avatar-11', label: 'Pebble' }, { id: 'avatar-12', label: 'Daydream' },
  { id: 'avatar-13', label: 'Smile' }, { id: 'avatar-14', label: 'Calm' },
  { id: 'avatar-15', label: 'Wave' }, { id: 'avatar-16', label: 'Blossom' },
  { id: 'avatar-17', label: 'Ponder' }, { id: 'avatar-18', label: 'Moon' },
  { id: 'avatar-19', label: 'Star' }, { id: 'avatar-20', label: 'Joy' },
] as const;
export type AvatarId = typeof AVATARS[number]['id'];
export const AVATAR_STORAGE_PREFIX = 'apcosys.avatar.v1:';
const available = new Set<string>(AVATARS.map(item => item.id));
export function isAvatarId(value: unknown): value is AvatarId { return typeof value === 'string' && available.has(value); }
export function avatarStorageKey(principal: string) {
  // A stable opaque lookup key, not an authentication or encryption primitive.
  // Never persist the account ID, email, or other profile fields with the artwork choice.
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(principal)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return AVATAR_STORAGE_PREFIX + hash.toString(16).padStart(16, '0');
}
export function randomAvatar(random = Math.random, previous?: AvatarId): AvatarId {
  const choices = previous ? AVATARS.filter(item => item.id !== previous) : AVATARS;
  const value = random();
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * choices.length)));
  return choices[index].id;
}

type AvatarStorage = Pick<Storage, 'getItem' | 'setItem'>;
/** The API has no avatar field. Keep this device preference separate from the profile payload. */
export function createAvatarStore(storage?: AvatarStorage, random = Math.random) {
  const cached = new Map<string, AvatarId>();
  const listeners = new Set<() => void>();
  function read(principal: string): AvatarId {
    const existing = cached.get(principal);
    if (existing) return existing;
    let saved: string | null = null;
    try { saved = storage?.getItem(avatarStorageKey(principal)) ?? null; } catch { /* Storage may be disabled. */ }
    const selected = isAvatarId(saved) ? saved : randomAvatar(random);
    cached.set(principal, selected);
    if (!isAvatarId(saved)) { try { storage?.setItem(avatarStorageKey(principal), selected); } catch { /* Keep a stable in-memory preference. */ } }
    return selected;
  }
  return {
    read,
    select(principal: string, value: unknown) {
      if (!isAvatarId(value)) return false;
      if (read(principal) === value) return true;
      cached.set(principal, value);
      try { storage?.setItem(avatarStorageKey(principal), value); } catch { /* Live selection still works without storage. */ }
      listeners.forEach(listener => listener());
      return true;
    },
    sync(key: string | null) {
      if (key !== null && !key.startsWith(AVATAR_STORAGE_PREFIX)) return;
      if (key === null) cached.clear();
      else for (const principal of cached.keys()) { if (avatarStorageKey(principal) === key) cached.delete(principal); }
      listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
