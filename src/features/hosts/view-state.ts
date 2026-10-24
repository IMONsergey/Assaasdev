import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useApp } from '../../app/AppProvider';

// Retain only local view choices, never response data, between workspace tabs.
const views = new Map<string, unknown>();
export const ServiceViewScope = createContext('');
export const useServiceViewScope = () => useContext(ServiceViewScope);

export function useHostViewState<T>(name: string, initial: T) {
  const location = useLocation();
  const { user, session } = useApp();
  const service = useServiceViewScope();
  const scope = JSON.stringify([user?.user_id || user?.session_id || session.status, location.pathname, service, name]);
  const [stored, setStored] = useState(() => ({ scope, value: (views.get(scope) as T | undefined) || initial }));
  const value = stored.scope === scope ? stored.value : (views.get(scope) as T | undefined) || initial;
  const update = (patch: Partial<T>) => setStored({ scope, value: { ...value, ...patch } });
  useEffect(() => { views.delete(scope); views.set(scope, value); if (views.size > 120) views.delete(views.keys().next().value!); }, [scope, value]);
  return [value, update] as const;
}
