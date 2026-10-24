import { expect, test, type Page } from '@playwright/test';
import { findScenario } from '../../src/features/journeys/catalog';
import { chooseOption } from './helpers/controls';

const hook=(page:Page,name:string)=>page.locator(`[data-onboarding="${name}"]`);
const guide=(page:Page)=>page.getByRole('complementary',{name:'Scenario guide'});
async function start(page:Page,id:string,fresh=true) {
  if(fresh) await page.goto(`/scenarios?scenario=${id}`);
  else {
    const existing=guide(page);
    if(await existing.count()) await existing.getByRole('button',{name:'Close scenario guide',exact:true}).click();
    const navigation=page.getByRole('button',{name:'Open navigation',exact:true});
    if(await navigation.isVisible()) await navigation.click();
    await page.getByRole('button',{name:'Support',exact:true}).click();
    await page.getByRole('dialog',{name:'Help & support',exact:true}).getByRole('link',{name:'Follow a scenario Search, investigation and payments',exact:true}).click();
    await page.getByRole('button',{name:`View scenario: ${findScenario(id)!.title}`,exact:true}).click();
  }
  await page.getByRole('dialog').getByRole('button',{name:'Start scenario',exact:true}).click();
  await expect(guide(page)).toBeVisible();
}
async function step(page:Page,index:number,total:number) { await expect(guide(page)).toContainText(`Step ${index} of ${total}`); }
async function next(page:Page,label:string) {
  const expand=guide(page).getByRole('button',{name:'Expand scenario guide',exact:true});
  if(await expand.isVisible()) await expand.click();
  await guide(page).getByRole('button',{name:label,exact:true}).click();
}
async function finish(page:Page) {
  await next(page,'Finish walkthrough');
  await expect(guide(page)).toContainText('Walkthrough complete');
  const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!));
  expect(stored.progress).not.toContain('skipped');
}

for(const width of [1440,390]) for(const method of ['card','crypto'] as const) {
  test(`${method} walkthrough reaches its receipt and order at ${width}px`,async({page},info)=>{
    await page.setViewportSize({width,height:width===1440?960:844});
    await start(page,`${method}-payment`);
    await expect(hook(page,'purchase-review')).toBeVisible();
    await expect(hook(page,'purchase-method')).toHaveAttribute('data-control-value',method);
    if(method==='crypto') {
      await chooseOption(page.getByRole('combobox',{name:'Coin',exact:true}),'ETH');
      await expect(page.getByRole('combobox',{name:'Network',exact:true})).toHaveAttribute('data-control-value','Ethereum');
      await expect(page.getByRole('combobox',{name:'Coin',exact:true})).toHaveAttribute('data-control-value','ETH');
    }
    await next(page,'Review checkout');
    await step(page,2,5);
    await hook(page,'checkout-continue').click();
    await step(page,3,5);
    await expect(hook(page,'checkout-order')).toHaveAttribute('data-order-status','pending');
    await expect(hook(page,'checkout-receipt')).toHaveCount(0);
    await hook(page,`${method}-payment-confirm`).click();
    await expect(hook(page,'checkout-receipt')).toBeVisible();
    await step(page,4,5);
    await page.screenshot({path:info.outputPath(`${method}-guided-receipt-${width}.png`)});
    await hook(page,'checkout-view-order').click();
    await step(page,5,5);
    await expect(hook(page,'order-status')).toHaveAttribute('data-status','completed');
    await finish(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath(`${method}-guided-order-${width}.png`)});
  });
}

test('pending-payment and receipt walkthroughs use one order through completion and download',async({page},info)=>{
  await start(page,'resume-payment');
  await page.getByRole('link',{name:'View payment pay_001',exact:true}).click();
  await step(page,2,4);
  await expect(hook(page,'order-status')).toHaveAttribute('data-status','pending');
  await hook(page,'order-resume-payment').click();
  await step(page,3,4);
  await expect(page).toHaveURL(/\/checkout\/pay_001/);
  await hook(page,'crypto-payment-confirm').click();
  await step(page,4,4);
  await finish(page);
  await start(page,'payment-details',false);
  await page.getByRole('link',{name:'View payment pay_001',exact:true}).click();
  await step(page,2,4);
  await next(page,'Review timeline');
  await step(page,3,4);
  await next(page,'Review receipt');
  await step(page,4,4);
  const download=page.waitForEvent('download');
  await hook(page,'order-receipt').getByRole('button',{name:'Download receipt',exact:true}).click();
  expect((await download).suggestedFilename()).toContain('pay_001');
  await expect(guide(page)).toContainText('Walkthrough complete');
  await page.screenshot({path:info.outputPath('guided-order-receipt.png')});
});

