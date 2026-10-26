// アプリの起動と、画面とカメラの配線。
import { Camera } from './camera.js';
import { listCameras, watchCameras } from './devices.js';
import { checkEnvironment, describeError } from './errors.js';
import { loadSettings, saveSettings } from './storage.js';

const elements = {
  frame: document.getElementById('video-frame'),
  video: document.getElementById('video'),
  status: document.getElementById('status'),
  cameraSelect: document.getElementById('camera-select'),
  toggleButton: document.getElementById('toggle-button'),
  message: document.getElementById('message'),
  messageTitle: document.getElementById('message-title'),
  messageDetail: document.getElementById('message-detail'),
};

const STATUS_TEXT = { idle: '停止中', starting: '起動中…', live: '表示中' };
const BUTTON_TEXT = { idle: 'カメラを開始', starting: '起動中…', live: 'カメラを停止' };

const camera = new Camera(elements.video);
const environmentProblem = checkEnvironment();
const settings = loadSettings();

let state = 'idle';
// 一覧で実在を確認できたカメラの ID
let knownDeviceIds = new Set();
// 一覧の更新が重なったとき、古い結果で上書きしないための番号
let listRequest = 0;

function setState(next) {
  state = next;
  elements.frame.dataset.state = state;
  elements.status.textContent = STATUS_TEXT[state];
  elements.toggleButton.textContent = BUTTON_TEXT[state];
  elements.toggleButton.classList.toggle('button-primary', state !== 'live');
  elements.toggleButton.disabled = state === 'starting' || environmentProblem !== null;
}

function showMessage({ title, detail }, kind = 'error') {
  elements.message.dataset.kind = kind;
  elements.messageTitle.textContent = title;
  elements.messageDetail.textContent = detail;
  elements.message.hidden = false;
}

function hideMessage() {
  elements.message.hidden = true;
}

async function refreshCameraList() {
  const request = ++listRequest;
  let cameras;
  try {
    cameras = (await listCameras()).filter((device) => device.deviceId);
  } catch {
    cameras = [];
  }
  if (request !== listRequest) return;

  knownDeviceIds = new Set(cameras.map((device) => device.deviceId));
  const select = elements.cameraSelect;
  select.replaceChildren();

  if (cameras.length === 0) {
    // 許可を得る前は名前も ID も分からないので、選択肢を出せない
    select.append(new Option('既定のカメラ（開始後に選べます）', ''));
    select.disabled = true;
    return;
  }

  cameras.forEach((device, index) => {
    select.append(new Option(device.label || `カメラ ${index + 1}`, device.deviceId));
  });
  const selected = camera.track?.getSettings().deviceId ?? settings.deviceId;
  if (knownDeviceIds.has(selected)) select.value = selected;
  select.disabled = environmentProblem !== null;
}

function videoConstraints() {
  const constraints = {};
  if (settings.deviceId) {
    // 一覧で確かめた ID は厳密に、前回の記憶だけの ID は「できれば」で指定する
    constraints.deviceId = knownDeviceIds.has(settings.deviceId)
      ? { exact: settings.deviceId }
      : { ideal: settings.deviceId };
  }
  return Object.keys(constraints).length > 0 ? constraints : true;
}

async function startCamera() {
  hideMessage();
  setState('starting');
  try {
    const stream = await camera.start(videoConstraints());
    if (!stream) return;
    setState('live');
    settings.deviceId = camera.track.getSettings().deviceId;
    saveSettings(settings);
  } catch (error) {
    setState('idle');
    showMessage(describeError(error));
  }
  // 許可を得た後はカメラの名前が分かるようになるので、一覧を作り直す
  await refreshCameraList();
}

function stopCamera() {
  camera.stop();
  setState('idle');
}

camera.addEventListener('ended', () => {
  setState('idle');
  showMessage({
    title: 'カメラの映像が途切れました',
    detail: 'カメラが取り外されたか、OS やほかのアプリによって停止された可能性があります。',
  }, 'warning');
  refreshCameraList();
});

elements.toggleButton.addEventListener('click', () => {
  if (camera.active) stopCamera();
  else startCamera();
});

elements.cameraSelect.addEventListener('change', () => {
  settings.deviceId = elements.cameraSelect.value;
  saveSettings(settings);
  if (state !== 'idle') startCamera();
});

setState('idle');
if (environmentProblem) {
  showMessage(environmentProblem);
  elements.cameraSelect.append(new Option('利用できません', ''));
  elements.cameraSelect.disabled = true;
} else {
  watchCameras(refreshCameraList);
  refreshCameraList();
}

// テストでスクリプトが読み込めたことを確認できるよう印を付ける
document.body.dataset.app = 'ready';
