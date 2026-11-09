// アプリの起動と、画面とカメラの配線。
import { Camera } from './camera.js';
import {
  RESOLUTIONS, FRAME_RATES, findResolution, findFrameRate, supportsNativeOnly,
  buildVideoConstraints, exceedsResolution, exceedsFrameRate,
} from './constraints.js';
import { listCameras, watchCameras, groupCameras, pickStream, STREAM_KINDS } from './devices.js';
import { checkEnvironment, describeError } from './errors.js';
import { FullscreenView } from './view-mode.js';
import { renderInfo, renderRawData, formatResolution, formatFrameRate } from './info.js';
import { loadSettings, saveSettings } from './storage.js';

const elements = {
  frame: document.getElementById('video-frame'),
  video: document.getElementById('video'),
  status: document.getElementById('status'),
  fullscreenButton: document.getElementById('fullscreen-button'),
  cameraSelect: document.getElementById('camera-select'),
  streamField: document.getElementById('stream-field'),
  streamSelect: document.getElementById('stream-select'),
  resolutionSelect: document.getElementById('resolution-select'),
  frameRateSelect: document.getElementById('frame-rate-select'),
  nativeOnly: document.getElementById('native-only'),
  nativeOnlyHint: document.getElementById('native-only-hint'),
  toggleButton: document.getElementById('toggle-button'),
  message: document.getElementById('message'),
  messageTitle: document.getElementById('message-title'),
  messageDetail: document.getElementById('message-detail'),
  infoTable: document.getElementById('info-table'),
  rawData: document.getElementById('raw-data'),
};

const STATUS_TEXT = { idle: '停止中', starting: '起動中…', live: '表示中' };
const BUTTON_TEXT = { idle: 'カメラを開始', starting: '起動中…', live: 'カメラを停止' };

const camera = new Camera(elements.video);
const environmentProblem = checkEnvironment();
const settings = loadSettings();
const fullscreen = new FullscreenView(elements.frame, elements.fullscreenButton, {
  canEnter: () => state === 'live',
});

let state = 'idle';
// 今のストリームを開いたときの要求。表示中の値と見比べるために取っておく
let activeRequest = null;
// 一覧で実在を確認できたカメラの ID
let knownDeviceIds = new Set();
// RGB-D カメラのカラー・深度などを1台にまとめたカメラの一覧
let cameraGroups = [];
// 一覧の更新が重なったとき、古い結果で上書きしないための番号
let listRequest = 0;