test('cancellation and retry walkthroughs keep the cancelled order separate from the paid order',async({page},info)=>{
  await page.setViewportSize({width:320,height:844});
  await start(page,'cancel-checkout');
  await hook(page,'checkout-continue').click();
  await step(page,2,4);
  const canceledId=new URL(page.url()).pathname.split('/').at(-1)!;
  await hook(page,'checkout-cancel').click();
  await step(page,3,4);
  await expect(page.getByRole('dialog',{name:'Cancel this order?',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('guided-cancel-confirmation-320.png')});
  await hook(page,'checkout-cancel-confirm').click();
  await step(page,4,4);
  await expect(hook(page,'checkout-order')).toHaveAttribute('data-order-status','canceled');
  await finish(page);
  await start(page,'retry-payment',false);
  await page.getByRole('link',{name:`View payment ${canceledId}`,exact:true}).click();
  await step(page,2,5);
  await expect(hook(page,'order-status')).toHaveAttribute('data-status','canceled');
  await hook(page,'order-retry-payment').click();
  await step(page,3,5);
  await hook(page,'checkout-continue').click();
  await step(page,4,5);
  const paidId=new URL(page.url()).pathname.split('/').at(-1)!;
  expect(paidId).not.toBe(canceledId);
  await hook(page,'card-payment-confirm').click();
  await step(page,5,5);
  await finish(page);
  await hook(page,'checkout-view-order').click();
  await expect(hook(page,'order-status')).toHaveAttribute('data-status','completed');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('guided-retry-completed-320.png')});
});

for(const width of [1440,320]) test(`invoice walkthrough prepares a reviewed request without sending at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:width>760?960:844});
  await start(page,'request-invoice');
  await hook(page,'invoice-request').click();
  await step(page,2,4);
  const message=page.getByRole('textbox',{name:'Message',exact:true});
  await expect(message).toHaveValue(/annual Business/);
  const initial=await message.inputValue();
  await message.fill(initial.replace('Company name:','Company name: Acme Research').replace('Billing address:','Billing address: 10 Research Street'));
  await page.getByRole('button',{name:'Prepare email',exact:true}).click();
  await step(page,3,4);
  await expect(page.locator('.support-message-preview')).toContainText('Acme Research');
  await next(page,'Review sending options');
  await step(page,4,4);
  const email=page.getByRole('link',{name:'Open email app',exact:true});
  await expect(email).toHaveAttribute('href',/^mailto:info@apcosys.net\?/);
  if(width<=760) {
    const guideBox=(await guide(page).boundingBox())!;
    const footerBox=(await page.locator('.support-dialog[open] > .dialog-footer').boundingBox())!;
    expect(guideBox.y+guideBox.height).toBeLessThanOrEqual(footerBox.y+1);
  }
  await page.screenshot({path:info.outputPath(`guided-invoice-review-${width}.png`)});
  await finish(page);
  await expect(page.getByRole('dialog')).not.toContainText(/message sent|ticket created/i);
});

test('promotion walkthrough carries the accepted discount into checkout',async({page},info)=>{
  await start(page,'apply-promo');
  await hook(page,'purchase-promo-input').fill('WELCOME');
  await hook(page,'purchase-promo-check').click();
  await step(page,2,4);
  await expect(hook(page,'purchase-promo-applied')).toContainText('10%');
  await next(page,'Review checkout');
  await step(page,3,4);
  await hook(page,'checkout-continue').click();
  await step(page,4,4);
  await expect(hook(page,'order-summary')).toContainText(/WELCOME|Discount/);
  await expect(hook(page,'checkout-order')).toHaveAttribute('data-order-status','pending');
  await finish(page);
  await page.screenshot({path:info.outputPath('guided-promotion-checkout.png')});
});

test('renewal walkthrough waits for both explicit confirmations',async({page},info)=>{
  await start(page,'manage-renewal');
  await expect(hook(page,'subscription-renewal-status')).toHaveAttribute('data-state','active');
  await next(page,'Review renewal');
  await step(page,2,5);
  await hook(page,'subscription-cancel-renewal').click();
  await step(page,3,5);
  await expect(hook(page,'subscription-renewal-status')).toHaveAttribute('data-state','active');
  await hook(page,'subscription-confirm').click();
  await step(page,4,5);
  await expect(hook(page,'subscription-renewal-status')).toHaveAttribute('data-state','canceled');
  await hook(page,'subscription-resume-renewal').click();
  await hook(page,'subscription-confirm').click();
  await step(page,5,5);
  await expect(hook(page,'subscription-renewal-status')).toHaveAttribute('data-state','active');
  await finish(page);
  await page.screenshot({path:info.outputPath('guided-renewal-restored.png')});
});
