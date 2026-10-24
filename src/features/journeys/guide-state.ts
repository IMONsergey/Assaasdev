import { findScenario, type ScenarioTarget } from './catalog';

export interface GuideState { id: string; index: number; minimized: boolean; finished: boolean }
export type RememberedLocations = Partial<Record<'search' | 'host' | 'files', string>>;

export function parseGuideState(value: unknown): GuideState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<GuideState>;
  const scenario = findScenario(state.id);
  if (!scenario || !Number.isInteger(state.index) || state.index! < 0 || state.index! >= scenario.steps.length) return null;
  return { id: scenario.id, index: state.index!, minimized: state.minimized === true, finished: state.finished === true };
}
export function scenarioArea(pathname: string): keyof RememberedLocations | null {
  if (/^\/(?:private\/)?hosts\//.test(pathname)) return 'host';
  if (pathname === '/search' || pathname === '/private/search') return 'search';
  if (pathname === '/files') return 'files';
  return null;
}
/** Applies only local presentation parameters; opaque query values and scope remain intact. */
export function resolveScenarioTarget(target: ScenarioTarget | undefined, current: string, remembered: RememberedLocations): string | null {
  if (!target) return null;
  if ('path' in target) {
    if (!target.path.startsWith('/')) return null;
    const url = new URL(target.path,'https://workspace.invalid');
    return url.origin === 'https://workspace.invalid' ? url.pathname + url.search + url.hash : null;
  }
  const currentUrl = new URL(current, 'https://workspace.invalid');
  const base = scenarioArea(currentUrl.pathname) === target.area ? current : remembered[target.area];
  if (!base && target.area === 'host') return null;
  const url = new URL(base || (target.area === 'files' ? '/files' : '/search'), 'https://workspace.invalid');
  if (url.origin !== 'https://workspace.invalid' || scenarioArea(url.pathname) !== target.area) return null;
  for (const [key, value] of Object.entries(target.params || {})) url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}
