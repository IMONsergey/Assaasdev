import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedHosts, seedProfile } from '../../src/demo/fixtures';

const guideOf=(page:Page)=>page.getByRole('complementary',{name:'Scenario guide'});
async function start(page:Page,id:string) {
  await page.goto(`/scenarios?scenario=${id}`);
  await page.getByRole('dialog').getByRole('button',{name:'Start scenario',exact:true}).click();
  await expect(guideOf(page)).toBeVisible();
}
async function expand(guide:Locator) {
  if(await guide.getByRole('button',{name:'Expand scenario guide'}).isVisible()) await guide.getByRole('button',{name:'Expand scenario guide'}).click();
}
async function searchApi(page:Page) {
  const requests:Array<{type:string;data:Record<string,unknown>}>=[];
  const host=seedHosts()[0];
  await page.route('**/runtime-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};'}));
  await page.route('**/backend/**',route=>route.fulfill({json:seedProfile()}));
  await page.routeWebSocket('**/backend/ws',socket=>socket.onMessage(raw=>{
    const request=JSON.parse(String(raw)); requests.push(request);
    const reply=(data:unknown)=>socket.send(JSON.stringify({type:request.type,id:request.id,data,metadata:{subscription_type:'Business'}}));
    if(request.type==='hosts' || request.type==='private_hosts') reply([host.card]);
    else if(request.type==='hostinfo' || request.type==='private_hostinfo') reply(host.detail);
    else if(request.type==='autocomplete') reply({results:[],has_more:false});
    else if(request.type==='query_list') reply([]);
    else reply({unread_count:0});
  }));
  return requests;
}
async function run(page:Page) {
  await page.locator('#main-search-query').fill('example');
  await page.locator('.search-query-bar').getByRole('button',{name:'Run search',exact:true}).click();
}
async function noModalOverlap(page:Page,dialog:Locator) {
  const guide=guideOf(page);
  await expect.poll(async()=>{
    const [card,header,body,footer]=await Promise.all([guide.boundingBox(),dialog.locator(':scope > .dialog-header').boundingBox(),dialog.locator(':scope > .dialog-body').boundingBox(),dialog.locator(':scope > .dialog-footer').boundingBox()]);
    return !!card && !!header && !!body && !!footer && card.y>=header.y+header.height-1 && card.y>=body.y+body.height-1 && card.y+card.height<=footer.y+1;
  }).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}

for(const width of [1440,390]) test(`history guide restores a draft and waits for explicit Run at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  const requests=await searchApi(page);
  await start(page,'search-history');
  const guide=guideOf(page);
  expect(requests.filter(item=>item.type==='hosts')).toHaveLength(0);
  await run(page);
  await expect(page).toHaveURL(/\/search\/history$/);
  await expect(guide).toContainText('Step 2 of 4');
  await page.locator('[data-onboarding="history-restore"]').first().click();
  await expect(guide).toContainText('Step 3 of 4');
  await expect(page.getByRole('heading',{name:'Run this search',exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get('draft')).toBe('1');
  expect(requests.filter(item=>item.type==='hosts')).toHaveLength(1);
  await page.screenshot({path:testInfo.outputPath(`journey-history-draft-${width}.png`)});
  await page.locator('.search-query-bar').getByRole('button',{name:'Run search',exact:true}).click();
  await expect(guide).toContainText('Step 4 of 4');
  expect(requests.filter(item=>item.type==='hosts')).toHaveLength(2);
  await expand(guide); await guide.getByRole('button',{name:'Finish walkthrough'}).click();
  await expect(guide).toContainText('3 actions observed');
});

test('clear-history guide requires confirmation, observes Undo and never starts another search',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const requests=await searchApi(page);
  await start(page,'manage-search-history'); const guide=guideOf(page);
  await run(page); await expect(guide).toContainText('Step 2 of 4');
  await expand(guide); await guide.getByRole('button',{name:'Review clearing history',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Clear search history?',exact:true});
  await expect(guide).toContainText('Step 3 of 4'); await noModalOverlap(page,dialog);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.locator('.search-history-row')).toHaveCount(1);
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!).progress[2])).toBeNull();
  await page.locator('[data-onboarding="history-clear"]').click();
  await page.screenshot({path:testInfo.outputPath('journey-history-confirm-390.png')});
  await page.locator('[data-onboarding="history-confirm-clear"]').click();
  await expect(guide).toContainText('Step 4 of 4');
  await page.locator('[data-onboarding="history-undo"]').click();
  await expect(page.locator('.search-history-row')).toHaveCount(1);
  await expect(guide).toContainText('Walkthrough complete');
  expect(requests.filter(item=>item.type==='hosts')).toHaveLength(1);
});

for(const width of [390,320]) test(`avatar guide observes a local photo save and does not complete on Cancel at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  await start(page,'upload-avatar'); const guide=guideOf(page);
  await guide.getByRole('button',{name:'Open avatar picker'}).click();
  const dialog=page.getByRole('dialog',{name:'Choose your avatar',exact:true});
  await expect(guide).toContainText('Step 2 of 4');
  await noModalOverlap(page,dialog);
  const fixture=fileURLToPath(new URL('../fixtures/avatars/portrait.png',import.meta.url));
  await page.locator('[data-onboarding="avatar-upload"]').setInputFiles(fixture);
  await expect(guide).toContainText('Step 3 of 4');
  await noModalOverlap(page,dialog);
  const preview=(await page.locator('[data-onboarding="avatar-preview"] img').getAttribute('src'))!;
  await page.screenshot({path:testInfo.outputPath(`journey-avatar-preview-${width}.png`)});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!).progress[2])).toBeNull();
  await expect(page.locator('.profile-avatar-button img')).not.toHaveAttribute('src',preview);
  await page.locator('[data-onboarding="avatar-picker"]').click();
  await page.locator('[data-onboarding="avatar-upload"]').setInputFiles(fixture);
  await expect(page.locator('[data-onboarding="avatar-preview"]')).toHaveAttribute('data-onboarding-state','ready');
  await page.locator('[data-onboarding="avatar-save"]').click();
  await expect(guide).toContainText('Step 4 of 4');
  await expect(page.locator('.profile-avatar-button img')).toHaveAttribute('src',/^data:image\//);
  await expand(guide); await guide.getByRole('button',{name:'Finish walkthrough'}).click();
  await expect(guide).toContainText('3 actions observed');
  await guide.getByRole('button',{name:'Close scenario guide'}).click();
  expect(await page.locator('dialog:has(>.scenario-tour-layer[data-docked="true"])').count()).toBe(0);
});

