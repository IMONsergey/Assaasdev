import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Button, Icon } from '../../components/ui';
import { useScenarioGuide } from './ScenarioProvider';
import { findTourTarget } from './tour-flow';
import './journeys.css';

type TargetBox = {left:number;top:number;width:number;height:number};

/** One stable portal stays interactive inside the active native modal's top layer. */
export function ScenarioGuide() {
  const { state, scenario, tourStep, start, close, goToStep, setMinimized, openStep, stepPath, currentPath, advance, skip, showTarget, blockedReason } = useScenarioGuide();
  const panel = useRef<HTMLElement>(null);
  const [layer] = useState(() => { const node=document.createElement('div'); node.className='scenario-tour-layer'; node.setAttribute('popover','manual'); return node; });
  const [box,setBox] = useState<TargetBox | null>(null);
  const [position,setPosition] = useState<CSSProperties>({});
  const [found,setFound] = useState(false);
  const [opened,setOpened] = useState(false);
  const [compact,setCompact] = useState(false);
  const [keyboardCompact,setKeyboardCompact] = useState(false);
  const editing = useRef(false);
  const active = !!state && !!scenario && !!tourStep;
  const stepKey = state ? `${state.id}:${state.index}` : '';
  const latest = useRef({state,tourStep,active});
  latest.current={state,tourStep,active};
  const lastScrolled=useRef('');

  useLayoutEffect(() => {
    if (!active) return;
    let frame=0;
    let modalStack: HTMLDialogElement[]=[];
    const place = () => {
      frame=0;
      const live=latest.current;
      if (!live.active) return;
      modalStack=modalStack.filter(dialog=>dialog.isConnected && dialog.open);
      for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog:modal')) if (!modalStack.includes(dialog)) modalStack.push(dialog);
      const parent=modalStack.at(-1) || document.body;
      if (layer.parentElement!==parent) { if (layer.matches(':popover-open')) layer.hidePopover(); parent.appendChild(layer); }
      if (typeof layer.showPopover==='function' && !layer.matches(':popover-open')) layer.showPopover();
      const visual=window.visualViewport;
      const width=visual?.width || innerWidth, height=visual?.height || innerHeight, left=visual?.offsetLeft || 0, top=visual?.offsetTop || 0;
      const keyboard=width<=760 && height<innerHeight-150;
      const focused=document.activeElement instanceof HTMLElement && document.activeElement.matches('input:not([type="hidden"]),textarea,select,[contenteditable="true"]') && !document.activeElement.closest('.scenario-tour-layer') ? document.activeElement : null;
      const shouldCompact=keyboard || width<=760 && (editing.current || !!focused);
      setCompact(previous=>previous===shouldCompact?previous:shouldCompact);
      setKeyboardCompact(previous=>previous===keyboard?previous:keyboard);
      const target=live.tourStep && !live.state?.finished ? findTourTarget(live.tourStep.anchor) : null;
      const targetInModal=parent===document.body || !!target && parent.contains(target);
      const targetRect=target && targetInModal ? target.getBoundingClientRect() : null;
      const attentionRect=(focused?.closest<HTMLElement>('.field') || focused)?.getBoundingClientRect() || targetRect;
      setFound(previous=>previous===!!targetRect?previous:!!targetRect);
      const isOpened=!!live.tourStep?.open?.until && !!findTourTarget(live.tourStep.open.until);
      setOpened(previous=>previous===isOpened?previous:isOpened);
      const inset=width<=600?12:24;
      const cardWidth=Math.min(width-inset*2,width<=600?420:368);
      const cardHeight=panel.current?.getBoundingClientRect().height || 230;
      let cardLeft=left+width-cardWidth-inset;
      let cardTop=top+height-cardHeight-inset;
      // Dialog Apply/Cancel/Send controls always stay reachable above the device edge.
      const footer=parent instanceof HTMLDialogElement ? parent.querySelector<HTMLElement>(':scope > .dialog-footer')?.getBoundingClientRect() : width<=760 ? document.querySelector<HTMLElement>('.auth-form > button[type="submit"]')?.getBoundingClientRect() : undefined;
      if (footer && footer.top<top+height && footer.bottom>top && cardLeft<footer.right && cardLeft+cardWidth>footer.left) cardTop=Math.min(cardTop,footer.top-cardHeight-12);
      // Keep the coach away from the highlighted region without blocking the page.
      if (attentionRect && attentionRect.right>cardLeft && attentionRect.bottom>cardTop && attentionRect.top<cardTop+cardHeight) {
        const workspace=document.querySelector<HTMLElement>('.workspace-main')?.getBoundingClientRect();
        const alternative=Math.max(left+inset,(workspace?.left || 0)+inset);
        const lowerEdge=footer && footer.top>top && footer.top<top+height ? footer.top-12 : top+height-inset;
        if (width>760 && attentionRect.left>alternative+cardWidth+12) cardLeft=alternative;
        else if (attentionRect.bottom+12+cardHeight<lowerEdge) cardTop=attentionRect.bottom+12;
        else if (attentionRect.top-cardHeight-12>top+8) cardTop=attentionRect.top-cardHeight-12;
      }
      if (footer && footer.top<top+height && footer.bottom>top && cardLeft<footer.right && cardLeft+cardWidth>footer.left) cardTop=Math.min(cardTop,footer.top-cardHeight-12);
      cardTop=Math.max(top+8,cardTop);
      setPosition(previous=>previous.left===cardLeft && previous.top===cardTop && previous.width===cardWidth ? previous : {left:cardLeft,top:cardTop,width:cardWidth,maxHeight:height-16});
      const nextBox=targetRect && !live.state?.minimized && !keyboard && targetRect.bottom>top+8 && targetRect.top<top+height-8 ? {left:Math.max(left+4,targetRect.left-5),top:Math.max(top+4,targetRect.top-5),width:Math.min(targetRect.right+5,left+width-4)-Math.max(left+4,targetRect.left-5),height:Math.min(targetRect.bottom+5,top+height-4)-Math.max(top+4,targetRect.top-5)} : null;
      setBox(previous=>JSON.stringify(previous)===JSON.stringify(nextBox)?previous:nextBox);
      if (target && targetInModal && lastScrolled.current!==`${live.state?.id}:${live.state?.index}`) {
        lastScrolled.current=`${live.state?.id}:${live.state?.index}`;
        if (targetRect && (targetRect.top<top+64 || targetRect.top>top+height-cardHeight-36)) target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      }
    };
    const schedule=()=>{if(!frame) frame=requestAnimationFrame(place);};
    const onFocus=(event:FocusEvent)=>{
      if (innerWidth>760 || !(event.target instanceof HTMLElement) || event.target.closest('.scenario-tour-layer')) return;
      if (event.target.matches('input,textarea,select,[contenteditable="true"]')) { editing.current=true; event.target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}); schedule(); }
    };
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','aria-selected','data-ready']});
    const resize=new ResizeObserver(schedule);
    if(panel.current) resize.observe(panel.current);
    window.addEventListener('resize',schedule);
    window.addEventListener('scroll',schedule,true);
    document.addEventListener('focusin',onFocus);
    window.visualViewport?.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('scroll',schedule);
    place();
    return()=>{observer.disconnect();resize.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);document.removeEventListener('focusin',onFocus);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);layer.remove();};
  },[active,layer]);
  useLayoutEffect(()=>{editing.current=false;},[stepKey]);
  useLayoutEffect(()=>{window.dispatchEvent(new Event('resize'));},[stepKey,state?.minimized,state?.finished,currentPath]);

  if (!state || !scenario || !tourStep) return null;
  const step=scenario.steps[state.index];
  const minimized=state.minimized || compact;
  const needsRoute=!!stepPath && stepPath!==currentPath && !found;
  const needsOpen=!!tourStep.open && !opened;
  const waiting=!!tourStep.wait && (!state.progress?.[state.index] || state.progress[state.index]==='skipped');
  const finalStep=state.index===scenario.steps.length-1;
  const primaryLabel=needsRoute ? step.action || 'Open this step' : needsOpen ? tourStep.open!.label : waiting ? 'Show me' : tourStep.nextLabel || (finalStep?'Finish walkthrough':'Continue');
  const primaryAction=needsRoute || needsOpen ? openStep : waiting ? showTarget : advance;
  const unavailable=!found && !needsRoute && !needsOpen;
  const skipped=state.progress?.filter(value=>value==='skipped').length || 0;
  const observed=state.progress?.filter(value=>value==='observed').length || 0;
  const reviewed=state.progress?.filter(value=>value==='reviewed').length || 0;
  return createPortal(<>
    {box && <div className="scenario-spotlight" style={box} aria-hidden="true" />}
    <aside ref={panel} style={position} className={`scenario-guide${minimized?' is-minimized':''}${keyboardCompact?' is-keyboard-compact':''}`} aria-label="Scenario guide" data-target-found={found} data-step-index={state.index}>
      <header className="scenario-guide-header">
        <span className="scenario-guide-icon"><Icon name={state.finished?'check':scenario.icon} size={18}/></span>
        <div className="scenario-guide-heading"><span>{state.finished?(skipped?'Walkthrough reviewed':'Walkthrough complete'):`Step ${state.index+1} of ${scenario.steps.length}`}</span><strong title={minimized?step.title:scenario.title}>{minimized?step.title:scenario.title}</strong></div>
        <div className="scenario-guide-tools"><Button variant="ghost" size="sm" aria-label={minimized?'Expand scenario guide':'Minimize scenario guide'} aria-expanded={!minimized} onClick={()=>{editing.current=false;setCompact(false);setMinimized(!minimized);}}><Icon name={minimized?'chevron-up':'chevron-down'} size={18}/></Button><Button variant="ghost" size="sm" aria-label="Close scenario guide" onClick={close}><Icon name="close" size={18}/></Button></div>
      </header>
      {!minimized && <div className="scenario-guide-body" key={stepKey}>
        {state.finished ? <><div className="scenario-guide-copy"><h2>You’ve reached the end</h2><p>{observed} {observed===1?'action':'actions'} observed · {reviewed} {reviewed===1?'section':'sections'} reviewed{skipped?` · ${skipped} skipped`:''}.</p><p>{skipped?'Your workspace stays open. You can revisit any skipped step.':'Continue working or choose another walkthrough.'}</p></div><div className="scenario-guide-actions"><Button variant="secondary" size="sm" onClick={()=>skipped?goToStep(state.progress!.findIndex(value=>value==='skipped')):start(scenario.id)}>{skipped?'Review skipped steps':'Start again'}</Button><Link className="button button--primary button--sm" to="/scenarios" onClick={close}>Browse scenarios<Icon name="arrow" size={16}/></Link></div></> : <>
          <div className="scenario-guide-copy" aria-live="polite" aria-atomic="true"><h2>{step.title}</h2><p>{step.description}</p></div>
          {waiting && <p className="scenario-guide-hint"><span className="scenario-wait-dot" aria-hidden="true"/>{tourStep.hint || 'Complete the highlighted action to continue.'}</p>}
          {!found && !needsRoute && <p className="scenario-guide-hint">{tourStep.missing || 'Open the required data or sign in for this step. You can skip it and return later.'}</p>}
          {blockedReason && <p className="scenario-guide-hint" role="status">{blockedReason}</p>}
          <div className="scenario-guide-actions"><Button variant="ghost" size="sm" disabled={state.index===0} aria-label="Previous guide step" onClick={()=>goToStep(state.index-1)}><Icon name="chevron-left" size={17}/>Back</Button><Button variant="primary" size="sm" disabled={unavailable} onClick={primaryAction}>{unavailable?'Waiting for this section':primaryLabel}<Icon name={waiting&&!needsOpen&&!needsRoute?'eye':'arrow'} size={16}/></Button></div>
          {(waiting || unavailable) && <button type="button" className="scenario-skip" onClick={skip}>{finalStep?'End walkthrough':'Skip this step'}</button>}
        </>}
      </div>}
      {!minimized && <div className="scenario-guide-track" aria-hidden="true">{scenario.steps.map((item,index)=><span key={item.title} className={state.progress?.[index]==='skipped'?'is-skipped':state.progress?.[index]?'is-complete':index===state.index?'is-current':''}/>)}</div>}
    </aside>
  </>,layer);
}
