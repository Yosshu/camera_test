import { test, expect } from '@playwright/test';
import { recordStreams, liveTracks, liveTrackSettings, infoCell } from './helpers.js';

// ダミーカメラは最大 3840×2160・20fps、既定では 640×480 で動く

test.beforeEach(async ({ page }) => {
  await recordStreams(page);
  await page.goto('./');
});

test('選んだ解像度で開き、要求と実際の値を並べて表示する', async ({ page }) => {
  await page.getByLabel('解像度').selectOption('1280x720');
  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect(infoCell(page, '解像度')).toContainText('1280×720');
  await expect(infoCell(page, '解像度')).toContainText('要求: 1280×720');
  await expect(infoCell(page, '解像度').locator('.badge')).toHaveCount(0);
  await expect(infoCell(page, 'アスペクト比')).toHaveText('16:9（1.778）');
  await expect(page.locator('#status')).toHaveText('表示中 · 1280×720 · 20 fps');
  expect(await liveTrackSettings(page)).toMatchObject({ width: 1280, height: 720 });
});

test('表示中に解像度を変えると、その条件で開き直す', async ({ page }) => {
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(infoCell(page, '解像度')).toContainText('要求: 自動');

  await page.getByLabel('解像度').selectOption('1920x1080');

  await expect(infoCell(page, '解像度')).toContainText('1920×1080');
  await expect(infoCell(page, '受信中の映像サイズ')).toHaveText('1920×1080');
  expect(await liveTracks(page)).toHaveLength(1);
});

test('カメラの上限を超える選択肢に印を付け、要求と異なれば知らせる', async ({ page }) => {
  const frameRate = page.getByLabel('フレームレート');
  await frameRate.selectOption('30');
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(page.locator('#status')).toContainText('表示中');

  await expect(frameRate.locator('option')).toHaveText([
    '自動（ブラウザに任せる）', '15 fps', '24 fps（上限超え）', '30 fps（上限超え）', '60 fps（上限超え）',
  ]);
  await expect(page.getByLabel('解像度').locator('option', { hasText: '上限超え' })).toHaveCount(0);
  await expect(infoCell(page, 'フレームレート')).toContainText('20 fps');
  await expect(infoCell(page, 'フレームレート').locator('.badge')).toHaveText('要求と異なる');
  await expect(infoCell(page, '対応フレームレート')).toHaveText('0 〜 20 fps');
});

test('縮小・切り抜きをしない指定で開ける', async ({ page }) => {
  await page.getByLabel('ブラウザによる縮小・切り抜きをしない').check();
  await page.getByLabel('解像度').selectOption('1280x720');
  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect(infoCell(page, '縮小・切り抜き')).toHaveText('しない（カメラ本来の解像度）');
  expect(await liveTrackSettings(page)).toMatchObject({ resizeMode: 'none' });
  await page.getByText('詳細データ（getSettings / getCapabilities）').click();
  await expect(page.locator('#raw-data')).toContainText('"resizeMode": {');
});

test('選んだ解像度・フレームレートを次回も使う', async ({ page }) => {
  await page.getByLabel('解像度').selectOption('640x480');
  await page.getByLabel('フレームレート').selectOption('15');
  await page.getByLabel('ブラウザによる縮小・切り抜きをしない').check();

  await page.reload();

  await expect(page.getByLabel('解像度')).toHaveValue('640x480');
  await expect(page.getByLabel('フレームレート')).toHaveValue('15');
  await expect(page.getByLabel('ブラウザによる縮小・切り抜きをしない')).toBeChecked();
});

test('停止中は情報の代わりに案内を表示する', async ({ page }) => {
  await expect(page.locator('#info-table')).toHaveText('カメラを開始すると表示されます。');

  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(infoCell(page, 'カメラ')).not.toHaveText('');
  await page.getByRole('button', { name: 'カメラを停止' }).click();

  await expect(page.locator('#info-table')).toHaveText('カメラを開始すると表示されます。');
});

test('表示用の計算が正しい', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const info = await import('./js/info.js');
    const constraints = await import('./js/constraints.js');
    const caps = { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } };
    return {
      ratio43: info.formatAspectRatio(640, 480),
      ratioOdd: info.formatAspectRatio(1366, 768),
      portraitSame: info.sameResolution({ width: 1280, height: 720 }, { width: 720, height: 1280 }),
      different: info.sameResolution({ width: 1920, height: 1080 }, { width: 1280, height: 720 }),
      fpsClose: info.sameFrameRate(30, 30.000030517578125),
      exceeds4k: constraints.exceedsResolution({ width: 3840, height: 2160 }, caps),
      fitsPortrait: constraints.exceedsResolution({ width: 1080, height: 1920 }, caps),
      exceeds60: constraints.exceedsFrameRate({ fps: 60 }, caps),
      unknownCaps: constraints.exceedsResolution({ width: 3840, height: 2160 }, null),
    };
  });

  expect(results).toEqual({
    ratio43: '4:3（1.333）',
    ratioOdd: '1.779',
    portraitSame: true,
    different: false,
    fpsClose: true,
    exceeds4k: true,
    fitsPortrait: false,
    exceeds60: true,
    unknownCaps: false,
  });
});
