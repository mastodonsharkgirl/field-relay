import { expect, test } from '@playwright/test';

test('interview walkthrough is reachable and returns to the working fictional example', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Interview walkthrough' }).click();
  await expect(page).toHaveURL(/\/walkthrough\/?$/);
  await expect(
    page.getByRole('heading', { name: 'Walk through Field Relay in five minutes.' }),
  ).toBeVisible();
  await expect(page.getByText('Saved results from the server test', { exact: true })).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole('link', { name: 'Compare the sheets', exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Compare the sheets', exact: true }).click();
  await page
    .getByRole('button', { name: /Reload fictional example|Try a fictional order handoff/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Findings', exact: true })).toBeVisible();
});
