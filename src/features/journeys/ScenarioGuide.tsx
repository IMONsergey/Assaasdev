import { Link } from 'react-router';
import { Button, Icon } from '../../components/ui';
import { useScenarioGuide } from './ScenarioProvider';
import './journeys.css';

export function ScenarioGuide() {
  const { state, scenario, start, close, goToStep, setMinimized, finish, openStep, stepPath, canOpenStep } = useScenarioGuide();
  if (!state || !scenario) return null;
  const step = scenario.steps[state.index];
  return <aside className={`scenario-guide${state.minimized ? ' is-minimized' : ''}`} aria-label="Scenario guide">
    <header className="scenario-guide-header">
      <span className="scenario-guide-icon"><Icon name={scenario.icon} size={18} /></span>
      <div className="scenario-guide-heading"><span>{state.finished ? 'Guide finished' : `Step ${state.index + 1} of ${scenario.steps.length}`}</span><strong>{scenario.title}</strong></div>
      <div className="scenario-guide-tools"><Button variant="ghost" size="sm" aria-label={state.minimized ? 'Expand scenario guide' : 'Minimize scenario guide'} aria-expanded={!state.minimized} onClick={() => setMinimized(!state.minimized)}><Icon name={state.minimized ? 'chevron-down' : 'chevron-up'} size={18} /></Button><Button variant="ghost" size="sm" aria-label="Close scenario guide" onClick={close}><Icon name="close" size={18} /></Button></div>
    </header>
    {!state.minimized && <div className="scenario-guide-body">
      {state.finished ? <><div className="scenario-guide-copy"><h2>You have reached the end of this guide</h2><p>Review the result of your actions in the workspace, or choose another scenario.</p></div><div className="scenario-guide-actions"><Button variant="secondary" size="sm" onClick={() => start(scenario.id)}>Start again</Button><Link className="button button--primary button--sm" to="/scenarios" onClick={close}>Browse scenarios<Icon name="arrow" size={16} /></Link></div></> : <><div className="scenario-guide-copy" aria-live="polite" aria-atomic="true"><h2>{step.title}</h2><p>{step.description}</p>{step.target && !stepPath && <p className="scenario-guide-hint">Open a host from your search results to continue with its data.</p>}</div><div className="scenario-guide-actions">{canOpenStep && <Button variant="secondary" size="sm" onClick={openStep}>{step.action || 'Open this step'}<Icon name="arrow-up-right" size={15} /></Button>}<div className="scenario-step-controls"><Button variant="ghost" size="sm" disabled={state.index === 0} aria-label="Previous guide step" onClick={() => goToStep(state.index - 1)}><Icon name="chevron-left" size={17} /></Button>{state.index < scenario.steps.length - 1 ? <Button variant="primary" size="sm" onClick={() => goToStep(state.index + 1)}>Next step<Icon name="arrow" size={16} /></Button> : <Button variant="primary" size="sm" onClick={finish}>Finish guide<Icon name="check" size={16} /></Button>}</div></div></>}
    </div>}
    {!state.minimized && <div className="scenario-guide-track" aria-hidden="true">{scenario.steps.map((item,index) => <span key={item.title} className={state.finished || index <= state.index ? 'is-reached' : ''} />)}</div>}
  </aside>;
}
