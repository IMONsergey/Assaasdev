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
  const [openAvailable,setOpenAvailable] = useState(false);
  const [compact,setCompact] = useState(false);
  const [keyboardCompact,setKeyboardCompact] = useState(false);
  const [docked,setDocked] = useState(false);
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
    let guidedModal: HTMLDialogElement | null=null;
    const releaseModal=()=>{
      guidedModal?.style.removeProperty('--scenario-guide-space');
      guidedModal?.style.removeProperty('--scenario-dialog-available');
      guidedModal=null;
    };
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
      const opener=live.tourStep?.open ? findTourTarget(live.tourStep.open.selector) || document.querySelector<HTMLElement>(live.tourStep.open.selector) : null;
      const canOpen=!!opener && !opener.matches(':disabled');
      setOpenAvailable(previous=>previous===canOpen?previous:canOpen);
      const inset=width<=600?12:24;
      const modal=parent instanceof HTMLDialogElement ? parent : null;
      const modalRect=modal?.getBoundingClientRect();
      let cardWidth=Math.min(width-inset*2,width<=600?420:344);
      const besideRight=!!modalRect && modalRect.right+cardWidth+inset+16<=left+width;
      const besideLeft=!!modalRect && modalRect.left-cardWidth-inset-16>=left;
      const dock=!!modal && (width<=760 || !besideLeft && !besideRight);
      setDocked(previous=>previous===dock?previous:dock);
      if (guidedModal && (guidedModal!==modal || !dock)) releaseModal();
      layer.dataset.docked=String(dock);
      let maxCardHeight=height-16;
      if (dock && modal && modalRect) {
        // CSS reserves a row for this portal. The product's React children stay intact.
        guidedModal=modal;
        const available=height-(modal.classList.contains('dialog--workspace') ? Math.max(12,modalRect.top-top) : 12)-12;
        modal.style.setProperty('--scenario-dialog-available',`${available}px`);
        const headerHeight=modal.querySelector<HTMLElement>(':scope > .dialog-header')?.getBoundingClientRect().height || 0;
        const footerHeight=modal.querySelector<HTMLElement>(':scope > .dialog-footer')?.getBoundingClientRect().height || 0;
        maxCardHeight=Math.max(72,Math.min(height*.46,available-headerHeight-footerHeight-120));
        cardWidth=width>760 ? modalRect.width-24 : Math.min(cardWidth,modalRect.width-24);
      }
      const cardHeight=Math.min(panel.current?.getBoundingClientRect().height || 230,maxCardHeight);
      let cardLeft=left+width-cardWidth-inset;
      let cardTop=top+height-cardHeight-inset;
      let footer=modal?.querySelector<HTMLElement>(':scope > .dialog-footer')?.getBoundingClientRect() || (width<=760 ? document.querySelector<HTMLElement>('.auth-form > button[type="submit"]')?.getBoundingClientRect() : undefined);
      if (dock && modal) {
        const space=cardHeight+16;
        if(modal.style.getPropertyValue('--scenario-guide-space')!==`${space}px`) modal.style.setProperty('--scenario-guide-space',`${space}px`);
        const bounds=modal.getBoundingClientRect();
        footer=modal.querySelector<HTMLElement>(':scope > .dialog-footer')?.getBoundingClientRect();
        cardLeft=bounds.left+(bounds.width-cardWidth)/2;
        cardTop=(footer?.top ?? bounds.bottom-1)-space+8;
      } else if (modalRect && (besideRight || besideLeft)) {
        cardLeft=besideRight ? modalRect.right+16 : modalRect.left-cardWidth-16;
        cardTop=Math.max(top+inset,Math.min(modalRect.top+24,top+height-cardHeight-inset));
      } else {
        // Resolve an actual submit overlap before protecting the active field.
        // Clamping afterwards could move a clear bottom card back over the input.
        if (footer && cardTop<footer.bottom && cardTop+cardHeight>footer.top && cardLeft<footer.right && cardLeft+cardWidth>footer.left) cardTop=footer.top-cardHeight-12;
        if (attentionRect && attentionRect.right>cardLeft && attentionRect.bottom>cardTop && attentionRect.top<cardTop+cardHeight) {
          const workspace=document.querySelector<HTMLElement>('.workspace-main')?.getBoundingClientRect();
          const alternative=Math.max(left+inset,(workspace?.left || 0)+inset);
          const lowerEdge=footer && footer.top>top && footer.top<top+height ? footer.top-12 : top+height-inset;
          if (width>760 && attentionRect.left>alternative+cardWidth+12) cardLeft=alternative;
          else if (attentionRect.bottom+12+cardHeight<lowerEdge) cardTop=attentionRect.bottom+12;
          else if (attentionRect.top-cardHeight-12>top+8) cardTop=attentionRect.top-cardHeight-12;
        }
      }
      cardTop=Math.max(top+8,cardTop);
      setPosition(previous=>previous.left===cardLeft && previous.top===cardTop && previous.width===cardWidth && previous.maxHeight===maxCardHeight ? previous : {left:cardLeft,top:cardTop,width:cardWidth,maxHeight:maxCardHeight});
      const bodyRect=dock ? modal?.querySelector<HTMLElement>(':scope > .dialog-body')?.getBoundingClientRect() : undefined;
      const quietTarget=targetRect && targetRect.height<=200 && targetRect.width*targetRect.height<Math.min(width*height*.2,150000);
      const highlightTop=Math.max(top+4,bodyRect?.top ?? top+4), highlightBottom=Math.min(top+height-4,bodyRect?.bottom ?? top+height-4);
      const nextBox=quietTarget && targetRect && targetRect.right>left+4 && targetRect.left<left+width-4 && !live.state?.minimized && !shouldCompact && targetRect.bottom>highlightTop && targetRect.top<highlightBottom ? {left:Math.max(left+4,targetRect.left-4),top:Math.max(highlightTop,targetRect.top-4),width:Math.min(targetRect.right+4,left+width-4)-Math.max(left+4,targetRect.left-4),height:Math.min(targetRect.bottom+4,highlightBottom)-Math.max(highlightTop,targetRect.top-4)} : null;
      setBox(previous=>JSON.stringify(previous)===JSON.stringify(nextBox)?previous:nextBox);
      if (target && targetInModal && lastScrolled.current!==`${live.state?.id}:${live.state?.index}`) {
        lastScrolled.current=`${live.state?.id}:${live.state?.index}`;
        if (targetRect && (targetRect.top<(bodyRect?.top ?? top+64) || targetRect.bottom>(bodyRect?.bottom ?? top+height-cardHeight-36))) target.scrollIntoView({block:bodyRect && targetRect.height>bodyRect.height?'start':'center',inline:'nearest',behavior:'instant'});
      }
    };
    const schedule=()=>{if(!frame) frame=requestAnimationFrame(place);};
    const onFocus=(event:FocusEvent)=>{
      if (innerWidth>760 || !(event.target instanceof HTMLElement) || event.target.closest('.scenario-tour-layer')) return;
      if (event.target.matches('input,textarea,select,[contenteditable="true"]')) { editing.current=true; event.target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}); schedule(); }
    };
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','disabled','aria-selected','data-ready','data-onboarding-state','data-payment-state']});
    const resize=new ResizeObserver(schedule);
    if(panel.current) resize.observe(panel.current);
    window.addEventListener('resize',schedule);
    window.addEventListener('scroll',schedule,true);
    document.addEventListener('focusin',onFocus);
    window.visualViewport?.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('scroll',schedule);
    place();
    return()=>{observer.disconnect();resize.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);document.removeEventListener('focusin',onFocus);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);releaseModal();layer.remove();};
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
  const unavailable=!needsRoute && (needsOpen ? !openAvailable : !found);
  const skipped=state.progress?.filter(value=>value==='skipped').length || 0;
  const observed=state.progress?.filter(value=>value==='observed').length || 0;
  const reviewed=state.progress?.filter(value=>value==='reviewed').length || 0;
  const guidance=waiting && tourStep.hint ? tourStep.hint : step.description;
  return createPortal(<>
    {box && <div className="scenario-spotlight" style={box} aria-hidden="true" />}
    <aside ref={panel} style={position} className={`scenario-guide${minimized?' is-minimized':''}${keyboardCompact?' is-keyboard-compact':''}${docked?' is-docked':''}`} aria-label="Scenario guide" data-target-found={found} data-step-index={state.index}>
      <header className="scenario-guide-header">
        <span className="scenario-guide-icon"><Icon name={state.finished?'check':scenario.icon} size={18}/></span>
        <div className="scenario-guide-heading"><span>{state.finished?(skipped?'Walkthrough reviewed':'Walkthrough complete'):`Step ${state.index+1} of ${scenario.steps.length}`}</span><strong title={minimized?step.title:scenario.title}>{minimized?step.title:scenario.title}</strong></div>
        <div className="scenario-guide-tools"><Button variant="ghost" size="sm" aria-label={minimized?'Expand scenario guide':'Minimize scenario guide'} aria-expanded={!minimized} onClick={()=>{editing.current=false;setCompact(false);setMinimized(!minimized);}}><Icon name={minimized?'chevron-up':'chevron-down'} size={18}/></Button><Button variant="ghost" size="sm" aria-label="Close scenario guide" onClick={close}><Icon name="close" size={18}/></Button></div>
      </header>
      {!minimized && <div className="scenario-guide-body" key={stepKey}>
        {state.finished ? <><div className="scenario-guide-copy"><h2>You’ve reached the end</h2><p>{observed} {observed===1?'action':'actions'} observed · {reviewed} {reviewed===1?'section':'sections'} reviewed{skipped?` · ${skipped} skipped`:''}.</p><p>{skipped?'Your workspace stays open. You can revisit any skipped step.':'Continue working or choose another walkthrough.'}</p></div><div className="scenario-guide-actions"><Button variant="secondary" size="sm" onClick={()=>skipped?goToStep(state.progress!.findIndex(value=>value==='skipped')):start(scenario.id)}>{skipped?'Review skipped steps':'Start again'}</Button><Link className="button button--primary button--sm" to="/scenarios" onClick={close}>Browse scenarios<Icon name="arrow" size={16}/></Link></div></> : <>
          <div className="scenario-guide-copy" aria-live="polite" aria-atomic="true"><h2>{step.title}</h2><p>{guidance}</p></div>
          {unavailable && <p className="scenario-guide-hint">{tourStep.missing || 'Open the required data or sign in for this step. You can skip it and return later.'}</p>}
          {blockedReason && <p className="scenario-guide-hint" role="status">{blockedReason}</p>}
          <div className="scenario-guide-actions"><Button variant="ghost" size="sm" disabled={state.index===0} aria-label="Previous guide step" onClick={()=>goToStep(state.index-1)}><Icon name="chevron-left" size={17}/>Back</Button><Button variant="primary" size="sm" disabled={unavailable} onClick={primaryAction}>{unavailable?'Waiting for this section':primaryLabel}<Icon name={waiting&&!needsOpen&&!needsRoute?'eye':'arrow'} size={16}/></Button></div>
          {(waiting || unavailable) && <button type="button" className="scenario-skip" onClick={skip}>{finalStep?'End walkthrough':'Skip this step'}</button>}
        </>}
      </div>}
      {!minimized && <div className="scenario-guide-track" aria-hidden="true">{scenario.steps.map((item,index)=><span key={item.title} className={state.progress?.[index]==='skipped'?'is-skipped':state.progress?.[index]?'is-complete':index===state.index?'is-current':''}/>)}</div>}
    </aside>
  </>,layer);
}
