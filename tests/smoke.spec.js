import { test, expect } from '@playwright/test';

test('ページが開き、CSS と JS が相対パスで読み込める', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');

  await expect(page).toHaveTitle('カメラテスト');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('カメラテスト');
  await expect(page.locator('body')).toHaveAttribute('data-app', 'ready');
  // style.css が効いていれば body の余白は 0 になる
  await expect(page.locator('body')).toHaveCSS('margin', '0px');
  expect(errors).toEqual([]);
});
