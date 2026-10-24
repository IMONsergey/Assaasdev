import { Link, useLocation } from 'react-router';
import { Icon } from '../../components/ui';
import { fieldSearchHref } from './field-search';

export function SearchValueLink({ field, value, label }: { field: string; value: unknown; label?: string }) {
  const location = useLocation();
  const href = fieldSearchHref(field, value, location.pathname, location.search);
  if (!href) return null;
  return <Link className="host-field-search" to={href} data-onboarding="host-field-search" title={`Find results with this ${label || field}`} aria-label={`Search ${label || field}: ${String(value).slice(0, 100)}`}><Icon name="arrow" size={13} /><span>Search</span></Link>;
}
