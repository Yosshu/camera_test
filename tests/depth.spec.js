import { test, expect } from '@playwright/test';
import { recordStreams, simulateRgbdCamera } from './helpers.js';

// simulateRgbdCamera では fake_device_0 が深度、fake_device_1 がカラー

async function openDepth(page) {
  await simulateRgbdCamera(page);
  await recordStreams(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(page.locator('#status')).toContainText('表示中');
  await page.getByLabel('映像の種類').selectOption({ label: '深度（Depth）' });
  await expect(page.locator('#status')).toContainText('表示中');
}

test('深度は色付けして表示し、凡例と深度の設定を出す', async ({ page }) => {
  await openDepth(page);

  const frame = page.locator('#video-frame');
  await expect(frame).toHaveClass(/is-depth-color/);
  await expect(page.locator('#depth-canvas')).toBeVisible();
  await expect(page.locator('#depth-canvas')).toHaveAttribute('data-renderer', 'webgl');
  await expect(page.locator('#video')).toBeHidden();
  await expect(page.locator('#depth-legend')).toBeVisible();
  await expect(page.locator('#depth-legend-note')).toContainText('自動');
  await expect(page.getByLabel('深度の表示')).toBeVisible();
  await expect(page.getByLabel('色を割り当てる距離')).toBeVisible();
  // 映像と同じ大きさで描いている
  await expect.poll(() => page.locator('#depth-canvas').evaluate((canvas) => `${canvas.width}x${canvas.height}`))
    .toBe(await page.locator('#video').evaluate((video) => `${video.videoWidth}x${video.videoHeight}`));
});

test('「そのまま（濃淡）」で元の映像に戻し、選んだ表示を覚えておく', async ({ page }) => {
  await openDepth(page);

  await page.getByLabel('深度の表示').selectOption({ label: 'そのまま（濃淡）' });

  await expect(page.locator('#video-frame')).not.toHaveClass(/is-depth-color/);
  await expect(page.locator('#video')).toBeVisible();
  await expect(page.locator('#depth-canvas')).toBeHidden();
  await expect(page.getByLabel('色を割り当てる距離')).toBeHidden();

  await page.reload();
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(page.locator('#status')).toContainText('表示中');
  await expect(page.getByLabel('深度の表示')).toHaveValue('raw');
  await expect(page.locator('#video-frame')).not.toHaveClass(/is-depth-color/);
});

test('固定の距離を選ぶと、凡例もその範囲になる', async ({ page }) => {
  await openDepth(page);

  await page.getByLabel('色を割り当てる距離').selectOption({ label: '0.3〜1.5 m（近距離）' });

  await expect(page.locator('#depth-legend-near')).toHaveText('0.30 m');
  await expect(page.locator('#depth-legend-far')).toHaveText('1.50 m');
  await expect(page.locator('#depth-legend-note')).toContainText('固定');
});

test('カラーに戻すと、深度の設定と色付けをやめる', async ({ page }) => {
  await openDepth(page);
  await expect(page.locator('#video-frame')).toHaveClass(/is-depth-color/);

  await page.getByLabel('映像の種類').selectOption({ label: 'カラー（RGB）' });

  await expect(page.locator('#video-frame')).not.toHaveClass(/is-depth-color/);
  await expect(page.getByLabel('深度の表示')).toBeHidden();
  await expect(page.locator('#video')).toBeVisible();
});

test('WebGL2 がないブラウザでも色付けして表示する', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...rest);
    };
  });
  await openDepth(page);

  await expect(page.locator('#depth-canvas')).toHaveAttribute('data-renderer', 'canvas');
  await expect(page.locator('#depth-legend-near')).not.toHaveText('—');
});

