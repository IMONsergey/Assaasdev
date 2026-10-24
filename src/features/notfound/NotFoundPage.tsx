import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Icon, Tabs } from '../../components/ui';
import { BOARD_SIZE, ROUTE_MAZES, canMove, gridDistance, memorySequence, nextNode, randomNode } from './games';
import './notfound.css';

type Game = 'signal' | 'route' | 'memory';
const cells = Array.from({ length: BOARD_SIZE ** 2 }, (_, index) => index);
const cellName = (index: number, width = BOARD_SIZE) => `Row ${Math.floor(index / width) + 1}, column ${index % width + 1}`;

function GameStatus({ children, complete = false }: { children: ReactNode; complete?: boolean }) {
  return <div className={`explore-game-status${complete ? ' is-complete' : ''}`} role="status" aria-live="polite" aria-atomic="true"><Icon name={complete ? 'success' : 'info'} size={17} /><span>{children}</span></div>;
}

function SignalGame() {
  const [target, setTarget] = useState<number | null>(null);
  const [probes, setProbes] = useState<number[]>([]);
  const last = probes.at(-1);
  const distance = target !== null && last !== undefined ? gridDistance(last, target) : null;
  const complete = distance === 0;
  function restart() { setTarget(randomNode(cells.length)); setProbes([]); }
  return <section className="explore-game" aria-labelledby="signal-title" data-game="signal">
    <div className="explore-game-intro"><span className="explore-game-kicker">01 / Discovery</span><h2 id="signal-title">Find the hidden signal</h2><p>Probe a node. Each reading tells you how many steps away the signal is.</p></div>
    <div className={`explore-grid signal-grid${target === null ? ' is-idle' : ''}`} role="group" aria-label="Signal map">
      {cells.map(index => {
        const checked = probes.includes(index), reading = target !== null && checked ? gridDistance(index, target) : null;
        return <button key={index} type="button" aria-label={`${cellName(index)}${reading !== null ? `, ${reading === 0 ? 'signal found' : `${reading} steps away`}` : ', unprobed'}`} disabled={target === null || complete || checked} className={`${checked ? 'is-probed' : ''}${reading === 0 ? ' is-found' : reading !== null && reading <= 2 ? ' is-near' : ''}`} onClick={() => setProbes(previous => [...previous, index])}>{reading === 0 ? <Icon name="success" size={24} /> : reading !== null ? reading : <span className="explore-node-dot" />}</button>;
      })}
    </div>
    <GameStatus complete={complete}>{complete ? `Signal found in ${probes.length} ${probes.length === 1 ? 'probe' : 'probes'}.` : distance !== null ? `${distance} ${distance === 1 ? 'step' : 'steps'} away · ${probes.length} ${probes.length === 1 ? 'probe' : 'probes'}` : target === null ? 'A small discovery, whenever you’re ready.' : 'Choose your first node.'}</GameStatus>
    <Button variant={target === null || complete ? 'primary' : 'secondary'} onClick={restart}><Icon name={target === null ? 'search' : 'refresh'} size={17} />{target === null ? 'Start searching' : complete ? 'Find another signal' : 'New signal'}</Button>
  </section>;
}

