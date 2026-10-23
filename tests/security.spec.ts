import { test, expect } from '@playwright/test';

test('preview policy blocks injected inline script and event handler', async ({ page }) => {
  const response = await page.goto('./');
  expect(response?.headers()['content-security-policy']).toContain("form-action 'none'");
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.scriptSentinel = "ran"';
    document.body.append(script);
    const button = document.createElement('button');
    button.id = 'csp-sentinel';
    button.setAttribute('onclick', 'document.documentElement.dataset.handlerSentinel = "ran"');
    document.body.append(button);
  });
  await page.locator('#csp-sentinel').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-script-sentinel', 'ran');
  await expect(page.locator('html')).not.toHaveAttribute('data-handler-sentinel', 'ran');
});