test('映像から深度の値を上下の向きどおりに取り出し、Jet で色付けする', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { colorizeDepth, findDepthRange } = await import('./js/depth-view.js');
    // 上半分が 64、下半分が 192 の濃淡の映像を作る（8 bit の値 v は深度 v×257 として読める）
    const source = document.createElement('canvas');
    Object.assign(source, { width: 8, height: 4 });
    const context = source.getContext('2d');
    context.fillStyle = 'rgb(64 64 64)';
    context.fillRect(0, 0, 8, 2);
    context.fillStyle = 'rgb(192 192 192)';
    context.fillRect(0, 2, 8, 2);
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = source.captureStream(30);
    // 新しいフレームの通知（requestVideoFrameCallback）は、ページ内の映像でしか届かない
    document.body.append(video);
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // DepthView と同じ読み取りを、表示用の canvas に描いて確かめる
    const { DepthView } = await import('./js/depth-view.js');
    const canvas = document.createElement('canvas');
    const legend = { near: document.createElement('span'), far: document.createElement('span'), note: document.createElement('span') };
    const view = new DepthView(video, canvas, legend);
    view.range = '0-6000';
    view.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    view.stop();
    const pixels = canvas.getContext('2d').getImageData(0, 0, 8, 4).data;
    const pixel = (x, y) => Array.from(pixels.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 3));

    const depths = new Uint16Array([0, 1000, 1000, 2000, 3000]);
    const rgba = new Uint8ClampedArray(depths.length * 4);
    const equalized = colorizeDepth(depths, rgba, findDepthRange('auto'));
    const fixed = new Uint8ClampedArray(depths.length * 4);
    colorizeDepth(new Uint16Array([0, 300, 900, 1500, 2000]), fixed, findDepthRange('300-1500'));
    const rgb = (array, i) => Array.from(array.slice(i * 4, i * 4 + 3));

    return {
      renderer: view.renderer,
      // 64×257 ≈ 16.4 m は 0〜6 m の範囲外なので最も遠い色、192 も同じ。上下で同じ色になる
      top: pixel(0, 0),
      bottom: pixel(0, 3),
      equalized: [0, 1, 3, 4].map((i) => rgb(rgba, i)),
      equalizedRange: [equalized.near, equalized.far],
      fixed: [0, 1, 2, 3, 4].map((i) => rgb(fixed, i)),
    };
  });

  expect(result.renderer).toBe('webgl');
  expect(result.top).toEqual([50, 0, 0]);
  expect(result.bottom).toEqual([50, 0, 0]);
  // 値 0 は黒。均等化では 1000 mm が半分の位置（黄）、2000 mm が 3/4 の位置（赤）、最も遠い 3000 mm が暗い赤
  expect(result.equalized).toEqual([[0, 0, 0], [255, 255, 0], [255, 0, 0], [50, 0, 0]]);
  expect(result.equalizedRange).toEqual([1000, 3000]);
  // 固定の範囲：近い端が青、中央が黄、遠い端と範囲外が暗い赤
  expect(result.fixed).toEqual([[0, 0, 0], [0, 0, 255], [255, 255, 0], [50, 0, 0], [50, 0, 0]]);
});

test('映像から取り出した深度の値が正しい', async ({ page }) => {
  await page.goto('./');
  const depths = await page.evaluate(async () => {
    const source = document.createElement('canvas');
    Object.assign(source, { width: 4, height: 4 });
    const context = source.getContext('2d');
    context.fillStyle = 'rgb(10 10 10)';
    context.fillRect(0, 0, 4, 2);
    context.fillStyle = 'rgb(20 20 20)';
    context.fillRect(0, 2, 4, 2);
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = source.captureStream(30);
    // 新しいフレームの通知（requestVideoFrameCallback）は、ページ内の映像でしか届かない
    document.body.append(video);
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const { DepthView } = await import('./js/depth-view.js');
    const canvas = document.createElement('canvas');
    const legend = { near: document.createElement('span'), far: document.createElement('span'), note: document.createElement('span') };
    const view = new DepthView(video, canvas, legend);
    view.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    view.stop();
    return [legend.near.textContent, legend.far.textContent];
  });

  // 10×257 = 2570 mm、20×257 = 5140 mm（自動の凡例は、写っている距離の範囲を示す）
  expect(depths).toEqual(['2.57 m', '5.14 m']);
});
