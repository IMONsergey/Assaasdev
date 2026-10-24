import {expect,test} from '@playwright/test';
import {scenarioCategories,scenarios} from '../../src/features/journeys/catalog';

const guideOf = (page: import('@playwright/test').Page) => page.getByRole('complementary',{name:'Scenario guide'});
async function start(page: import('@playwright/test').Page,id:string) {
  await page.goto(`/scenarios?scenario=${id}`);
  await page.getByRole('dialog').getByRole('button',{name:'Start scenario',exact:true}).click();
  await expect(guideOf(page)).toBeVisible();
}

test('onboarding follows search results and host navigation, with Back preserving observed progress',async({page},testInfo)=>{
  await start(page,'first-search');
  const guide=guideOf(page);
  await expect(guide).toContainText('Step 1 of 3');
  await expect(guide).toHaveAttribute('data-target-found','true');
  await expect(guide.getByRole('button',{name:'Continue',exact:true})).toHaveCount(0);
  await guide.getByRole('button',{name:'Show me',exact:true}).click();
  await expect(page.locator('#main-search-query')).toBeFocused();
  await page.locator('#main-search-query').fill('example');
  await expect(guide).toContainText('Step 1 of 3');
  await page.getByRole('button',{name:'Run search',exact:true}).click();
  await expect(guide).toContainText('Step 2 of 3');
  const searchUrl=page.url();
  await page.locator('.search-result-ip').first().click();
  await expect(guide).toContainText('Step 3 of 3');
  await expect(page.getByRole('tab',{name:'Overview',exact:true})).toHaveAttribute('aria-selected','true');
  await page.screenshot({path:testInfo.outputPath('onboarding-host-desktop.png'),fullPage:false});
  await guide.getByRole('button',{name:'Previous guide step'}).click();
  await expect(guide).toContainText('Step 2 of 3');
  await expect(page).toHaveURL(searchUrl);
  await expect(guide.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
  await guide.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(guide).toContainText('Step 3 of 3');
  await expect(guide).toHaveAttribute('data-target-found','true');
  await guide.getByRole('button',{name:'Finish walkthrough',exact:true}).click();
  await expect(guide).toContainText('Walkthrough complete');
  await expect(guide).toContainText('2 actions observed');
  await expect(guide).toContainText('1 section reviewed');
});

test('skipping an action records a skipped step and never claims that the workflow was completed',async({page})=>{
  await start(page,'first-search');
  const guide=guideOf(page);
  await guide.getByRole('button',{name:'Skip this step',exact:true}).click();
  await guide.getByRole('button',{name:'Skip this step',exact:true}).click();
  await guide.getByRole('button',{name:'End walkthrough',exact:true}).click();
  await expect(guide).toContainText('Walkthrough reviewed');
  await expect(guide).not.toContainText('Walkthrough complete');
  await expect(guide).toContainText('0 actions observed');
  await expect(guide).toContainText('3 skipped');
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!).progress)).toEqual(['skipped','skipped','skipped']);
  await guide.getByRole('button',{name:'Review skipped steps',exact:true}).click();
  await expect(guide).toContainText('Step 1 of 3');
  await expect(guide.getByRole('button',{name:'Show me',exact:true})).toBeVisible();
});

