import { test, expect } from '@playwright/test';
import { recordStreams } from './helpers.js';

const fullscreenElementId = (page) => page.evaluate(() => document.fullscreenElement?.id ?? null);

test.beforeEach(async ({ page }) => {
  await recordStreams(page);
  await page.goto('./');
});

async function startCamera(page) {
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(page.locator('#status')).toContainText('表示中');
}

test('ボタンで映像だけを全画面にし、もう一度押すと戻る', async ({ page }) => {
  const button = page.locator('#fullscreen-button');
  await expect(button).toBeHidden();
  await startCamera(page);

  await page.getByRole('button', { name: '映像だけを全画面表示' }).click();

  await expect.poll(() => fullscreenElementId(page)).toBe('video-frame');
  await expect(page.locator('#video-frame')).toHaveClass(/is-fullscreen/);
  await expect(page.locator('#status')).toBeHidden();

  await page.getByRole('button', { name: '全画面表示を終了' }).click();

  await expect.poll(() => fullscreenElementId(page)).toBeNull();
  await expect(page.locator('#video-frame')).not.toHaveClass(/is-fullscreen/);
  await expect(page.locator('#status')).toBeVisible();
});

test('F キーとダブルクリックでも切り替えられる', async ({ page }) => {
  await startCamera(page);

  await page.keyboard.press('f');
  await expect.poll(() => fullscreenElementId(page)).toBe('video-frame');
  await page.keyboard.press('f');
  await expect.poll(() => fullscreenElementId(page)).toBeNull();

  await page.locator('#video').dblclick();
  await expect.poll(() => fullscreenElementId(page)).toBe('video-frame');
  await page.locator('#video').dblclick();
  await expect.poll(() => fullscreenElementId(page)).toBeNull();
});

test('選択肢の操作中に押した F では切り替えない', async ({ page }) => {
  await startCamera(page);
  await page.getByLabel('解像度').focus();

  await page.keyboard.press('f');

  expect(await fullscreenElementId(page)).toBeNull();
  await expect(page.locator('#video-frame')).not.toHaveClass(/is-fullscreen/);
});

test('映像が出ていないときは F キーでも全画面にしない', async ({ page }) => {
  await page.keyboard.press('f');

  expect(await fullscreenElementId(page)).toBeNull();
  await expect(page.locator('#video-frame')).not.toHaveClass(/is-fullscreen/);
});

test('全画面中はマウスを動かさなければボタンを隠し、動かすと出す', async ({ page }) => {
  await startCamera(page);
  await page.getByRole('button', { name: '映像だけを全画面表示' }).click();
  await expect.poll(() => fullscreenElementId(page)).toBe('video-frame');

  await expect(page.locator('#video-frame')).toHaveClass(/is-idle/, { timeout: 4000 });

  await page.mouse.move(200, 200);
  await page.mouse.move(300, 300);
  await expect(page.locator('#video-frame')).not.toHaveClass(/is-idle/);
});

test('映像が途切れたら全画面を抜けて案内を表示する', async ({ page }) => {
  await startCamera(page);
  await page.getByRole('button', { name: '映像だけを全画面表示' }).click();
  await expect.poll(() => fullscreenElementId(page)).toBe('video-frame');

  await page.evaluate(() => window.__streams[0].getVideoTracks()[0].dispatchEvent(new Event('ended')));

  await expect.poll(() => fullscreenElementId(page)).toBeNull();
  await expect(page.getByRole('alert')).toContainText('カメラの映像が途切れました');
});

test.describe('Fullscreen API がないブラウザ', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
    });
    await page.reload();
  });

  test('映像の枠をページいっぱいに広げ、Esc で戻る', async ({ page }) => {
    await startCamera(page);

    await page.getByRole('button', { name: '映像だけを全画面表示' }).click();

    const frame = page.locator('#video-frame');
    await expect(frame).toHaveClass(/is-expanded/);
    expect(await frame.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize() });
    expect(await fullscreenElementId(page)).toBeNull();

    await page.keyboard.press('Escape');

    await expect(frame).not.toHaveClass(/is-expanded/);
    await expect(frame).not.toHaveClass(/is-fullscreen/);
  });
});