function RouteGame() {
  const [maze, setMaze] = useState<number | null>(null);
  const [trail, setTrail] = useState<number[]>([0]);
  const [notice, setNotice] = useState('Choose an open neighbour to move.');
  const position = trail.at(-1)!;
  const walls = maze === null ? [] : ROUTE_MAZES[maze];
  const complete = position === cells.length - 1;
  const board = useRef<HTMLDivElement>(null);
  function restart() { setMaze(previous => previous === null ? randomNode(ROUTE_MAZES.length) : (previous + 1) % ROUTE_MAZES.length); setTrail([0]); setNotice('Find a path to the destination.'); }
  function move(to: number) {
    if (maze === null || complete) return;
    if (!canMove(position, to, walls)) { setNotice('Choose an open neighbouring node.'); return; }
    setTrail(previous => [...previous, to]);
    setNotice(`${cellName(to)} · ${trail.length} ${trail.length === 1 ? 'move' : 'moves'}`);
  }
  return <section className="explore-game" aria-labelledby="route-title" data-game="route">
    <div className="explore-game-intro"><span className="explore-game-kicker">02 / Navigation</span><h2 id="route-title">Trace a clear route</h2><p>Connect the starting point to the destination. Tap a neighbour or use the arrow keys.</p></div>
    <div ref={board} className={`explore-grid route-grid${maze === null ? ' is-idle' : ''}`} role="group" tabIndex={maze === null ? -1 : 0} aria-label="Route map. Use arrow keys to move." onKeyDown={event => { const next = nextNode(position, event.key); if (next !== null && maze !== null) { event.preventDefault(); move(next); } }}>
      {cells.map(index => walls.includes(index) ? <span key={index} className="route-wall" role="img" aria-label={`${cellName(index)}, blocked`}><span /></span> : <button key={index} type="button" tabIndex={-1} aria-label={`${cellName(index)}${position === index ? ', current position' : index === cells.length - 1 ? ', destination' : trail.includes(index) ? ', visited' : ', open'}`} disabled={maze === null || complete} className={`${trail.includes(index) ? 'is-visited' : ''}${position === index ? ' is-current' : ''}${index === cells.length - 1 ? ' is-goal' : ''}`} onClick={() => { move(index); board.current?.focus({ preventScroll: true }); }}>{position === index ? <span className="route-position" /> : index === cells.length - 1 ? <Icon name="success" size={24} /> : trail.includes(index) ? <span className="route-trail-dot" /> : <span className="explore-node-dot" />}</button>)}
    </div>
    <GameStatus complete={complete}>{complete ? `Destination reached in ${trail.length - 1} moves.` : maze === null ? 'Every map has a way through.' : notice}</GameStatus>
    <div className="explore-game-actions"><Button variant={maze === null || complete ? 'primary' : 'secondary'} onClick={restart}><Icon name={maze === null ? 'arrow' : 'refresh'} size={17} />{maze === null ? 'Find a route' : 'New route'}</Button>{maze !== null && !complete && <Button variant="ghost" disabled={trail.length <= 1} onClick={() => { setTrail(previous => previous.slice(0, -1)); setNotice('One step back.'); }}><Icon name="arrow-left" size={16} />Undo move</Button>}</div>
  </section>;
}

