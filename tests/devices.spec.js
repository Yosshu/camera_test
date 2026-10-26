import { test, expect } from '@playwright/test';
import { recordStreams, liveTracks } from './helpers.js';

test('開始後にカメラの一覧が表示され、切り替えると前のカメラは止まる', async ({ page }) => {
  await recordStreams(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect(page.locator('#status')).toHaveText('表示中');

  const select = page.getByLabel('カメラ', { exact: true });
  await expect(select.locator('option')).toHaveText(['fake_device_0', 'fake_device_1']);
  await expect(select).toBeEnabled();
  const [firstLabel] = await liveTracks(page);
  await expect(select.locator('option:checked')).toHaveText(firstLabel);

  const otherLabel = firstLabel === 'fake_device_0' ? 'fake_device_1' : 'fake_device_0';
  await select.selectOption({ label: otherLabel });

  await expect.poll(() => liveTracks(page)).toEqual([otherLabel]);
  await expect(page.locator('#status')).toHaveText('表示中');
});

test('選んだカメラを覚えておき、次に開いたときも使う', async ({ page }) => {
  await recordStreams(page);
  await page.goto('./');
  await page.getByLabel('カメラ', { exact: true }).selectOption({ label: 'fake_device_1' });
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await expect.poll(() => liveTracks(page)).toEqual(['fake_device_1']);

  await page.reload();
  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect.poll(() => liveTracks(page)).toEqual(['fake_device_1']);
  await expect(page.getByLabel('カメラ', { exact: true }).locator('option:checked')).toHaveText('fake_device_1');
});

test('カメラの抜き差しで一覧が更新される', async ({ page }) => {
  await page.goto('./');
  const options = page.getByLabel('カメラ', { exact: true }).locator('option');
  await expect(options).toHaveCount(2);

  // USB カメラを挿したときと同じく、一覧が増えて devicechange が届く状況を作る
  await page.evaluate(() => {
    const mediaDevices = navigator.mediaDevices;
    const enumerateDevices = mediaDevices.enumerateDevices.bind(mediaDevices);
    mediaDevices.enumerateDevices = async () => [
      ...await enumerateDevices(),
      { kind: 'videoinput', deviceId: 'usb-camera', groupId: 'usb', label: 'USB カメラ' },
    ];
    mediaDevices.dispatchEvent(new Event('devicechange'));
  });

  await expect(options).toHaveText(['fake_device_0', 'fake_device_1', 'USB カメラ']);
});

test('選んだカメラが見つからないときは、選び直すよう案内する', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new OverconstrainedError('deviceId', 'テスト用のエラー');
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'カメラを開始' }).click();

  await expect(page.getByRole('alert')).toContainText('選択したカメラが見つかりません');
});

test.describe('カメラの許可がない場合', () => {
  test.use({ permissions: [] });

  test('一覧の代わりに既定のカメラを使うと表示する', async ({ page }) => {
    await page.goto('./');
    const select = page.getByLabel('カメラ', { exact: true });

    await expect(select.locator('option')).toHaveText(['既定のカメラ（開始後に選べます）']);
    await expect(select).toBeDisabled();
  });
});
