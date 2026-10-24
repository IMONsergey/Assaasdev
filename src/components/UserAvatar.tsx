import { useCallback, useSyncExternalStore, type CSSProperties } from 'react';
import { asset } from '../config';
import { Icon } from './ui';
import { AVATARS, createAvatarStore, type AvatarId } from './avatar-store';
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
  const select = useCallback((id: AvatarId) => principal ? store.select(principal, id) : false, [principal]);
  return { selected, select };
}
export function AvatarArtwork({ id, size = 36, className }: { id: AvatarId; size?: number; className?: string }) {
  return <span className={`user-avatar${className ? ` ${className}` : ''}`} style={{ '--avatar-size': `${size}px` } as CSSProperties} aria-hidden="true"><img src={asset(`avatars/${id}.svg`)} alt="" width={size} height={size} draggable={false} /></span>;
}
export function UserAvatar({ principal, size = 36, className }: { principal?: string | null; size?: number; className?: string }) {
  const { selected } = useUserAvatar(principal);
  return selected ? <AvatarArtwork id={selected} size={size} className={className} /> : <span className={`user-avatar user-avatar--guest${className ? ` ${className}` : ''}`} style={{ '--avatar-size': `${size}px` } as CSSProperties} aria-hidden="true"><Icon name="user" size={Math.round(size * .5)} /></span>;
}
export { AVATARS };