function setState(next) {
  state = next;
  elements.frame.dataset.state = state;
  elements.toggleButton.textContent = BUTTON_TEXT[state];
  elements.toggleButton.classList.toggle('button-primary', state !== 'live');
  elements.toggleButton.disabled = state === 'starting' || environmentProblem !== null;
  updateCameraInfo();
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

function updateCameraInfo() {
  const track = state === 'live' ? camera.track : null;
  const { video } = elements;
  const kind = STREAM_KINDS[findStream(track?.getSettings().deviceId)?.kind];
  renderInfo(elements.infoTable, { track, video, request: activeRequest, kind });
  renderRawData(elements.rawData, { track, request: activeRequest });
  markOptionsBeyondLimits(track?.getCapabilities?.() ?? null);

  if (track && video.videoWidth) {
    const fps = formatFrameRate(track.getSettings().frameRate);
    elements.status.textContent = `表示中 · ${formatResolution(video.videoWidth, video.videoHeight)} · ${fps}`;
    elements.frame.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  } else {
    elements.status.textContent = STATUS_TEXT[state];
    elements.frame.style.aspectRatio = '';
  }
}

function fillOptions(select, options, value) {
  select.replaceChildren(...options.map((option) => new Option(option.label, option.value)));
  select.value = value;
}

// カメラの上限を超える選択肢に印を付ける。選べなくはしない（要求したら何が起きるか試せるように）
function markOptionsBeyondLimits(capabilities) {
  const mark = (select, options, exceeds) => {
    options.forEach((option, index) => {
      select.options[index].text = exceeds(option, capabilities) ? `${option.label}（上限超え）` : option.label;
    });
  };
  mark(elements.resolutionSelect, RESOLUTIONS, exceedsResolution);
  mark(elements.frameRateSelect, FRAME_RATES, exceedsFrameRate);
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
  cameraGroups = groupCameras(cameras);
  const select = elements.cameraSelect;
  select.replaceChildren();

  if (cameraGroups.length === 0) {
    // 許可を得る前は名前も ID も分からないので、選択肢を出せない
    select.append(new Option('既定のカメラ（開始後に選べます）', ''));
    select.disabled = true;
    renderStreamSelect(null);
    return;
  }

  cameraGroups.forEach((group, index) => {
    select.append(new Option(group.name || `カメラ ${index + 1}`, group.key));
  });
  const selected = camera.track?.getSettings().deviceId ?? preferredDeviceId(settings.deviceId);
  // まだ選んでいない・選んだカメラが外れたときは、先頭のカメラを表示する
  const group = findGroup(selected) ?? cameraGroups[0];
  select.value = group.key;
  renderStreamSelect(group, selected);
  select.disabled = environmentProblem !== null;
  if (state === 'live') updateCameraInfo();
}

function findGroup(deviceId) {
  return cameraGroups.find((group) => group.streams.some((stream) => stream.deviceId === deviceId));
}

function findStream(deviceId) {
  return findGroup(deviceId)?.streams.find((stream) => stream.deviceId === deviceId);
}

// RGB-D カメラでは、映像の種類を自分で選んでいない限りカラーを使う
function preferredDeviceId(deviceId) {
  const group = findGroup(deviceId);
  if (!group || group.streams.length < 2) return deviceId;
  if (findStream(deviceId).kind === settings.streamKind) return deviceId;
  return pickStream(group, settings.streamKind).deviceId;
}

// 開くカメラ。まだ何も選んでいなければ、一覧に表示しているカメラを使う
function requestedDeviceId() {
  if (settings.deviceId) return preferredDeviceId(settings.deviceId);
  const group = cameraGroups.find((candidate) => candidate.key === elements.cameraSelect.value);
  return group ? pickStream(group, settings.streamKind).deviceId : undefined;
}

// 「映像の種類」は、カラー・深度などを持つ RGB-D カメラのときだけ表示する
function renderStreamSelect(group, deviceId) {
  const hasChoices = group?.streams.length > 1;
  elements.streamField.hidden = !hasChoices;
  if (!hasChoices) {
    elements.streamSelect.replaceChildren();
    return;
  }
  elements.streamSelect.replaceChildren(...group.streams.map(
    (stream) => new Option(STREAM_KINDS[stream.kind].label, stream.deviceId),
  ));
  elements.streamSelect.value = findGroup(deviceId) === group
    ? deviceId
    : pickStream(group, settings.streamKind).deviceId;
}

async function startCamera() {
  hideMessage();
  setState('starting');
  const request = {
    resolution: findResolution(settings.resolution),
    frameRate: findFrameRate(settings.frameRate),
    constraints: buildVideoConstraints({ ...settings, deviceId: requestedDeviceId() }, knownDeviceIds),
  };
  try {
    const stream = await camera.start(request.constraints);
    if (!stream) return;
    activeRequest = request;
    setState('live');
    settings.deviceId = camera.track.getSettings().deviceId;
    saveSettings(settings);
  } catch (error) {
    setState('idle');
    showMessage(describeError(error));
  }
  // 許可を得た後はカメラの名前が分かるようになるので、一覧を作り直す
  await refreshCameraList();

  // 許可前で一覧が分からず、ブラウザが RGB-D カメラの深度などを開いたときはカラーに切り替える
  const opened = state === 'live' ? camera.track.getSettings().deviceId : null;
  if (opened && preferredDeviceId(opened) !== opened) {
    settings.deviceId = preferredDeviceId(opened);
    saveSettings(settings);
    await startCamera();
  }
}

function stopCamera() {
  camera.stop();
  setState('idle');
}

// 設定を変えたら覚えておき、表示中ならその条件で開き直す
function changeSetting(key, value) {
  settings[key] = value;
  saveSettings(settings);
  if (state !== 'idle') startCamera();
}

camera.addEventListener('ended', () => {
  // 全画面のままだと案内が見えないので戻す
  fullscreen.exit();
  setState('idle');
  showMessage({
    title: 'カメラの映像が途切れました',
    detail: 'カメラが取り外されたか、OS やほかのアプリによって停止された可能性があります。',
  }, 'warning');
  refreshCameraList();
});

// 解像度が変わったとき（開始直後を含む）に表示を合わせる
elements.video.addEventListener('resize', updateCameraInfo);

elements.toggleButton.addEventListener('click', () => {
  if (camera.active) stopCamera();
  else startCamera();
});

elements.cameraSelect.addEventListener('change', () => {
  const group = cameraGroups.find((candidate) => candidate.key === elements.cameraSelect.value);
  const stream = pickStream(group, settings.streamKind);
  renderStreamSelect(group, stream.deviceId);
  changeSetting('deviceId', stream.deviceId);
});
elements.streamSelect.addEventListener('change', () => {
  // 自分で選んだ種類は覚えておき、次回もその種類で開く
  settings.streamKind = findStream(elements.streamSelect.value)?.kind;
  changeSetting('deviceId', elements.streamSelect.value);
});
elements.resolutionSelect.addEventListener('change', () => changeSetting('resolution', elements.resolutionSelect.value));
elements.frameRateSelect.addEventListener('change', () => changeSetting('frameRate', elements.frameRateSelect.value));
elements.nativeOnly.addEventListener('change', () => changeSetting('nativeOnly', elements.nativeOnly.checked));

fillOptions(elements.resolutionSelect, RESOLUTIONS, findResolution(settings.resolution).value);
fillOptions(elements.frameRateSelect, FRAME_RATES, findFrameRate(settings.frameRate).value);
elements.nativeOnly.checked = settings.nativeOnly === true;
if (!supportsNativeOnly()) {
  elements.nativeOnly.checked = false;
  elements.nativeOnly.disabled = true;
  elements.nativeOnlyHint.textContent = 'このブラウザでは指定できません（Chrome / Edge で使えます）。';
}

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