for(const width of [1440,390,320]) {
  test(`coach remains interactive in native filter dialogs at ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:844});
    await start(page,'combine-conditions');
    const guide=guideOf(page),dialog=page.getByRole('dialog',{name:'Filters',exact:true});
    await expect(dialog).toBeVisible();
    await expect(guide).toHaveAttribute('data-target-found','true');
    expect(await guide.evaluate(node=>!!node.closest('dialog:modal'))).toBe(true);
    await guide.getByRole('button',{name:'Review groups',exact:true}).click();
    await expect(guide).toContainText('Step 2 of 4');
    await expect(dialog).toBeVisible();
    expect(new URL(page.url()).searchParams.get('run')).toBeNull();
    const bounds=await guide.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1);
    expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(845);
    await page.screenshot({path:testInfo.outputPath(`onboarding-modal-${width}.png`),fullPage:false});
    await guide.getByRole('button',{name:'Close scenario guide'}).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(dialog).not.toBeVisible();
  });
}

test('mobile support walkthrough opens the form from its coach and follows actual draft preparation',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await start(page,'contact-support');
  const guide=guideOf(page);
  await guide.getByRole('button',{name:'Open support',exact:true}).click();
  await page.getByRole('button',{name:'Contact support',exact:true}).click();
  await expect(guide).toContainText('Step 2 of 4');
  const dialog=page.getByRole('dialog',{name:'Contact support',exact:true});
  await dialog.getByRole('textbox',{name:'Message',exact:true}).fill('The filter editor lost a condition after returning from a host.');
  await dialog.getByRole('textbox',{name:'Name',exact:true}).fill('Alex');
  await dialog.getByRole('textbox',{name:'Reply email',exact:true}).fill('alex@example.org');
  await dialog.getByRole('button',{name:'Prepare email',exact:true}).click();
  await expect(guide).toContainText('Step 3 of 4');
  await expect(page.getByRole('dialog',{name:'Review your message',exact:true})).toBeVisible();
  await expect(guide).not.toContainText('message sent');
  await page.screenshot({path:testInfo.outputPath('onboarding-support-mobile.png'),fullPage:false});
});

test('scan walkthrough reaches explicit confirmation without creating a task or abandoning its draft',async({page},testInfo)=>{
  await start(page,'create-scan');
  const guide=guideOf(page);
  await page.getByRole('textbox',{name:'Hosts and IP addresses',exact:true}).fill('192.0.2.10');
  await guide.getByRole('button',{name:'Choose ports',exact:true}).click();
  await page.getByRole('textbox',{name:'Port list',exact:true}).fill('443');
  await guide.getByRole('button',{name:'Review task',exact:true}).click();
  await expect(guide).toContainText('Step 3 of 4');
  await page.locator('.scanner-form-actions').getByRole('button',{name:'Review task',exact:true}).click();
  await expect(guide).toContainText('Step 4 of 4');
  await expect(page.locator('.scanner-review')).toBeVisible();
  await expect(page).toHaveURL(/\/scanner\/new$/);
  await expect(guide).not.toContainText('Walkthrough complete');
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!).progress[3])).toBeNull();
  await page.screenshot({path:testInfo.outputPath('onboarding-scan-review.png'),fullPage:false});
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Hosts and IP addresses',exact:true})).toHaveValue('192.0.2.10');
});

for(const width of [1440,320]) for(const category of scenarioCategories) {
  test(`all ${category} walkthrough entries reach a real target at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    for(const scenario of scenarios.filter(item=>item.category===category)) {
      await start(page,scenario.id);
      const guide=guideOf(page);
      if(scenario.id==='contact-support' && width===320) {
        await guide.getByRole('button',{name:'Open support',exact:true}).click();
      }
      await expect(guide,scenario.id).toHaveAttribute('data-target-found','true');
      const bounds=await guide.boundingBox();
      expect(bounds!.x,scenario.id).toBeGreaterThanOrEqual(0);
      expect(bounds!.x+bounds!.width,scenario.id).toBeLessThanOrEqual(width+1);
      expect(bounds!.y+bounds!.height,scenario.id).toBeLessThanOrEqual(845);
      await guide.getByRole('button',{name:'Close scenario guide'}).click();
      await expect(guide).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test('sharing walkthrough opens the real share page and waits for explicitly created link',async({page})=>{
  await start(page,'share-search');
  const guide=guideOf(page);
  await page.locator('#main-search-query').fill('example');
  await page.getByRole('button',{name:'Run search',exact:true}).click();
  await expect(guide).toContainText('Step 2 of 4');
  await guide.getByRole('button',{name:'Open sharing',exact:true}).click();
  await expect(page).toHaveURL(/\/search\/share\?/);
  await expect(guide).toContainText('Step 3 of 4');
  await expect(page.locator('.search-created-link')).toHaveCount(0);
  await page.getByRole('button',{name:'Create search link',exact:true}).click();
  await expect(guide).toContainText('Step 4 of 4');
  await expect(page.locator('.search-created-link input')).toBeVisible();
  await expect(guide).toHaveAttribute('data-target-found','true');
});

test('mobile evidence walkthrough opens service details and switches to the actual TLS panel',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:844});
  await start(page,'inspect-http-tls');
  const guide=guideOf(page);
  await page.locator('#main-search-query').fill('example');
  await page.getByRole('button',{name:'Run search',exact:true}).click();
  await page.locator('.search-result-ip').first().click();
  await expect(guide).toContainText('Step 2 of 4');
  await expect(guide).toHaveAttribute('data-target-found','true');
  expect(new URL(page.url()).searchParams.get('panel')).toBe('details');
  await guide.getByRole('button',{name:'Explore code controls',exact:true}).click();
  await expect(guide).toHaveAttribute('data-target-found','true');
  await guide.getByRole('button',{name:'Open TLS',exact:true}).click();
  await expect(guide).toContainText('Step 4 of 4');
  expect(new URL(page.url()).searchParams.get('view')).toBe('tls');
  expect(new URL(page.url()).searchParams.get('panel')).toBe('details');
  await expect(guide).toHaveAttribute('data-target-found','true');
  await page.screenshot({path:testInfo.outputPath('onboarding-tls-mobile.png'),fullPage:false});
});

test('coach route transitions close inspected task and purchase review through their cancel handlers',async({page})=>{
  await start(page,'monitor-scan');
  let guide=guideOf(page);
  await page.locator('.scanner-target-button').first().click();
  await expect(guide).toContainText('Step 2 of 3');
  await guide.getByRole('button',{name:'Open scheduled tasks',exact:true}).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('tab',{name:/^Scheduled/})).toHaveAttribute('aria-selected','true');
  await expect(guide).toHaveAttribute('data-target-found','true');
  await guide.getByRole('button',{name:'Close scenario guide'}).click();
  await start(page,'buy-credit-pack');
  guide=guideOf(page);
  await guide.getByRole('button',{name:'Choose a credit pack',exact:true}).click();
  await page.getByRole('button',{name:'Buy credits',exact:true}).first().click();
  await expect(guide).toContainText('Step 3 of 4');
  await expect(page.locator('.billing-purchase-summary')).toBeVisible();
  await guide.getByRole('button',{name:'Review current balance',exact:true}).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(guide).toContainText('Step 4 of 4');
  await expect(guide).toHaveAttribute('data-target-found','true');
  await expect(page.locator('.billing-metrics')).toBeVisible();
});
