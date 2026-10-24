import { useEffect, useRef, useState } from 'react';
import { OrbCubeLoader } from '../components/brand';
import { useVisualPreferences } from '../components/brand/useVisualPreferences';

type EntrancePhase = 'waiting' | 'welcome' | 'leaving' | 'ready';

/** Run once on entering the workspace, after a verified account or guest session. */
export function useWorkspaceEntrance(status: string) {
  const { reduced } = useVisualPreferences();
  const completed = useRef(false);
  const [phase, setPhase] = useState<EntrancePhase>(() =>
    status === 'loading' ? 'waiting' : ['authenticated', 'guest'].includes(status) ? 'welcome' : 'ready');

  useEffect(() => {
    if (completed.current) return;
    if (status === 'loading') { setPhase('waiting'); return; }
    if (!['authenticated', 'guest'].includes(status) || reduced) {
      completed.current = true;
      setPhase('ready');
      return;
    }
    setPhase('welcome');
    const welcome = window.setTimeout(() => setPhase('leaving'), 640);
    const finish = window.setTimeout(() => { completed.current = true; setPhase('ready'); }, 860);
    return () => { window.clearTimeout(welcome); window.clearTimeout(finish); };
  }, [status, reduced]);

  return phase;
}

export function WorkspaceEntrance({ phase }: { phase: EntrancePhase }) {
  if (phase === 'ready') return null;
  return <div className={`workspace-entrance workspace-entrance--${phase}`} role="status" aria-live="polite" aria-atomic="true">
    <div className="workspace-entrance-content">
      <OrbCubeLoader size={76} decorative />
      <p className="workspace-welcome">{phase === 'waiting' ? 'Opening your workspace' : 'Welcome'}</p>
    </div>
  </div>;
}
