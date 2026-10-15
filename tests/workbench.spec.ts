import { expect, test, type Page } from '@playwright/test';

const openDeliveryLab = async (page: Page) => {
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'Delivery simulator lab' }).click();
};
test('validates, recovers from an outage, replays safely and exports evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 780 });
  await page.goto('./');
  await openDeliveryLab(page);
  await page.waitForTimeout(800);
  await expect(page.getByText('LOCAL SIMULATION')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Decision queue' })).toBeVisible();
  await page.getByRole('button', { name: '01 Intake' }).click();
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await page.getByLabel('Inject endpoint outage').check();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(page.getByText('failed · attempt 1').first()).toBeVisible();
  await page.getByLabel('Inject endpoint outage').uncheck();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(page.getByText('delivered · attempt 2').first()).toBeVisible();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(page.getByText('Already delivered; replay is idempotent.').first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence JSON' }).click();
  await expect(download).resolves.toBeTruthy();
  await expect(page.getByRole('button', { name: 'Deliver / retry ready records' })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByRole('heading', { name: 'Decision queue' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
test('renders malformed input as a local error and reset clears it', async ({ page }) => {
  await page.goto('./');
  await openDeliveryLab(page);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '01 Intake' }).click();
  await page.getByLabel('Editable CSV fixture').fill('Order ID,Region,Quantity,Amount\n"broken');
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await expect(page.getByText('Unclosed quoted field')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Unclosed quoted field');
  await page.getByRole('button', { name: 'Reset session' }).click();
  await expect(page.getByLabel('Editable CSV fixture')).toHaveValue('');
});

test('filters a queue, inspects held source, and invalidates approval after a changed draft', async ({
  page,
}) => {
  await page.goto('./');
  await openDeliveryLab(page);
  await expect(page.getByRole('heading', { name: 'Decision queue' })).toBeVisible();
  await page.locator('.metric').filter({ hasText: 'held' }).click();
  await expect(page.getByText('CONFLICT').first()).toBeVisible();
  await page.getByText('Inspect source').first().click();
  await expect(page.getByText('Held means this row cannot enter delivery.')).toBeVisible();
  await page.getByRole('button', { name: '03 Review queue' }).click();
  await page.getByRole('button', { name: 'all' }).click();
  await page.getByText('N-500').click();
  await page.getByRole('button', { name: 'Approve record' }).click();
  await expect(page.getByRole('heading', { name: 'Decision queue' })).toBeFocused();
  await page.getByRole('button', { name: '01 Intake' }).click();
  await page
    .getByLabel('Editable CSV fixture')
    .fill('Order ID,Region,Quantity,Amount\nX-1,North,1,1.00');
  await expect(page.getByText('Draft or mapping changed.')).toBeVisible();
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await expect(page.getByText('needs approval').locator('..')).toContainText('0');
});

test('marks mapping edits as invalid or changed and blocks delivery until explicit revalidation', async ({
  page,
}) => {
  await page.goto('./');
  await openDeliveryLab(page);
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: '02 Map fields' }).click();
  await page.getByLabel('Business order ID').fill('Order ID revised');
  await expect(page.getByText('mapping invalid')).toBeVisible();
  await expect(page.getByText('Missing mapped columns: Order ID revised')).toBeVisible();
  await page.getByRole('button', { name: '03 Review queue' }).click();
  await expect(page.getByRole('button', { name: 'Deliver / retry ready records' })).toBeDisabled();
  await page.getByRole('button', { name: '02 Map fields' }).click();
  await page.getByLabel('Business order ID').fill('Quantity');
  await page.getByLabel('Quantity column').fill('Order ID');
  await expect(page.getByText('mapping changed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await expect(page.getByRole('heading', { name: 'Decision queue' })).toBeVisible();
});

test('keeps a successful delivery replay-safe through unchanged validation and an edit reverted to the same CSV', async ({
  page,
}) => {
  await page.goto('./');
  await openDeliveryLab(page);
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(page.getByText('delivered · attempt 1')).toHaveCount(2);

  await page.getByRole('button', { name: '01 Intake' }).click();
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(page.getByText('Already delivered; replay is idempotent.')).toHaveCount(2);
  await expect(page.getByText('delivered · attempt 1')).toHaveCount(2);

  await page.getByRole('button', { name: '01 Intake' }).click();
  const source = page.getByLabel('Editable CSV fixture');
  const original = await source.inputValue();
  await source.fill(`${original}\n`);
  await source.fill(original);
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(page.getByText('Already delivered; replay is idempotent.')).toHaveCount(4);
  await expect(page.getByText('delivered · attempt 1')).toHaveCount(2);
});

test('clears manual approval when a draft changes without clearing its delivery session', async ({
  page,
}) => {
  await page.goto('./');
  await openDeliveryLab(page);
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'review', exact: true }).click();
  await page.getByText('N-500').click();
  await page.getByRole('button', { name: 'Approve record' }).click();
  await expect(page.getByRole('button', { name: /ready to deliver/ })).toContainText('3');

  await page.getByRole('button', { name: '01 Intake' }).click();
  const source = page.getByLabel('Editable CSV fixture');
  await source.fill(`${await source.inputValue()}\n`);
  await page.getByRole('button', { name: '03 Review queue' }).click();
  await expect(page.getByRole('button', { name: /needs approval/ })).toContainText('2');
  await expect(page.getByRole('button', { name: /ready to deliver/ })).toContainText('2');
});

test('holds a changed payload after a successful local delivery', async ({ page }) => {
  await page.goto('./');
  await openDeliveryLab(page);
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await page.getByRole('button', { name: '01 Intake' }).click();
  const source = page.getByLabel('Editable CSV fixture');
  await source.fill(
    (await source.inputValue()).replace('N-700,South,2,27.25', 'N-700,South,3,27.25'),
  );
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(
    page.getByText('Payload changed after success; held for investigation.'),
  ).toBeVisible();
});

test('holds a changed payload after a failed local delivery', async ({ page }) => {
  await page.goto('./');
  await openDeliveryLab(page);
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByLabel('Inject endpoint outage').check();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(page.getByText('failed · attempt 1')).toHaveCount(2);
  await page.getByRole('button', { name: '01 Intake' }).click();
  const source = page.getByLabel('Editable CSV fixture');
  await source.fill(
    (await source.inputValue()).replace('N-700,South,2,27.25', 'N-700,South,3,27.25'),
  );
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await page.getByLabel('Inject endpoint outage').uncheck();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(
    page.getByText('Payload changed after a failed attempt; held for investigation.'),
  ).toBeVisible();
});

test('keeps 320px enlarged text in bounds and presents only the static fallback without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const enlargedContext = await browser.newContext({ viewport: { width: 320, height: 844 } });
  const enlarged = await enlargedContext.newPage();
  await enlarged.goto(baseURL!);
  await enlarged.locator('astro-island:not([ssr])').waitFor();
  await enlarged.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect.poll(() => enlarged.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await enlargedContext.close();

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJs.newPage();
  const response = await staticPage.goto(baseURL!);
  const html = await response?.text();
  expect(html).toContain('JavaScript is needed to compare two mapped CSV exports');
  expect(html).toMatch(/astro-island\s*\{\s*display: none !important;/);
  await noJs.close();
});

test('puts a readable findings row in the opening viewport on desktop and phone', async ({
  browser,
  baseURL,
}) => {
  for (const [width, height, maximumTop] of [
    [1440, 900, 600],
    [390, 844, 700],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(baseURL!);
    await page.locator('astro-island:not([ssr])').waitFor();
    const firstFinding = page.locator('.finding-list .finding-row').first();
    await expect(firstFinding).toBeVisible();
    const box = await firstFinding.boundingBox();
    expect(box?.y).toBeLessThan(maximumTop);
    expect(
      await firstFinding
        .locator('strong')
        .evaluate((element) =>
          Number.parseFloat(document.defaultView!.getComputedStyle(element).fontSize),
        ),
    ).toBeGreaterThanOrEqual(13);
    await context.close();
  }
});

test('keeps mapped setup and results in bounds at enlarged text and gives phone filters usable targets', async ({
  browser,
  baseURL,
}) => {
  for (const width of [1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseURL!);
    await page.locator('astro-island:not([ssr])').waitFor();
    await expect(page.locator('.mobile-filter-control')).toBeHidden();
    await expect(page.locator('.finding-controls .filter-bar')).toBeVisible();
    await page.getByRole('button', { name: 'Change inputs and mapping' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await context.close();
  }
  for (const width of [390, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    await page.goto(baseURL!);
    await page.locator('astro-island:not([ssr])').waitFor();
    if (width === 390) {
      await expect(page.locator('.mobile-filter-control')).toBeVisible();
      await expect(page.locator('.finding-controls .filter-bar')).toBeHidden();
    } else {
      await expect(page.locator('.mobile-filter-control')).toBeHidden();
      await expect(page.locator('.finding-controls .filter-bar')).toBeVisible();
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 390) {
      const filter = page.getByLabel('Filter findings');
      expect((await filter.boundingBox())?.height).toBeGreaterThanOrEqual(24);
    }
    await context.close();
  }
});

test('keeps crafted collision findings, browser decisions, and downloaded reports independent', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'Use your files' }).click();
  await page
    .getByLabel('Read Baseline export file')
    .setInputFiles('tests/fixtures/collision-baseline.csv');
  await page
    .getByLabel('Read Candidate export file')
    .setInputFiles('tests/fixtures/collision-candidate.csv');
  await page.getByLabel('Baseline business ID').selectOption('id');
  await page.getByLabel('Candidate business ID').selectOption('id');
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Comparison label 1').fill('Value');
  await page.getByLabel('Baseline comparison column 1').selectOption('value');
  await page.getByLabel('Candidate comparison column 1').selectOption('value');
  await page.getByText('A2c7j', { exact: true }).click();
  await page.getByLabel('Reviewer disposition').selectOption('hold');
  await page.getByLabel('Reason or next step').fill('A only');
  await page.getByRole('button', { name: 'Save review' }).click();
  await page.getByText('B11x7', { exact: true }).click();
  await page.getByLabel('Reviewer disposition').selectOption('ignore');
  await page.getByLabel('Reason or next step').fill('B only');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('held — reviewed')).toHaveCount(1);
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download review pack' }).click();
  const json = await jsonDownload;
  expect(json.suggestedFilename()).toBe('field-relay-reconciliation-review.json');
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download findings CSV' }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toBe('field-relay-findings.csv');
});

test('blocks stale simulator evidence export and focuses stacked detail at tablet width', async ({
  page,
}) => {
  await page.goto('./');
  await openDeliveryLab(page);
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await page.getByRole('button', { name: '01 Intake' }).click();
  const source = page.getByLabel('Editable CSV fixture');
  await source.fill(
    (await source.inputValue()).replace('N-700,South,2,27.25', 'N-700,South,3,27.25'),
  );
  await page.getByRole('button', { name: '04 Deliver / retry' }).click();
  await expect(page.getByRole('button', { name: 'Export evidence JSON' })).toBeDisabled();
  await expect(
    page.getByText('Validate the revised draft before exporting evidence.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Reconcile exports' }).click();
  await page.setViewportSize({ width: 768, height: 900 });
  await page.getByRole('button', { name: 'Changed', exact: true }).click();
  await page.getByRole('button', { name: /Changed 00009/ }).click();
  await expect(page.getByRole('heading', { name: '00009' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Back to findings' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to findings' }).click();
  await expect(page.getByRole('heading', { name: 'Findings' })).toBeFocused();
});

test('reconciles two exports, records a revision-bound review, and exports local evidence', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await expect(page.getByRole('heading', { name: 'Find what changed.' })).toBeVisible();
  await expect(page.getByText('Baseline data records')).toBeVisible();
  await page.getByRole('button', { name: 'Changed', exact: true }).click();
  await page.getByText('00009', { exact: true }).click();
  await expect(page.getByText('SIDE-BY-SIDE EVIDENCE')).toBeVisible();
  await page.getByLabel('Reviewer disposition').selectOption('accept-candidate');
  await page.getByLabel('Reason or next step').fill('Confirmed against the candidate handoff.');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('Saved for this exact comparison revision.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download review pack' }).click();
  await expect(download).resolves.toBeTruthy();
  await page.getByRole('button', { name: 'Change inputs and mapping' }).click();
  await page.getByLabel('Comparison label 1').fill('SKU and item');
  await expect(page.getByRole('heading', { name: 'Select a finding.' })).toBeVisible();
});

test('requires an explicit choice before exporting an unsaved review and disables impossible candidate acceptance', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'Changed', exact: true }).click();
  await page.getByText('00009', { exact: true }).click();
  await page.getByLabel('Reviewer disposition').selectOption('accept-candidate');
  await page.getByLabel('Reason or next step').fill('Prepared but not saved.');
  await page.getByRole('button', { name: 'Download review pack' }).click();
  const prompt = page.getByRole('dialog', { name: 'Unsaved review before download' });
  await expect(prompt).toContainText('1 unsaved review will be omitted.');
  await expect(prompt.getByText('00009', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unsaved review before download' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(prompt).toBeHidden();
  await expect(page.getByRole('button', { name: 'Download review pack' })).toBeFocused();

  await page.getByRole('button', { name: 'Download review pack' }).click();
  await prompt.getByRole('button', { name: 'Discard unsaved reviews' }).click();
  await expect(prompt).toBeHidden();

  await page.getByRole('button', { name: 'Missing from candidate', exact: true }).click();
  await page.getByText('00005', { exact: true }).click();
  await expect(
    page.getByLabel('Reviewer disposition').locator('option[value="accept-candidate"]'),
  ).toHaveAttribute('disabled', '');
});

test('blocks a malformed replacement instead of retaining an old clean comparison', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await expect(page.getByText('Findings to review')).toBeVisible();
  await page.getByRole('button', { name: 'Change inputs and mapping' }).click();
  await page.getByLabel('Read Candidate export file').setInputFiles('tests/fixtures/broken.csv');
  await expect(page.getByRole('alert')).toContainText('Unclosed quoted field');
  await expect(page.getByText('Comparison is blocked.')).toBeVisible();
});

test('keeps reconciliation and delivery-lab sessions intact when switching modes', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'Change inputs and mapping' }).click();
  const baseline = page.getByLabel('Paste CSV').first();
  const original = await baseline.inputValue();
  await baseline.fill(`${original}\n`);
  await page.getByRole('button', { name: 'Delivery simulator lab' }).click();
  await page.getByRole('button', { name: 'Deliver / retry ready records' }).click();
  await expect(page.getByText('delivered · attempt 1')).toHaveCount(2);
  await page.getByRole('button', { name: 'Reconcile exports' }).click();
  await expect(baseline).toHaveValue(`${original}\n`);
  await page.getByRole('button', { name: 'Delivery simulator lab' }).click();
  await expect(page.getByText('delivered · attempt 1')).toHaveCount(2);
});

