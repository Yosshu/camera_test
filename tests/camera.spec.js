import { test, expect } from '@playwright/test';
import { recordStreams, liveTracks, failGetUserMedia } from './helpers.js';

test('開始すると映像が表示され、停止するとカメラが解放される', async ({ page }) => {
  await recordStreams(page);
  await page.goto('./');

  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect(page.getByRole('button', { name: 'カメラを停止' })).toBeVisible();
  await expect(page.locator('#status')).toHaveText('表示中');
  await expect.poll(() => page.locator('#video').evaluate((video) => video.videoWidth)).toBeGreaterThan(0);
  expect(await liveTracks(page)).toHaveLength(1);

  await page.getByRole('button', { name: 'カメラを停止' }).click();

  await expect(page.getByRole('button', { name: 'カメラを開始' })).toBeVisible();
  await expect(page.locator('#status')).toHaveText('停止中');
  expect(await liveTracks(page)).toEqual([]);
  expect(await page.locator('#video').evaluate((video) => video.srcObject)).toBeNull();
});

test.describe('カメラの許可がない場合', () => {
  test.use({ permissions: [] });

  test('許可の出し方を案内する', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'カメラを開始' }).click();

    await expect(page.getByRole('alert')).toContainText('カメラの使用が許可されていません');
    await expect(page.getByRole('button', { name: 'カメラを開始' })).toBeEnabled();
  });
});

test('ほかのアプリが使用中のときは、そのことを案内する', async ({ page }) => {
  await failGetUserMedia(page, 'NotReadableError');
  await page.goto('./');
  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect(page.getByRole('alert')).toContainText('カメラを起動できません');
  await expect(page.getByRole('alert')).toContainText('ほかのアプリ');
});

test('カメラ API がないブラウザでは、開始できないことを案内する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
  });
  await page.goto('./');

  await expect(page.getByRole('alert')).toContainText('このブラウザはカメラに対応していません');
  await expect(page.getByRole('button', { name: 'カメラを開始' })).toBeDisabled();
});

test('映像が途切れたら停止状態に戻り、案内を表示する', async ({ page }) => {
  await recordStreams(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(page.locator('#status')).toHaveText('表示中');

  // カメラが取り外されたときと同じく、トラックの ended を発生させる
  await page.evaluate(() => window.__streams[0].getVideoTracks()[0].dispatchEvent(new Event('ended')));

  await expect(page.getByRole('alert')).toContainText('カメラの映像が途切れました');
  await expect(page.getByRole('button', { name: 'カメラを開始' })).toBeVisible();
  expect(await liveTracks(page)).toEqual([]);
});
