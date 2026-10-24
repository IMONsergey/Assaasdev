import { useEffect, useRef, useState } from 'react';
import { AvatarArtwork, AVATARS, useUserAvatar } from '../../components/UserAvatar';
import { randomAvatar, type AvatarId } from '../../components/avatar-store';
import { Button, Dialog, Icon } from '../../components/ui';
import { useApp } from '../../app/AppProvider';

export function AvatarPicker({ principal, onClose }: { principal: string; onClose: () => void }) {
  const { selected, select } = useUserAvatar(principal);
  const { toast } = useApp();
  const [draft, setDraft] = useState<AvatarId>(() => selected ?? AVATARS[0].id);
  const choices = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let current = true;
    // The parent dialog first establishes its modal focus boundary.
    queueMicrotask(() => { if (current) choices.current?.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true }); });
    return () => { current = false; };
  }, []);
  return <Dialog open onClose={onClose} title="Choose your avatar" size="sm" className="avatar-dialog" footer={<><Button variant="ghost" className="avatar-shuffle" aria-label="Surprise me" title="Surprise me" onClick={() => setDraft(randomAvatar(Math.random, draft))}><Icon name="refresh" size={17} /><span className="avatar-shuffle-label">Surprise me</span></Button><div className="avatar-picker-confirm"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { if (select(draft)) { onClose(); toast('Avatar updated.', 'success'); } }}>Use avatar</Button></div></>}>
    <div className="avatar-picker-preview"><AvatarArtwork id={draft} size={64} /><div><strong>{AVATARS.find(item => item.id === draft)?.label}</strong><p>Preview</p></div></div>
    <div ref={choices} className="avatar-picker-grid" role="radiogroup" aria-label="Avatars">{AVATARS.map((item,index) => <label key={item.id} className="avatar-choice" title={item.label}><input type="radio" name="profile-avatar" value={item.id} checked={draft === item.id} onChange={() => setDraft(item.id)} aria-label={`Avatar ${index + 1}: ${item.label}`} /><AvatarArtwork id={item.id} size={64} />{draft === item.id && <span className="avatar-choice-check" aria-hidden="true"><Icon name="check" size={13} /></span>}</label>)}</div>
    <p className="avatar-picker-footer-note">Applies to this account on this device.</p>
  </Dialog>;
}
