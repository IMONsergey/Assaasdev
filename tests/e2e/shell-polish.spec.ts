import { expect, test } from '@playwright/test';

test('sidebar moves continuously, keeps icons aligned and respects reduced motion', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/search');
  await expect(page.getByRole('button',{name:'Collapse navigation',exact:true})).toBeVisible();
  const samples = await page.evaluate(async()=>{
    const sidebar=document.querySelector<HTMLElement>('.app-sidebar')!;
    const icon=sidebar.querySelector<HTMLElement>('.sidebar-primary .nav-link > .icon')!;
    const control=sidebar.querySelector<HTMLButtonElement>('.navigation-toggle')!;
    const result:{width:number;iconX:number}[]=[];
    control.click();
    await new Promise<void>(resolve=>{
      const start=performance.now();
      const frame=()=>{
        result.push({width:sidebar.getBoundingClientRect().width,iconX:icon.getBoundingClientRect().x});
        if(performance.now()-start<450) requestAnimationFrame(frame);else resolve();
      };
      requestAnimationFrame(frame);
    });
    return result;
  });
  expect(samples.some(sample=>sample.width>75 && sample.width<230)).toBe(true);
  expect(Math.max(...samples.map(sample=>sample.iconX))-Math.min(...samples.map(sample=>sample.iconX))).toBeLessThan(1);
  expect(Math.round(samples.at(-1)!.width)).toBe(72);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Expand navigation',exact:true}).click();
  expect(await page.locator('.app-sidebar').evaluate(element=>getComputedStyle(element).transitionDuration)).toBe('0s');
  const header=await page.locator('.app-topbar').evaluate(element=>({background:getComputedStyle(element).backgroundColor,border:getComputedStyle(element).borderBottomWidth}));
  expect(header).toEqual({background:'rgba(0, 0, 0, 0)',border:'0px'});
});

test('compact help and toast remain readable and dismissible at 320px', async ({page,context,browserName},info) => {
  if(browserName==='chromium') await context.grantPermissions(['clipboard-write']);
  await page.setViewportSize({width:320,height:844});
  await page.goto('/search');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('button',{name:'Support',exact:true}).click();
  const help=page.getByRole('dialog',{name:'Help & support',exact:true});
  await expect(help.locator('kbd')).toHaveCount(0);
  await expect(help.getByRole('link',{name:'Follow a scenario Search, investigation and payments'})).toBeVisible();
  await help.getByRole('button',{name:'Contact support',exact:true}).click();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Please check the credit allocation on my current subscription.');
  await page.getByRole('button',{name:'Prepare email',exact:true}).click();
  await page.getByRole('button',{name:'Copy message',exact:true}).click();
  const toast=page.locator('.toast--polished');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/Copied/i);
  const box=(await toast.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(320);
  expect(box.height).toBeLessThan(120);
  await page.screenshot({path:info.outputPath('support-toast-320.png')});
  await toast.getByRole('button',{name:'Dismiss notification',exact:true}).click();
  await expect(toast).toHaveCount(0);
});

test('the seamless topbar stays readable over scrolled content on desktop and mobile', async ({page}) => {
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:844});
    await page.goto('/billing?section=credits');
    await expect(page.locator('.billing-token').first()).toBeVisible();
    const header=page.locator('.app-topbar');
    expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await page.evaluate(()=>window.scrollTo(0,450));
    await expect(header).toHaveAttribute('data-over-content','true');
    expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    expect(await header.evaluate(element=>getComputedStyle(element).borderBottomWidth)).toBe('0px');
    await page.evaluate(()=>window.scrollTo(0,0));
    await expect(header).toHaveAttribute('data-over-content','false');
    expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  }
});
