import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Badge, Button, Dialog, EmptyState, Field, Icon, PageHeader } from '../../components/ui';
import { filterScenarios, findScenario, scenarioCategories, scenarios } from './catalog';
import { useScenarioGuide } from './ScenarioProvider';
import './journeys.css';

export function ScenariosPage() {
  const [params, setParams] = useSearchParams();
  const { state, start, setMinimized, openStep } = useScenarioGuide();
  const query = params.get('q') || '';
  const category = scenarioCategories.includes(params.get('category') as typeof scenarioCategories[number]) ? params.get('category')! : 'all';
  const selected = findScenario(params.get('scenario'));
  const visible = useMemo(() => filterScenarios(query, category), [query, category]);
  function patch(values: Record<string,string | null>, replace = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key,value] of Object.entries(values)) { if (value) next.set(key,value); else next.delete(key); }
    setParams(next, { replace, state: { preserveTabFocus: true } });
  }
  return <div className="scenarios-page">
    <PageHeader title="Scenarios" description="Choose a task. Follow the steps in your workspace." actions={state ? <Button variant="secondary" onClick={() => { setMinimized(false); openStep(); }}>Resume guide<Icon name="arrow" size={16} /></Button> : undefined} />
    <div className="scenarios-toolbar"><Field label="Find a scenario" icon={<Icon name="search" size={18} />} placeholder="Search, TLS, exports, billing…" value={query} onChange={event => patch({ q:event.target.value || null },true)} /><span className="scenarios-count" role="status">{visible.length} of {scenarios.length} scenarios</span></div>
    <nav className="scenario-categories" aria-label="Scenario categories"><button type="button" aria-pressed={category === 'all'} onClick={() => patch({ category:null })}>All scenarios<span>{scenarios.length}</span></button>{scenarioCategories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => patch({ category:item })}>{item}<span>{scenarios.filter(scenario => scenario.category === item).length}</span></button>)}</nav>
    {!query && (category === 'all' || category === 'Billing & credits') && <section className="scenario-payment-collection" aria-label="Payment walkthroughs">
      <div className="scenario-payment-heading"><h2>Explore payments</h2>{category === 'all' && <button type="button" onClick={() => patch({ category:'Billing & credits' })}>All billing scenarios<Icon name="arrow" size={15} /></button>}</div>
      <div className="scenario-payment-methods">{[{id:'wallet-payment',title:'Account wallet',detail:'Balance and credits',icon:'wallet'},{id:'card-payment',title:'Bank card',detail:'Checkout and receipt',icon:'card'},{id:'crypto-payment',title:'Cryptocurrency',detail:'Network and confirmation',icon:'wallet'}].map(method => <button key={method.id} type="button" className="scenario-payment-method" onClick={() => patch({scenario:method.id})} aria-label={`Explore ${method.title.toLowerCase()} payment`}><span className="scenario-payment-art" aria-hidden="true"><Icon name={method.icon} size={22} /></span><span className="scenario-payment-copy"><strong>{method.title}</strong><small>{method.detail}</small></span><Icon name="arrow" size={17} /></button>)}</div>
    </section>}
    {visible.length ? <div className="scenario-grid">{visible.map(scenario => <button className="scenario-card" key={scenario.id} type="button" onClick={() => patch({ scenario:scenario.id })} aria-label={`View scenario: ${scenario.title}`}><span className="scenario-card-top"><span className="scenario-card-icon"><Icon name={scenario.icon} size={22} /></span><span>{scenario.steps.length} steps</span></span><span className="scenario-card-category">{scenario.category}</span><strong>{scenario.title}</strong><span className="scenario-card-description">{scenario.description}</span><span className="scenario-card-bottom"><span>{scenario.access}</span><Icon name="arrow" size={18} /></span></button>)}</div> : <EmptyState title="No matching scenarios" description="Try another word or choose a different category." actions={<Button variant="secondary" onClick={() => patch({ q:null,category:null })}>Clear filters</Button>} />}
    <Dialog open={!!selected} onClose={() => patch({ scenario:null })} title={selected?.title || 'Scenario'} size="md" className="scenario-details-dialog" footer={selected && <><Button variant="secondary" onClick={() => patch({ scenario:null })}>Close</Button><Button onClick={() => { const id=selected.id; patch({ scenario:null },true); start(id); }}>Start scenario<Icon name="arrow" size={17} /></Button></>}>
      {selected && <><div className="scenario-detail-intro"><Badge>{selected.category}</Badge><p>{selected.description}</p><span><Icon name="lock" size={15} />{selected.access}</span></div><ol className="scenario-detail-steps">{selected.steps.map((step,index) => <li key={step.title}><span aria-hidden="true">{index+1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}</ol><p className="scenario-explicit-action"><Icon name="info" size={16} />You control each action. Starting a guide does not run a search, create a scan or make a payment.</p></>}
    </Dialog>
  </div>;
}
