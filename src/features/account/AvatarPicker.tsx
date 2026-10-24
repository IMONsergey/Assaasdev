import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { AvatarArtwork, AVATARS, useUserAvatar } from '../../components/UserAvatar';
import { isAvatarId, randomAvatar, type AvatarChoice } from '../../components/avatar-store';
import { AVATAR_FILE_ACCEPT, prepareAvatarImage } from '../../components/avatar-image';
import { Button, Dialog, Icon } from '../../components/ui';
import { useApp } from '../../app/AppProvider';

export function AvatarPicker({ principal, onClose }: { principal: string; onClose: () => void }) {
  const { selected, save } = useUserAvatar(principal);
  const { toast } = useApp();
  const [draft, setDraft] = useState<AvatarChoice>(() => selected ?? AVATARS[0].id);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const descriptionId = useId(), errorId = useId();
  const photo = !isAvatarId(draft);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) fileInput.current?.focus({ preventScroll: true }); });
    return () => { active = false; operation.current++; };
  }, []);

  function choose(value: AvatarChoice) {
    operation.current++;
    setDraft(value); setPreparing(false); setError(''); setNotice('');
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const token = ++operation.current;
    const preset = isAvatarId(draft) ? draft : draft.preset;
    setPreparing(true); setError(''); setNotice('Preparing your photo…');
    try {
      const dataUrl = await prepareAvatarImage(file);
      if (token !== operation.current) return;
      setDraft({ kind: 'photo', dataUrl, preset });
      setNotice('Photo ready. Check the preview, then save.');
    } catch (cause) {
      if (token !== operation.current) return;
      setError(cause instanceof Error ? cause.message : 'This image could not be opened. Try another file.');
      setNotice('');
    } finally { if (token === operation.current) setPreparing(false); }
  }
  function confirm() {
    const result = save(draft);
    if (result === 'invalid') { setError('This avatar could not be saved. Choose another image.'); return; }
    onClose();
    if (result === 'temporary') toast('Avatar updated for this visit. Browser storage is unavailable.', 'info');
    else toast(selected && !isAvatarId(selected) && isAvatarId(draft) ? 'Photo removed. Preset avatar restored.' : 'Avatar updated.', 'success');
  }

  return <Dialog open onClose={onClose} title="Choose your avatar" size="sm" className="avatar-dialog" footer={<><Button variant="ghost" className="avatar-shuffle" aria-label="Surprise me" title="Surprise me" onClick={() => choose(randomAvatar(Math.random, isAvatarId(draft) ? draft : draft.preset))}><Icon name="refresh" size={17} /><span className="avatar-shuffle-label">Surprise me</span></Button><div className="avatar-picker-confirm"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button data-onboarding="avatar-save" disabled={preparing} onClick={confirm}>Use avatar</Button></div></>}>
    <div className="avatar-picker-preview" data-onboarding="avatar-preview" data-onboarding-state={preparing ? 'pending' : error ? 'error' : 'ready'}><AvatarArtwork id={draft} size={80} /><div><strong>{photo ? 'Your photo' : AVATARS.find(item => item.id === draft)?.label}</strong><p>{photo ? 'Centered crop · Preview' : 'Preview'}</p></div></div>
    <div className="avatar-upload">
      <div className="avatar-upload-actions">
        <label className={`button button--secondary avatar-upload-control${preparing ? ' is-preparing' : ''}`}><Icon name={photo ? 'edit' : 'plus'} size={17} /><span>{preparing ? 'Preparing…' : photo ? 'Replace photo' : 'Upload photo'}</span><input ref={fileInput} data-onboarding="avatar-upload" type="file" accept={AVATAR_FILE_ACCEPT} multiple={false} aria-label={photo ? 'Replace photo' : 'Upload photo'} aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId} aria-invalid={!!error || undefined} disabled={preparing} onChange={event => void upload(event)} /></label>
        {photo && <Button variant="ghost" className="avatar-remove-photo" onClick={() => { choose(draft.preset); setNotice('Photo removed from preview. Save to apply.'); }}><Icon name="trash" size={16} />Remove photo</Button>}
      </div>
      <p id={descriptionId} className="avatar-upload-description">PNG, JPG or WebP · Up to 5 MB</p>
      {error && <p id={errorId} className="avatar-upload-error" role="alert"><Icon name="alert" size={16} />{error}</p>}
      <p className="avatar-upload-status" role="status" aria-live="polite">{notice}</p>
    </div>
    <div className="avatar-presets-heading"><h3>Or choose an avatar</h3><span>{AVATARS.length} designs</span></div>
    <div className="avatar-picker-grid" data-onboarding="avatar-presets" role="radiogroup" aria-label="Avatars">{AVATARS.map((item, index) => <label key={item.id} className="avatar-choice" title={item.label}><input type="radio" name="profile-avatar" value={item.id} checked={draft === item.id} onChange={() => choose(item.id)} aria-label={`Avatar ${index + 1}: ${item.label}`} /><AvatarArtwork id={item.id} size={64} />{draft === item.id && <span className="avatar-choice-check" aria-hidden="true"><Icon name="check" size={13} /></span>}</label>)}</div>
    <p className="avatar-picker-footer-note">Applies to this account in this browser. Photos stay on this device.</p>
  </Dialog>;
}
