import { useCallback, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { asset } from '../config';
import { Icon } from './ui';
import { AVATARS, createAvatarStore, isAvatarId, type AvatarChoice, type AvatarSaveResult } from './avatar-store';
import './avatars.css';

let storage: Storage | undefined;
try { if (typeof window !== 'undefined') storage = window.localStorage; } catch { /* Private browsing can disable storage. */ }
const store = createAvatarStore(storage);
function subscribe(listener: () => void) {
  const unsubscribe = store.subscribe(listener);
  const sync = (event: StorageEvent) => { if (!event.storageArea || event.storageArea === storage) store.sync(event.key); };
  window.addEventListener('storage', sync);
  return () => { unsubscribe(); window.removeEventListener('storage', sync); };
}
export function useUserAvatar(principal?: string | null) {
  const selected = useSyncExternalStore(subscribe, () => principal ? store.read(principal) : null, () => null);
  const select = useCallback((choice: AvatarChoice) => principal ? store.select(principal, choice) : false, [principal]);
  const save = useCallback((choice: AvatarChoice): AvatarSaveResult => principal ? store.save(principal, choice) : 'invalid', [principal]);
  return { selected, select, save };
}
export function AvatarArtwork({ id, size = 36, className }: { id: AvatarChoice; size?: number; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = !isAvatarId(id);
  const src = photo && failed !== id.dataUrl ? id.dataUrl : asset(`avatars/${photo ? id.preset : id}.svg`);
  return <span className={`user-avatar${photo ? ' user-avatar--photo' : ''}${className ? ` ${className}` : ''}`} style={{ '--avatar-size': `${size}px` } as CSSProperties} aria-hidden="true"><img src={src} alt="" width={size} height={size} draggable={false} onError={photo ? () => setFailed(id.dataUrl) : undefined} /></span>;
}
export function UserAvatar({ principal, size = 36, className }: { principal?: string | null; size?: number; className?: string }) {
  const { selected } = useUserAvatar(principal);
  return selected ? <AvatarArtwork id={selected} size={size} className={className} /> : <span className={`user-avatar user-avatar--guest${className ? ` ${className}` : ''}`} style={{ '--avatar-size': `${size}px` } as CSSProperties} aria-hidden="true"><Icon name="user" size={Math.round(size * .5)} /></span>;
}
export { AVATARS };
