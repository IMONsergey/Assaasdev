import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../../app/AppProvider';
import { findScenario, type Scenario } from './catalog';
import { parseGuideState, resolveScenarioTarget, scenarioArea, type GuideState, type RememberedLocations } from './guide-state';

interface ScenarioContextValue {
  state: GuideState | null; scenario: Scenario | undefined;
  start: (id: string) => void; close: () => void; goToStep: (index: number) => void;
  setMinimized: (value: boolean) => void; finish: () => void;
  openStep: () => void; stepPath: string | null; canOpenStep: boolean;
}
const ScenarioContext = createContext<ScenarioContextValue | null>(null);
const storageKey = 'apcosys.scenario-guide.v1';
function initialState(): GuideState | null {
  try { return parseGuideState(JSON.parse(sessionStorage.getItem(storageKey) || 'null')); } catch { return null; }
}

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, session } = useApp();
  const [state, setState] = useState<GuideState | null>(initialState);
  const remembered = useRef<RememberedLocations>({});
  const principal = `${session.status}:${user?.user_id || user?.session_id || ''}`;
  const priorPrincipal = useRef(principal);
  if (priorPrincipal.current !== principal) { remembered.current = {}; priorPrincipal.current = principal; }
  const current = location.pathname + location.search + location.hash;
  const area = scenarioArea(location.pathname);
  if (area) remembered.current[area] = current;
  const scenario = findScenario(state?.id);
  const stepPath = resolveScenarioTarget(scenario?.steps[state?.index ?? 0]?.target, current, remembered.current);
  useEffect(() => {
    // Only a static catalog ID and progress are saved, never queries, URLs, account data or response records.
    try { if (state) sessionStorage.setItem(storageKey, JSON.stringify(state)); else sessionStorage.removeItem(storageKey); } catch { /* Guidance still works when storage is disabled. */ }
  }, [state]);
  const open = useCallback((target: string | null) => {
    if (target && target !== window.location.pathname + window.location.search + window.location.hash) navigate(target);
  }, [navigate]);
  function start(id: string) {
    const selected = findScenario(id);
    if (!selected) return;
    remembered.current = {};
    setState({ id, index: 0, minimized: false, finished: false });
    // A new guide begins without replaying a remembered, potentially billable search.
    open(resolveScenarioTarget(selected.steps[0]?.target, '/scenarios', {}));
  }
  function goToStep(index: number) {
    if (!scenario || !state || index < 0 || index >= scenario.steps.length) return;
    setState({ ...state, index, minimized: false, finished: false });
    open(resolveScenarioTarget(scenario.steps[index].target, current, remembered.current));
  }
  return <ScenarioContext.Provider value={{ state, scenario, start, close: () => setState(null), goToStep, stepPath, canOpenStep: !!stepPath && stepPath !== current, openStep: () => open(stepPath), setMinimized: minimized => setState(previous => previous ? { ...previous, minimized } : null), finish: () => setState(previous => previous ? { ...previous, finished: true } : null) }}>{children}</ScenarioContext.Provider>;
}
export function useScenarioGuide() {
  const value = useContext(ScenarioContext);
  if (!value) throw new Error('ScenarioProvider is required for the scenario guide.');
  return value;
}
