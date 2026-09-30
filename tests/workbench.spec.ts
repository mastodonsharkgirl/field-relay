import { expect, test } from '@playwright/test';
test('validates, recovers from an outage, replays safely and exports evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 780 });
  await page.goto('./');
  await page.waitForTimeout(800);
  await expect(page.getByText('LOCAL SIMULATION')).toBeVisible();
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
  await page.waitForTimeout(800);
  await page.getByLabel('Editable CSV fixture').fill('Order ID,Region,Quantity,Amount\n"broken');
  await page.getByRole('button', { name: 'Validate mapping and rows' }).click();
  await expect(page.getByText('Unclosed quoted field')).toBeVisible();
  await page.getByRole('button', { name: 'Reset session' }).click();
  await expect(page.getByLabel('Editable CSV fixture')).toHaveValue('');
});