test('keeps focus while typing an explicit comparison label', async ({ page }) => {
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'Change inputs and mapping' }).click();
  const label = page.getByLabel('Comparison label 1');
  await label.click();
  await label.pressSequentially(' XYZ');
  await expect(label).toHaveValue('SKU / item XYZ');
  await expect(label).toBeFocused();
});

test('saves a duplicate-ID hold as reviewed but keeps it unresolved', async ({ page }) => {
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await page.getByRole('button', { name: 'Duplicate IDs', exact: true }).click();
  await page.getByText('00017', { exact: true }).click();
  await page.getByLabel('Reviewer disposition').selectOption('hold');
  await page.getByLabel('Reason or next step').fill('Ask the source owner which row is current.');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('Hold saved. This item remains unresolved.')).toBeVisible();
  await expect(page.getByText('held — reviewed')).toBeVisible();
});

test('labels fictional versus local inputs and opens mobile finding detail with labeled source cells', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await expect(page.getByText('Fictional example data loaded')).toBeVisible();
  await page.getByLabel('Filter findings').selectOption('changed');
  const finding = page.getByRole('button', { name: /Changed 00009/ });
  await finding.focus();
  await finding.press('Enter');
  await expect(page.getByRole('heading', { name: '00009' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Back to findings' })).toBeVisible();
  await expect(page.getByText('Units ordered', { exact: true })).toBeVisible();
  await expect(page.getByText('Units shipped', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to findings' }).click();
  await expect(page.getByRole('heading', { name: 'Findings' })).toBeFocused();
  await page.getByRole('button', { name: 'Use your files' }).click();
  await expect(page.getByText('Local data in this tab').first()).toBeVisible();
});
