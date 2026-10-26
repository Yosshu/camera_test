// アプリの起動と、画面とカメラの配線。
import { Camera } from './camera.js';
import { checkEnvironment, describeError } from './errors.js';

const elements = {
  frame: document.getElementById('video-frame'),
  video: document.getElementById('video'),
  status: document.getElementById('status'),
  toggleButton: document.getElementById('toggle-button'),
  message: document.getElementById('message'),
  messageTitle: document.getElementById('message-title'),
  messageDetail: document.getElementById('message-detail'),
};

const STATUS_TEXT = { idle: '停止中', starting: '起動中…', live: '表示中' };
const BUTTON_TEXT = { idle: 'カメラを開始', starting: '起動中…', live: 'カメラを停止' };

const camera = new Camera(elements.video);
const environmentProblem = checkEnvironment();

function setState(state) {
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

async function startCamera() {
  hideMessage();
  setState('starting');
  try {
    const stream = await camera.start(true);
    if (stream) setState('live');
  } catch (error) {
    setState('idle');
    showMessage(describeError(error));
  }
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
});

elements.toggleButton.addEventListener('click', () => {
  if (camera.active) stopCamera();
  else startCamera();
});

setState('idle');
if (environmentProblem) showMessage(environmentProblem);

// テストでスクリプトが読み込めたことを確認できるよう印を付ける
document.body.dataset.app = 'ready';
