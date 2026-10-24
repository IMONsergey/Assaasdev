import { describe, expect, it } from 'vitest';
import { filterScenarios, scenarios } from './catalog';
import { parseGuideState, resolveScenarioTarget } from './guide-state';
import { prepareSupportMessage, supportEmail } from '../support/resources';

describe('scenario navigation', () => {
  it('keeps task scope and exact payload when opening another host tab', () => {
    const params = new URLSearchParams({request:JSON.stringify({task_ids:['private-task'],host:'example.org'}),st:'bound-token',tab:'overview',service:'unique-observation',back:'/private/search?request=opaque'});
    const current = `/private/hosts/2001%3Adb8%3A%3A1?${params}`;
    const result = resolveScenarioTarget({area:'host',params:{tab:'services',view:'tls'}},current,{});
    const after = new URL(result!,'https://workspace.invalid');
    expect(after.pathname).toBe('/private/hosts/2001%3Adb8%3A%3A1');
    for (const key of ['request','st','service','back']) expect(after.searchParams.get(key)).toBe(params.get(key));
    expect(after.searchParams.get('view')).toBe('tls');
    expect(resolveScenarioTarget({area:'host'},'/scenarios',{})).toBeNull();
  });
  it('does not invent a search or permit external navigation', () => {
    expect(resolveScenarioTarget({area:'search',params:{conditions:'1'}},'/scenarios',{})).toBe('/search?conditions=1');
    expect(resolveScenarioTarget({path:'//outside.example'},'/scenarios',{})).toBeNull();
    expect(resolveScenarioTarget({path:'/\\outside.example'},'/scenarios',{})).toBeNull();
    expect(resolveScenarioTarget({area:'host'},'/scenarios',{host:'https://outside.example/hosts/1.2.3.4'})).toBeNull();
    expect(resolveScenarioTarget({area:'files'},'/scenarios',{files:'/billing?section=plans'})).toBeNull();
  });
  it('rejects invalid persisted progress and keeps only static progress fields', () => {
    expect(parseGuideState({id:'unknown',index:0})).toBeNull();
    expect(parseGuideState({id:'first-search',index:-1})).toBeNull();
    expect(parseGuideState({id:'first-search',index:500})).toBeNull();
    expect(parseGuideState({id:'first-search',index:0,query:'secret'})).toEqual({id:'first-search',index:0,minimized:false,finished:false,progress:[null,null,null]});
    expect(parseGuideState({id:'first-search',index:2,finished:true})?.progress).toEqual(['skipped','skipped','skipped']);
    expect(parseGuideState({id:'first-search',index:1})?.progress).toEqual(['skipped',null,null]);
  });
  it('maps all source acceptance families and finds relevant workflow steps', () => {
    const source = new Set(scenarios.map(item => item.source));
    expect(Array.from({length:38},(_,index)=>`AC-${String(index+1).padStart(2,'0')}`).every(id=>source.has(id))).toBe(true);
    expect(new Set(scenarios.map(item=>item.id)).size).toBe(scenarios.length);
    expect(filterScenarios('certificate','Host investigation').map(item=>item.id)).toContain('inspect-http-tls');
    expect(filterScenarios('billing','Private Scanner')).toEqual([]);
  });
});

describe('support draft', () => {
  it('prepares exact encoded email content without adding message fields to the mail headers', () => {
    const message = prepareSupportMessage({name:'Alex\nBcc: outside@example.org',email:'alex@example.org',topic:'Search & data',message:'A query with + signs, Unicode пример and & filters.'});
    const [destination,query] = message.mailto.split('?');
    expect(destination).toBe(`mailto:${supportEmail}`);
    const params = new URLSearchParams(query);
    expect([...params.keys()]).toEqual(['subject','body']);
    expect(params.get('body')).toBe(message.body);
    expect(params.get('subject')).toBe('APCOSYS · Search & data');
  });
});

describe('interactive walkthrough contracts', () => {
  it('gives every source step a concrete live interface target', async () => {
    const {tourFlows} = await import('./tour-flow');
    expect(Object.keys(tourFlows).sort()).toEqual(scenarios.map(item=>item.id).sort());
    for(const scenario of scenarios) {
      expect(tourFlows[scenario.id],scenario.id).toHaveLength(scenario.steps.length);
      for(const step of tourFlows[scenario.id]) {
        expect(step.anchor.trim(),scenario.id).not.toBe('');
        if(step.wait?.kind==='route') expect(()=>new RegExp(step.wait!.kind==='route'?step.wait!.pattern:'')).not.toThrow();
      }
    }
  });
  it('keeps skipped and observed actions distinct and strips unrelated persisted data',async()=>{
    const {recordStepOutcome} = await import('./guide-state');
    const base={id:'first-search',index:0,minimized:false,finished:false};
    const skipped=recordStepOutcome(base,3,'skipped');
    expect(skipped.progress).toEqual(['skipped',null,null]);
    const observed=recordStepOutcome({...skipped,index:1},3,'observed');
    expect(observed.progress).toEqual(['skipped','observed',null]);
    expect(parseGuideState({...observed,query:'private',url:'/search?secret=true'})).toEqual(observed);
    expect(parseGuideState({...base,progress:['observed','not-an-outcome',null]})).toEqual({...base,progress:[null,null,null]});
  });
  it('only offers explicit UI-opening actions, without any destructive or paid control', async()=>{
    const {tourFlows}=await import('./tour-flow');
    const selectors=Object.values(tourFlows).flat().flatMap(step=>step.open?[step.open.selector]:[]);
    expect(selectors.every(selector=>['[data-onboarding="export-search"]','[data-onboarding="share-search"]','[data-onboarding="save-query"]','[data-onboarding="support"]','[data-onboarding="export-files"]','[data-onboarding="check-payment"]','[data-onboarding="avatar-picker"]','[data-onboarding="history-clear"]','#files-filter-toggle'].includes(selector))).toBe(true);
  });
  it('requires an explicit avatar save and a closed picker before observing success', async()=>{
    const {observedEventComplete,tourFlows}=await import('./tour-flow');
    const signal=tourFlows['upload-avatar'][2].wait!;
    if(signal.kind!=='event') throw new Error('Avatar save must be explicitly observed');
    expect(observedEventComplete(signal,false,selector=>selector===signal.thenVisible)).toBe(false);
    expect(observedEventComplete(signal,true,()=>true)).toBe(false);
    expect(observedEventComplete(signal,true,()=>false)).toBe(false);
    expect(observedEventComplete(signal,true,selector=>selector===signal.thenVisible)).toBe(true);
  });
});
