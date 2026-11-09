import { test, expect } from '@playwright/test';
import { recordStreams, liveTracks, infoCell, simulateRgbdCamera } from './helpers.js';

// simulateRgbdCamera では fake_device_0 が深度、fake_device_1 がカラー

const REALSENSE = 'Intel(R) RealSense(TM) Depth Camera 435i（カラー・深度）';

test('RGB-D カメラは1台にまとめ、既定ではカラーを開く', async ({ page }) => {
  await simulateRgbdCamera(page);
  await recordStreams(page);
  await page.goto('./');

  await expect(page.getByLabel('カメラ', { exact: true }).locator('option')).toHaveText([REALSENSE]);
  const streamSelect = page.getByLabel('映像の種類');
  await expect(streamSelect).toBeVisible();
  await expect(streamSelect.locator('option')).toHaveText(['カラー（RGB）', '深度（Depth）']);
  await expect(streamSelect.locator('option:checked')).toHaveText('カラー（RGB）');

  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect.poll(() => liveTracks(page)).toEqual(['fake_device_1']);
  await expect(infoCell(page, '映像の種類')).toHaveText('カラー（RGB）');
});

test('許可前にブラウザが深度を開いても、カラーに切り替える', async ({ page }) => {
  await simulateRgbdCamera(page, { hideUntilStarted: true });
  await recordStreams(page);
  await page.goto('./');
  await expect(page.getByLabel('映像の種類')).toBeHidden();

  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect.poll(() => liveTracks(page)).toEqual(['fake_device_1']);
  await expect(page.getByLabel('映像の種類').locator('option:checked')).toHaveText('カラー（RGB）');
  await expect(page.locator('#status')).toContainText('表示中');
});

test('深度を選ぶと切り替わり、次回も深度で開く', async ({ page }) => {
  await simulateRgbdCamera(page);
  await recordStreams(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect.poll(() => liveTracks(page)).toEqual(['fake_device_1']);

  await page.getByLabel('映像の種類').selectOption({ label: '深度（Depth）' });

  await expect.poll(() => liveTracks(page)).toEqual(['fake_device_0']);
  await expect(infoCell(page, '映像の種類')).toContainText('深度（Depth）');
  await expect(infoCell(page, '映像の種類')).toContainText('距離を明るさで表した映像です');

  await page.reload();
  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect.poll(() => liveTracks(page)).toEqual(['fake_device_0']);
});

test('前回開いた深度の記憶が残っていても、自分で選んでいなければカラーで開く', async ({ page }) => {
  await simulateRgbdCamera(page);
  await recordStreams(page);
  await page.goto('./');

  // 以前の版は、ブラウザが開いた深度の ID をそのまま保存していた
  await page.evaluate(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const depth = devices.find((device) => device.label.endsWith(' Depth'));
    localStorage.setItem('camera_test:settings', JSON.stringify({ deviceId: depth.deviceId }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect.poll(() => liveTracks(page)).toEqual(['fake_device_1']);
});

test('RGB-D でないカメラでは、映像の種類を表示しない', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(page.locator('#status')).toContainText('表示中');

  await expect(page.getByLabel('映像の種類')).toBeHidden();
  await expect(infoCell(page, '映像の種類')).toHaveCount(0);
});

test('カメラの名前から種類を判断し、同じカメラの種類違いだけをまとめる', async ({ page }) => {
  await page.goto('./');
  const results = await page.evaluate(async () => {
    const { classifyCamera, groupCameras, pickStream } = await import('./js/devices.js');
    const camera = (deviceId, label) => ({ deviceId, label });
    const realsense = groupCameras([
      camera('d', 'Intel(R) RealSense(TM) Depth Camera 435i Depth'),
      camera('c', 'Intel(R) RealSense(TM) Depth Camera 435i RGB'),
    ])[0];
    const summarize = (groups) => groups.map((group) => [group.name, group.streams.map((stream) => stream.deviceId)]);
    return {
      rgb: classifyCamera('Intel(R) RealSense(TM) Depth Camera 435i RGB'),
      linuxDepth: classifyCamera('Intel(R) RealSense(TM) Depth Camera 435i Depth (8086:0b3a)'),
      productNameOnly: classifyCamera('Intel(R) RealSense(TM) Depth Camera 435i'),
      infrared: classifyCamera('Some Camera IR').kind,
      webcam: classifyCamera('HD Webcam').kind,
      realsense: summarize([realsense]),
      defaultStream: pickStream(realsense).deviceId,
      depthStream: pickStream(realsense, 'depth').deviceId,
      missingKind: pickStream(realsense, 'infrared').deviceId,
      sameWebcams: summarize(groupCameras([camera('a', 'USB Camera'), camera('b', 'USB Camera')])),
      twoRealsenses: summarize(groupCameras([
        camera('d1', 'Intel(R) RealSense(TM) Depth Camera 435i Depth'),
        camera('c1', 'Intel(R) RealSense(TM) Depth Camera 435i RGB'),
        camera('d2', 'Intel(R) RealSense(TM) Depth Camera 435i Depth'),
        camera('c2', 'Intel(R) RealSense(TM) Depth Camera 435i RGB'),
      ])),
    };
  });

  expect(results).toEqual({
    rgb: { baseName: 'Intel(R) RealSense(TM) Depth Camera 435i', kind: 'color' },
    linuxDepth: { baseName: 'Intel(R) RealSense(TM) Depth Camera 435i', kind: 'depth' },
    productNameOnly: { baseName: 'Intel(R) RealSense(TM) Depth Camera 435i', kind: null },
    infrared: 'infrared',
    webcam: null,
    realsense: [['Intel(R) RealSense(TM) Depth Camera 435i（カラー・深度）', ['c', 'd']]],
    defaultStream: 'c',
    depthStream: 'd',
    missingKind: 'c',
    sameWebcams: [['USB Camera', ['a']], ['USB Camera', ['b']]],
    // 同じ型番が2台あるときは、1台目だけまとめ、残りは別々に出す
    twoRealsenses: [
      ['Intel(R) RealSense(TM) Depth Camera 435i（カラー・深度）', ['c1', 'd1']],
      ['Intel(R) RealSense(TM) Depth Camera 435i Depth', ['d2']],
      ['Intel(R) RealSense(TM) Depth Camera 435i RGB', ['c2']],
    ],
  });
});