for(const width of [1440,390,320]) test(`wallet guide waits for payment consent and confirmed receipt at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  await start(page,'wallet-payment'); const guide=guideOf(page);
  const dialog=page.getByRole('dialog',{name:'Add 25,000 credits',exact:true});
  await expect(dialog.locator('.wallet-balance')).toHaveText('$120');
  if(width<760) await noModalOverlap(page,dialog);
  else await expect.poll(async()=>{
    const [card,modal]=await Promise.all([guide.boundingBox(),dialog.boundingBox()]);
    return !!card && !!modal && (card.x+card.width<=modal.x || card.x>=modal.x+modal.width);
  }).toBe(true);
  await expect(guide.locator('.scenario-guide-copy p')).toHaveCount(1);
  await expect(guide.locator('.scenario-guide-hint')).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath(`journey-wallet-review-${width}.png`)});
  await guide.getByRole('button',{name:'Check wallet balance'}).click();
  await expect(guide).toContainText('Step 2 of 4');
  await expect(dialog.locator('[data-onboarding="wallet-receipt"]')).toHaveCount(0);
  await dialog.locator('[data-onboarding="wallet-pay"]').click();
  await expect(dialog.locator('[data-onboarding="wallet-checkout"]')).toHaveAttribute('data-payment-state','pending');
  await expect(guide).toContainText('Step 2 of 4');
  await expect(guide).toContainText('Step 3 of 4');
  await expect(dialog.locator('[data-onboarding="wallet-receipt"]')).toContainText('$70');
  if(width<760) await noModalOverlap(page,dialog);
  await page.screenshot({path:testInfo.outputPath(`journey-wallet-receipt-${width}.png`)});
  await dialog.locator('[data-onboarding="wallet-done"]').click();
  await expect(guide).toContainText('Step 4 of 4');
  await expect(page.locator('.billing-history-table')).toContainText('completed');
  await guide.getByRole('button',{name:'Finish walkthrough'}).click();
  await expect(guide).toContainText('2 actions observed');
  expect(await page.locator('dialog:has(>.scenario-tour-layer[data-docked="true"])').count()).toBe(0);
});

test('mobile guide leaves the focused support field, header and footer reachable without changing the draft',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:640});
  await start(page,'contact-support'); const guide=guideOf(page);
  await guide.getByRole('button',{name:'Open support',exact:true}).click();
  await page.getByRole('button',{name:'Contact support',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Contact support',exact:true});
  const message=dialog.getByRole('textbox',{name:'Message',exact:true});
  await expect(guide).toContainText('Step 2 of 4');
  await message.fill('Please help me restore the filter I was reviewing.');
  await expect(message).toBeFocused(); await expect(guide).toHaveClass(/is-minimized/);
  await noModalOverlap(page,dialog);
  await expect.poll(async()=>{
    const [field,card,header]=await Promise.all([message.boundingBox(),guide.boundingBox(),dialog.locator(':scope > .dialog-header').boundingBox()]);
    return !!field && !!card && !!header && field.y>=header.y+header.height-1 && field.y+field.height<=card.y+1;
  }).toBe(true);
  await page.screenshot({path:testInfo.outputPath('journey-support-field-320.png')});
  await guide.getByRole('button',{name:'Close scenario guide'}).click();
  await expect(dialog).toBeVisible(); await expect(message).toHaveValue('Please help me restore the filter I was reviewing.');
  expect(await page.locator('dialog:has(>.scenario-tour-layer[data-docked="true"])').count()).toBe(0);
});

for(const width of [1440,320]) test(`host pivot guide keeps the new search unsubmitted until Run at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  const requests=await searchApi(page);
  await start(page,'pivot-from-host'); const guide=guideOf(page);
  await run(page); await page.locator('.search-result-ip').first().click();
  await expect(guide).toContainText('Step 2 of 4');
  await page.locator('[data-onboarding="host-field-search"]:visible').first().click();
  await expect(guide).toContainText('Step 3 of 4');
  await expect(page.getByRole('heading',{name:'Run this search',exact:true})).toBeVisible();
  expect(requests.filter(item=>item.type==='hosts')).toHaveLength(1);
  const request=JSON.parse(new URL(page.url()).searchParams.get('request')!);
  expect(request.simple_search_filters).toHaveLength(1);
  await page.screenshot({path:testInfo.outputPath(`journey-host-pivot-${width}.png`)});
  await page.locator('.search-query-bar').getByRole('button',{name:'Run search',exact:true}).click();
  await expect(guide).toContainText('Step 4 of 4');
  expect(requests.filter(item=>item.type==='hosts')).toHaveLength(2);
});
