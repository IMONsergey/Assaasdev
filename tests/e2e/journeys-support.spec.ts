import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('scenario directory filters real workflows and guides a host investigation without losing query context',async ({page},testInfo) => {
  await page.goto('/scenarios');
  await expect(page.getByRole('heading',{name:'Scenarios',exact:true})).toBeVisible();
  await expect(page.locator('.scenario-card')).toHaveCount(51);
  await page.getByRole('textbox',{name:'Find a scenario'}).fill('certificate');
  await expect(page.getByRole('button',{name:'View scenario: Inspect HTTP and TLS evidence'})).toBeVisible();
  await expect(page.locator('.scenario-card')).toHaveCount(1);
  await page.getByRole('textbox',{name:'Find a scenario'}).fill('');
  await page.getByRole('button',{name:'View scenario: Classify hundreds of services'}).click();
  const details=page.getByRole('dialog',{name:'Classify hundreds of services',exact:true});
  await expect(details.locator('ol>li')).toHaveCount(4);
  await details.getByRole('button',{name:'Start scenario',exact:true}).click();
  await expect(page).toHaveURL(/\/search$/);
  const guide=page.getByRole('complementary',{name:'Scenario guide'});
  await expect(guide).toContainText('Step 1 of 4');
  await expect(page.locator('.search-result-row')).toHaveCount(0);
  await page.locator('#main-search-query').fill('example');
  await page.getByRole('button',{name:'Run search',exact:true}).click();
  await page.locator('.search-result-ip').first().click();
  await expect(page).toHaveURL(/\/hosts\//);
  const before=new URL(page.url());
  expect(before.searchParams.get('request')).toBeTruthy();
  expect(before.searchParams.get('back')).toBeTruthy();
  await expect(guide).toContainText('Step 2 of 4');
  await expect(page.getByRole('tab',{name:/^Services/})).toHaveAttribute('aria-selected','true');
  const after=new URL(page.url());
  expect(after.searchParams.get('request')).toBe(before.searchParams.get('request'));
  expect(after.searchParams.get('back')).toBe(before.searchParams.get('back'));
  await expect(guide).toContainText('Step 2 of 4');
  await guide.getByRole('button',{name:'Minimize scenario guide'}).click();
  await expect(guide).toHaveClass(/is-minimized/);
  await page.reload();
  await expect(guide).toHaveClass(/is-minimized/);
  await guide.getByRole('button',{name:'Expand scenario guide'}).click();
  await expect(guide).toContainText('Open the catalog');
  const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!));
  expect(Object.keys(stored).sort()).toEqual(['finished','id','index','minimized','progress']);
  expect(stored.progress[0]).toBe('observed');
  await page.screenshot({path:testInfo.outputPath('host-guided-scenario.png'),fullPage:true});
  await guide.getByRole('button',{name:'Close scenario guide'}).click();
  await expect(guide).toHaveCount(0);
});

test('a filter guide opens the mounted search editor without changing the applied request',async ({page}) => {
  await page.goto('/scenarios?scenario=refine-search');
  await page.getByRole('dialog').getByRole('button',{name:'Start scenario',exact:true}).click();
  await page.locator('#main-search-query').fill('example');
  await page.getByRole('button',{name:'Run search',exact:true}).click();
  await expect(page.locator('.search-result-row').first()).toBeVisible();
  const request=new URL(page.url()).searchParams.get('request');
  expect(request).toBeTruthy();
  const guide=page.getByRole('complementary',{name:'Scenario guide'});
  await expect(guide).toContainText('Step 2 of 3');
  const filters=page.getByRole('dialog',{name:'Filters',exact:true});
  await expect(filters).toBeVisible();
  expect(new URL(page.url()).searchParams.get('request')).toBe(request);
  await filters.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(filters).not.toBeVisible();
  expect(new URL(page.url()).searchParams.get('conditions')).toBeNull();
  await expect(guide).toContainText('Step 3 of 3');
  await guide.getByRole('button',{name:'Previous guide step',exact:true}).click();
  await expect(filters).toBeVisible();
  expect(new URL(page.url()).searchParams.get('request')).toBe(request);
});

test('support request validates, previews an exact email draft and retains edits without sending',async ({page},testInfo) => {
  await page.goto('/search');
  await page.getByRole('button',{name:'Support',exact:true}).click();
  await page.getByRole('button',{name:'Contact support',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Contact support',exact:true});
  await dialog.getByRole('textbox',{name:'Name',exact:true}).fill('Alex QA');
  await dialog.getByRole('textbox',{name:'Reply email',exact:true}).fill('alex@example.org');
  await dialog.getByRole('textbox',{name:'Message',exact:true}).fill('              ');
  await dialog.getByRole('button',{name:'Prepare email',exact:true}).click();
  await expect(dialog).toContainText('Write at least 10 characters');
  const message='Filters: HTTPS + TLS. The second condition disappears after a change.';
  await dialog.getByRole('textbox',{name:'Message',exact:true}).fill(message);
  await dialog.getByRole('button',{name:'Prepare email',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Review your message',exact:true});
  await expect(dialog).toContainText(message);
  const href=await dialog.getByRole('link',{name:'Open email app'}).getAttribute('href');
  expect(href?.startsWith('mailto:info@apcosys.net?')).toBe(true);
  const params=new URLSearchParams(href!.split('?')[1]);
  expect(params.get('body')).toContain(message);
  await expect(dialog).not.toContainText(/message sent|ticket created/i);
  await page.screenshot({path:testInfo.outputPath('support-review-desktop.png'),fullPage:true});
  await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Support',exact:true}).click();
  await page.getByRole('button',{name:'Contact support',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue(message);
});

for (const width of [1440,390,320]) {
  test(`scenarios, legal and support fit ${width}px`,async ({page},testInfo) => {
    await page.setViewportSize({width,height:width>760?1000:844});
    await page.goto('/scenarios');
    await expect(page.locator('.scenario-card')).toHaveCount(51);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`scenarios-${width}.png`),animations:'disabled'});
    await page.getByRole('button',{name:'View scenario: Run your first search'}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Start scenario',exact:true}).click();
    const guide=page.getByRole('complementary',{name:'Scenario guide'});
    await expect(guide.getByRole('button',{name:'Show me',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`guide-${width}.png`),fullPage:true});
    await guide.getByRole('button',{name:'Close scenario guide'}).click();
    await page.goto('/settings?section=legal');
    if(width<=760) await expect(page.getByRole('button',{name:'Choose settings section: Legal'})).toBeInViewport();
    else await expect(page.getByRole('tab',{name:'Legal',exact:true})).toBeInViewport();
    const legal=page.getByRole('tabpanel',{name:'Legal',exact:true});
    await expect(legal.locator('a')).toHaveCount(6);
    for (const link of await legal.locator('a').all()) {expect(await link.getAttribute('href')).toMatch(/^https:\/\/apcosys.net\/legal\//);expect(await link.getAttribute('rel')).toContain('noopener');}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`legal-${width}.png`),fullPage:true});
    if(width<=760) await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    await page.getByRole('button',{name:'Support',exact:true}).click();
    await page.getByRole('button',{name:'Contact support',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Contact support',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`support-form-${width}.png`),fullPage:true,animations:'disabled'});
  });
}

test('new scenario and legal surfaces pass targeted accessibility checks',async ({page}) => {
  for (const route of ['/scenarios','/settings?section=legal','/api?section=usage']) {
    await page.goto(route);
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(result.violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>node.target)}))).toEqual([]);
  }
});
