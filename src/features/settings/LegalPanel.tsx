import { Icon } from '../../components/ui';
import { legalDocuments } from '../support/resources';

export function LegalPanel() {
  return <div className="settings-legal"><div className="settings-group-heading"><h2>Policies & agreements</h2><p>The official documents governing your use of APCOSYS.</p></div><div className="settings-legal-grid">{legalDocuments.map(document => <a key={document.id} className="settings-legal-card" href={document.url} target="_blank" rel="noopener noreferrer"><span className="settings-legal-symbol"><Icon name={document.icon} size={22} /></span><span className="settings-legal-copy"><strong>{document.title}</strong><span>{document.description}</span></span><Icon name="arrow-up-right" size={18} /></a>)}</div><p className="settings-legal-source"><Icon name="external" size={15} />Documents open on apcosys.net in a new tab.</p></div>;
}
