import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../app/AppProvider';
import { decodeSearch } from '../search/model';
import { findScenario, type Scenario } from './catalog';
import { parseGuideState, recordStepOutcome, resolveScenarioTarget, scenarioArea, type GuideState, type RememberedLocations, type StepOutcome } from './guide-state';
import { findTourTarget, observedEventComplete, tourStepFor, type TourStep } from './tour-flow';

interface ScenarioContextValue {
  state: GuideState | null; scenario: Scenario | undefined; tourStep: TourStep | undefined;
  start: (id: string) => void; close: () => void; goToStep: (index: number) => void;
  setMinimized: (value: boolean) => void; finish: () => void;
  openStep: () => void; stepPath: string | null; canOpenStep: boolean;
  currentPath: string; advance: () => void; skip: () => void; showTarget: () => void; blockedReason: string;
}
const ScenarioContext = createContext<ScenarioContextValue | null>(null);
const storageKey = 'apcosys.scenario-guide.v1';
function initialState(): GuideState | null {
  try { return parseGuideState(JSON.parse(sessionStorage.getItem(storageKey) || 'null')); } catch { return null; }
}
function targetFor(scenario: Scenario, index: number) {
  const target = tourStepFor(scenario,index).target;
  return target === undefined ? scenario.steps[index].target : target ?? undefined;
}

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, session } = useApp();
  const [state, setState] = useState<GuideState | null>(initialState);
  const [blockedReason,setBlockedReason] = useState('');
  // A real click may navigate before its resulting surface finishes loading.
  // Keep only that transient signal across effect restarts for the same step.
  const observedSignal = useRef<{key:string;event:boolean;visible:boolean} | null>(null);
  const remembered = useRef<RememberedLocations>({});
  const principal = `${session.status}:${user?.user_id || user?.session_id || ''}`;
  const priorPrincipal = useRef(principal);
  if (priorPrincipal.current !== principal) { remembered.current = {}; priorPrincipal.current = principal; }
  const current = location.pathname + location.search + location.hash;
  const area = scenarioArea(location.pathname);
  if (area) remembered.current[area] = current;
  const scenario = findScenario(state?.id);
  const tourStep = scenario && state ? tourStepFor(scenario,state.index) : undefined;
  const stepPath = scenario && state ? resolveScenarioTarget(targetFor(scenario,state.index), current, remembered.current) : null;
  const live = useRef({state,scenario,current,tourStep});
  live.current = {state,scenario,current,tourStep};

  useEffect(() => {
    // Store catalog progress only. Queries, credentials, records and URLs stay out of storage.
    try { if (state) sessionStorage.setItem(storageKey, JSON.stringify(state)); else sessionStorage.removeItem(storageKey); } catch { /* The walkthrough also works without storage. */ }
  }, [state]);
  const open = useCallback((target: string | null) => {
    if (!target || target === window.location.pathname + window.location.search + window.location.hash) return;
    const url = new URL(target, window.location.origin);
    if (scenarioArea(url.pathname) === 'search') {
      const parsed = decodeSearch(url.searchParams);
      const dataset = url.pathname.startsWith('/private/') ? 'private' : 'public';
      const key = ['search', user?.user_id || user?.session_id || session.status, dataset, parsed.request];
      // Returning through a walkthrough may reuse a result, never silently buy it again.
      if (parsed.hasSearch && !queryClient.getQueryData(key)) {
        navigate(target, {state:{onboardingPreviewOnly:true}});
        return;
      }
    }
    navigate(target);
  }, [navigate,queryClient,user?.user_id,user?.session_id,session.status]);
  const afterClosingModal = useCallback((action:()=>void) => {
    const modal = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog:modal')).at(-1);
    setBlockedReason('');
    if (!modal) {action();return;}
    const before = live.current.state;
    // Ask the product's normal Cancel handler. It may keep a busy operation open.
    if (typeof modal.requestClose === 'function') modal.requestClose();
    else modal.dispatchEvent(new Event('cancel',{cancelable:true}));
    requestAnimationFrame(()=>{
      if (live.current.state?.id!==before?.id || live.current.state?.index!==before?.index) return;
      if (!modal.isConnected || !modal.open) action();
      else setBlockedReason('Finish or close the current dialog before continuing.');
    });
  },[]);
  const goToStep = useCallback((index: number, automatic = false) => {
    const {scenario: selected,state: previous,current: path} = live.current;
    if (!selected || !previous || index < 0 || index >= selected.steps.length) return;
    const target = targetFor(selected,index);
    const preserveSearch = index < previous.index && target && 'path' in target && target.path === '/search' && remembered.current.search;
    const destination=resolveScenarioTarget(preserveSearch ? {area:'search'} : target,path,remembered.current);
    const move=()=>{setBlockedReason('');setState({ ...previous, index, minimized: automatic ? previous.minimized : false, finished: false });open(destination);};
    if (!automatic && destination && destination!==path) afterClosingModal(move);else move();
  }, [open,afterClosingModal]);
  const completeStep = useCallback((outcome: StepOutcome, automatic = false) => {
    const {scenario: selected,state: previous,current: path} = live.current;
    if (!selected || !previous) return;
    const recorded = recordStepOutcome(previous,selected.steps.length,outcome);
    if (previous.index < selected.steps.length - 1) {
      const destination=resolveScenarioTarget(targetFor(selected,previous.index+1),path,remembered.current);
      const move=()=>{setBlockedReason('');setState({...recorded,index:previous.index+1,minimized:automatic?previous.minimized:false});open(destination);};
      if (!automatic && destination && destination!==path) afterClosingModal(move); else move();
    } else setState({...recorded,finished:true});
  }, [open,afterClosingModal]);
  const advance = useCallback(() => completeStep('reviewed'),[completeStep]);
  const skip = useCallback(() => completeStep('skipped'),[completeStep]);
  function start(id: string) {
    const selected = findScenario(id);
    if (!selected) return;
    remembered.current = {};
    observedSignal.current = null;
    setBlockedReason('');
    const index=session.status==='authenticated' && ['account-access','connected-sign-in'].includes(id) ? 2 : 0;
    const progress=Array.from({length:selected.steps.length},(_,item)=>item<index?'skipped' as const:null);
    setState({ id, index, minimized: false, finished: false,progress });
    // A fresh guide never replays an earlier, potentially billable search.
    open(resolveScenarioTarget(targetFor(selected,index), '/scenarios', {}));
  }
  const openStep = useCallback(() => {
    const {scenario: selected,state: previous,current: path,tourStep: flow} = live.current;
    if (!selected || !previous) return;
    const resolved = resolveScenarioTarget(targetFor(selected,previous.index),path,remembered.current);
    if (resolved && resolved !== path) { afterClosingModal(()=>open(resolved)); return; }
    // Only an explicitly pressed walkthrough action may open a non-mutating UI control.
    if (flow?.open) {
      const trigger = findTourTarget(flow.open.selector) || document.querySelector<HTMLElement>(flow.open.selector);
      if (trigger && !trigger.matches(':disabled')) trigger.click();
    }
  }, [open,afterClosingModal]);
  const showTarget = useCallback(() => {
    const flow = live.current.tourStep;
    if (!flow) return;
    const target = findTourTarget(flow.anchor);
    if (!target) { openStep(); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true';
    target.scrollIntoView({block:'center',inline:'nearest',behavior:reduced ? 'instant' : 'smooth'});
    const control = target.matches('input,textarea,select,button,a[href],[tabindex]') ? target : target.querySelector<HTMLElement>('input:not([type="hidden"]),textarea,select,button,a[href],[tabindex="0"]');
    control?.focus({preventScroll:true});
  }, [openStep]);

  useEffect(() => {
    if (!state || state.finished || state.progress?.[state.index] && state.progress[state.index] !== 'skipped' || !tourStep?.wait || tourStep.wait.kind === 'route') return;
    const signal = tourStep.wait;
    const key = `${state.id}:${state.index}`;
    if (observedSignal.current?.key !== key) observedSignal.current = {key,event:false,visible:false};
    const observed = observedSignal.current;
    let frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
    function inspect() {
      frame = 0;
      const active = live.current;
      if (!active.state || `${active.state.id}:${active.state.index}` !== key || active.state.finished) return;
      let complete = false;
      if (signal.kind === 'visible') complete = !!findTourTarget(signal.selector);
      else if (signal.kind === 'hidden') { const visible = !!findTourTarget(signal.selector); if (visible) observed.visible = true; complete = observed.visible && !visible; }
      else complete = observedEventComplete(signal,observed.event,selector=>!!findTourTarget(selector));
      if (complete && timer === undefined) timer = setTimeout(() => {
        const latest = live.current;
        if (!latest.state || !latest.scenario || `${latest.state.id}:${latest.state.index}` !== key) return;
        completeStep('observed',true);
      },180);
      else if (!complete && timer !== undefined) { clearTimeout(timer); timer = undefined; }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(inspect); };
    function onEvent(event: Event) {
      if (signal.kind !== 'event' || !(event.target instanceof Element) || event.target.closest('.scenario-tour-layer')) return;
      if (event.target.closest(signal.selector)) { observed.event = true; schedule(); }
    }
    const observer = new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open','inert','disabled','aria-expanded','aria-busy','aria-selected','data-ready','data-onboarding-state','data-export-status','data-payment-status','data-payment-state','data-order-status','data-state','src']});
    if (signal.kind === 'event') document.addEventListener(signal.event,onEvent,true);
    window.addEventListener('popstate',schedule);
    schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); if (timer !== undefined) clearTimeout(timer); if (signal.kind === 'event') document.removeEventListener(signal.event,onEvent,true); window.removeEventListener('popstate',schedule); };
  }, [state?.id,state?.index,state?.finished,state?.progress,tourStep,completeStep]);

  // Router navigation can change without a DOM mutation, e.g. back through cached tabs.
  useEffect(() => {
    if (!state || state.finished || state.progress?.[state.index] && state.progress[state.index] !== 'skipped' || tourStep?.wait?.kind !== 'route' || !new RegExp(tourStep.wait.pattern).test(current)) return;
    if (tourStep.wait.session==='authenticated' && session.status!=='authenticated') return;
    if (tourStep.wait.session==='authenticated-or-verifying' && session.status!=='authenticated' && session.status!=='pending-2fa') return;
    const key = `${state.id}:${state.index}`;
    const timer = setTimeout(() => {
      if (live.current.state && `${live.current.state.id}:${live.current.state.index}` === key) completeStep('observed',true);
    },180);
    return () => clearTimeout(timer);
  }, [current,state?.id,state?.index,state?.finished,state?.progress,tourStep,completeStep,session.status]);

  return <ScenarioContext.Provider value={{ state, scenario, tourStep, start, close: () => setState(null), goToStep, stepPath, canOpenStep: !!stepPath && stepPath !== current || !!tourStep?.open, openStep, currentPath:current, advance, skip, showTarget, blockedReason, setMinimized: minimized => setState(previous => previous ? { ...previous, minimized } : null), finish: advance }}>{children}</ScenarioContext.Provider>;
}
export function useScenarioGuide() {
  const value = useContext(ScenarioContext);
  if (!value) throw new Error('ScenarioProvider is required for the scenario guide.');
  return value;
}
