import { expect, test } from '@playwright/test';

test('changing motion preference preserves the active review and stops movement', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('astro-island:not([ssr])').waitFor();
  await expect(page.getByRole('region', { name: 'Reconciliation findings' })).toBeVisible();
  await page.getByRole('button', { name: 'Changed', exact: true }).click();
  await page.getByRole('button', { name: /Changed 00009/ }).click();
  await page.getByLabel('Your decision').selectOption('hold');
  await page.getByLabel('Reason or next step').fill('Check the original supplier message.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
  await expect(page.getByLabel('Reason or next step')).toHaveValue(
    'Check the original supplier message.',
  );
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('Hold saved. This item remains unresolved.')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.getByLabel('Reason or next step')).toHaveValue(
    'Check the original supplier message.',
  );
});
