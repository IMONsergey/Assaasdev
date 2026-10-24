import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useApp } from '../../app/AppProvider';
import { Button, Dialog, Field, Icon, SelectField, TextArea } from '../../components/ui';
import { copyText } from '../account/operation';
import { prepareSupportMessage, supportEmail, supportTopics, type SupportDraft } from './resources';
import './support.css';

export function SupportDialog({ open, onClose, initialTopic, initialMessage }: { open: boolean; onClose: () => void; initialTopic?: string; initialMessage?: string }) {
  const { user, toast } = useApp();
  const [view,setView] = useState<'help'|'form'|'review'>('help');
  const [draft,setDraft] = useState<SupportDraft>({name:'',email:'',topic:supportTopics[0],message:''});
  const [error,setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const prepared = prepareSupportMessage(draft);
  useLayoutEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened || (!initialTopic && !initialMessage)) return;
    setDraft({ name: user?.user_name ?? '', email: user?.email ?? '', topic: initialTopic ?? supportTopics[0], message: initialMessage ?? '' });
    setView('form'); setError('');
  }, [open, initialTopic, initialMessage, user]);
  useLayoutEffect(() => {
    if (!open) return;
    if (view === 'form') formRef.current?.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});
    else bodyRef.current?.closest<HTMLDialogElement>('dialog')?.focus({preventScroll:true});
  },[view,open]);
  function close() { setView('help'); setError(''); if (initialTopic || initialMessage) setDraft({ name: '', email: '', topic: supportTopics[0], message: '' }); onClose(); }
  function contact() {
    setDraft(current => ({...current,name:current.name || user?.user_name || '',email:current.email || user?.email || ''}));
    setView('form'); setError('');
  }
  function prepare(event: FormEvent) {
    event.preventDefault();
    if (!formRef.current?.reportValidity()) return;
    if (!draft.name.trim() || draft.message.trim().length < 10) {
      setError(!draft.name.trim() ? 'Enter your name.' : 'Write at least 10 characters about your request.');
      formRef.current.querySelector<HTMLElement>(!draft.name.trim() ? '[name="support-name"]' : '[name="support-message"]')?.focus();
      return;
    }
    setError(''); setView('review');
  }
  const footer = view === 'help' ? <Button key="contact" onClick={contact}><Icon name="mail" size={17} />Contact support</Button> : view === 'form' ? <><Button key="back" variant="secondary" onClick={() => setView('help')}><Icon name="chevron-left" size={16} />Back</Button><Button key="prepare" type="submit" form="support-request">Prepare email<Icon name="arrow" size={16} /></Button></> : <><Button key="edit" variant="secondary" onClick={() => setView('form')}>Edit message</Button><a key="open-email" className="button button--primary" href={prepared.mailto} onClick={() => toast('Your email app will open with the draft. Send it there when ready.','info')}>Open email app<Icon name="arrow-up-right" size={16} /></a></>;
  return <Dialog open={open} onClose={close} title={view === 'help' ? 'Help & support' : view === 'form' ? 'Contact support' : 'Review your message'} size="md" footer={footer} className={`support-dialog${view === 'help' ? ' support-dialog--help' : ''}`}>
    <div ref={bodyRef}>
    {view === 'help' ? <div className="support-home">
      <Link to="/scenarios" className="support-feature" onClick={close}>
        <span className="support-feature-art" aria-hidden="true"><svg width="68" height="46" viewBox="0 0 68 46" fill="none"><path d="M15 23h38" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.4" /><rect x="2" y="10" width="26" height="26" rx="7" fill="var(--bg)" stroke="currentColor" strokeOpacity=".3" /><path d="m11 23 3 3 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><rect x="40" y="10" width="26" height="26" rx="7" fill="var(--bg)" stroke="currentColor" strokeOpacity=".3" /><path d="M48 23h10m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <span><strong>Follow a scenario</strong><small>Search, investigation and payments</small></span><Icon name="arrow" size={18} />
      </Link>
      <div className="support-resource-list support-resource-list--compact">
        <Link to="/api" onClick={close}><span className="support-resource-icon"><Icon name="code" size={20} /></span><span><strong>API access</strong><small>Keys, usage and limits</small></span><Icon name="chevron-right" size={16} /></Link>
        <Link to="/settings?section=legal" onClick={close}><span className="support-resource-icon"><Icon name="file" size={20} /></span><span><strong>Policies & agreements</strong><small>Terms, privacy and data</small></span><Icon name="chevron-right" size={16} /></Link>
      </div>
      <div className="support-contact-line"><Icon name="mail" size={15} /><a href={`mailto:${supportEmail}`}>{supportEmail}<Icon name="arrow-up-right" size={14} /></a></div>
    </div> : view === 'form' ? <form id="support-request" ref={formRef} onSubmit={prepare} className="support-request-form">
      <p className="support-intro">Describe your question. You can review the message before opening your email app.</p>
      <div className="support-form-row"><Field label="Name" name="support-name" autoComplete="name" required maxLength={100} value={draft.name} onChange={event => {setDraft({...draft,name:event.target.value});setError('');}} /><Field label="Reply email" name="support-email" type="email" autoComplete="email" required maxLength={200} value={draft.email} onChange={event => setDraft({...draft,email:event.target.value})} /></div>
      <SelectField label="Topic" value={draft.topic} onChange={event => setDraft({...draft,topic:event.target.value})}>{supportTopics.map(topic => <option key={topic}>{topic}</option>)}</SelectField>
      <TextArea label="Message" name="support-message" placeholder="What were you trying to do? What happened?" required minLength={10} maxLength={4000} rows={6} value={draft.message} error={error || undefined} onChange={event => {setDraft({...draft,message:event.target.value});setError('');}} hint="Keep passwords, API keys and private third-party data out of the message." />
      <div className="support-form-meta"><span>{draft.message.length.toLocaleString()} / 4,000</span><a href="https://apcosys.net/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy<Icon name="arrow-up-right" size={14} /></a></div>
    </form> : <div className="support-review">
      <div className="support-review-recipient"><span className="support-resource-icon"><Icon name="mail" size={22} /></span><div><span>To the APCOSYS team</span><strong>{supportEmail}</strong></div></div>
      <dl className="support-review-fields"><div><dt>Subject</dt><dd>{prepared.subject}</dd></div><div><dt>From</dt><dd>{draft.name.trim()} · {draft.email.trim()}</dd></div></dl>
      <div className="support-message-preview">{draft.message.trim()}</div>
      <div className="support-copy-row"><p>The message is ready for your email app. Review and send it there.</p><Button variant="secondary" size="sm" onClick={() => void copyText(`To: ${supportEmail}\nSubject: ${prepared.subject}\n\n${prepared.body}`,toast)}><Icon name="copy" size={16} />Copy message</Button></div>
    </div>}
    </div>
  </Dialog>;
}