function MemoryGame() {
  const [sequence, setSequence] = useState<number[]>([]);
  const [phase, setPhase] = useState<'idle' | 'showing' | 'recall' | 'complete' | 'retry'>('idle');
  const [pulse, setPulse] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [entered, setEntered] = useState<number[]>([]);
  const length = sequence.length || 3;
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (phase !== 'showing') return;
    const item = Math.floor(tick / 2);
    if (item >= sequence.length) { setPulse(null); setPhase('recall'); return; }
    setPulse(tick % 2 === 0 ? sequence[item] : null);
    const timer = window.setTimeout(() => setTick(previous => previous + 1), tick % 2 === 0 ? 700 : 220);
    return () => window.clearTimeout(timer);
  }, [phase, tick, sequence]);
  function start(nextLength = length) { setSequence(memorySequence(nextLength)); setEntered([]); setPulse(null); setTick(0); setPhase('showing'); }
  function replay() { setEntered([]); setTick(0); setPulse(null); setPhase('showing'); }
  function choose(index: number) {
    if (phase !== 'recall') return;
    if (index !== sequence[entered.length]) { setPulse(index); setPhase('retry'); return; }
    const next = [...entered, index]; setEntered(next);
    if (next.length === sequence.length) { setPulse(null); setPhase('complete'); }
  }
  const complete = phase === 'complete';
  return <section className="explore-game" aria-labelledby="memory-title" data-game="memory">
    <div className="explore-game-intro"><span className="explore-game-kicker">03 / Observation</span><h2 id="memory-title">Follow the sequence</h2><p>Watch the numbered nodes, then repeat their order. Start with three and build your way up.</p></div>
    <div className={`explore-grid memory-grid${phase === 'idle' ? ' is-idle' : ''}`} role="group" aria-label="Memory map" onKeyDown={event => { const current = cardRefs.current.indexOf(document.activeElement as HTMLButtonElement); const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }; if (current >= 0 && event.key in offsets) { const next = current + offsets[event.key]; if (next >= 0 && next < 9 && gridDistance(current, next, 3) === 1) { event.preventDefault(); cardRefs.current[next]?.focus(); } } }}>
      {Array.from({ length: 9 }, (_, index) => <button key={index} ref={element => { cardRefs.current[index] = element; }} type="button" aria-label={`Node ${index + 1}${phase === 'showing' && pulse === index ? ', lit' : ''}`} aria-disabled={phase !== 'recall'} className={`${pulse === index ? phase === 'retry' ? ' is-missed' : ' is-lit' : ''}${complete ? ' is-complete' : ''}`} onClick={() => choose(index)}>{index + 1}</button>)}
    </div>
    <GameStatus complete={complete}>{phase === 'idle' ? 'No timer to race. Take a moment to look.' : phase === 'showing' ? pulse === null ? 'Watch the sequence…' : `Watch node ${pulse + 1} · ${Math.floor(tick / 2) + 1} of ${sequence.length}` : phase === 'recall' ? `Your turn · ${entered.length} of ${sequence.length}` : complete ? `${sequence.length} nodes remembered. Nicely observed.` : 'That was a different node. Watch it once more.'}</GameStatus>
    <div className="explore-game-actions"><Button variant={phase === 'recall' ? 'secondary' : 'primary'} disabled={phase === 'showing'} onClick={() => phase === 'retry' || phase === 'recall' ? replay() : start(complete ? Math.min(sequence.length + 1, 8) : 3)}><Icon name={phase === 'retry' || phase === 'recall' ? 'refresh' : 'eye'} size={17} />{phase === 'showing' ? 'Watch the nodes' : phase === 'recall' || phase === 'retry' ? 'Watch again' : complete ? sequence.length < 8 ? 'Add one more node' : 'Play another round' : 'Start observing'}</Button>{(phase === 'recall' || phase === 'retry' || complete) && <Button variant="ghost" onClick={() => start(3)}>Start over</Button>}</div>
  </section>;
}

export function NotFoundPage() {
  const [game, setGame] = useState<Game>('signal');
  const navigate = useNavigate();
  return <div className="notfound-page" data-onboarding="not-found">
    <header className="notfound-header"><div className="notfound-code" aria-label="Error 404"><span>4</span><span className="notfound-orbit" aria-hidden="true"><i /><i /><i /></span><span>4</span></div><h1>A little off the map</h1><p>This page couldn’t be found. Return to your search, or take a short detour.</p><div className="notfound-actions"><Link to="/search" className="button button--primary"><Icon name="search" size={18} />Back to search</Link><Button variant="secondary" onClick={() => typeof window.history.state?.idx === 'number' && window.history.state.idx > 0 ? navigate(-1) : navigate('/search')}><Icon name="arrow-left" size={17} />Go back</Button></div></header>
    <div className="notfound-playground"><Tabs ariaLabel="Exploration games" idPrefix="explore-game" variant="segmented" value={game} onChange={value => setGame(value as Game)} items={[{ id: 'signal', label: 'Signal', icon: 'search' }, { id: 'route', label: 'Route', icon: 'share' }, { id: 'memory', label: 'Memory', icon: 'grid' }]} /><div key={game} id={`explore-game-panel-${game}`} role="tabpanel" aria-labelledby={`explore-game-tab-${game}`} className="notfound-game-panel">{game === 'signal' ? <SignalGame /> : game === 'route' ? <RouteGame /> : <MemoryGame />}</div></div>
  </div>;
}
