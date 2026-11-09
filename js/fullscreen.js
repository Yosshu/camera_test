// 映像の枠だけを全画面にして、設定などを隠して映像だけを見られるようにする。
// Fullscreen API が使えないブラウザ（iPhone の Safari など）では、枠をページいっぱいに広げて代わりにする。

// 全画面中、マウスを動かさなければボタンとカーソルを隠すまでの時間
const IDLE_DELAY = 2000;

export class FullscreenView {
  #frame;
  #button;
  #canEnter;
  #idleTimer = 0;

  constructor(frame, button, { canEnter }) {
    this.#frame = frame;
    this.#button = button;
    this.#canEnter = canEnter;

    button.addEventListener('click', () => this.toggle());
    frame.addEventListener('dblclick', (event) => {
      if (!event.target.closest('button')) this.toggle();
    });
    frame.addEventListener('pointermove', () => this.#wake());
    frame.addEventListener('pointerdown', () => this.#wake());
    document.addEventListener('keydown', (event) => this.#onKeyDown(event));
    document.addEventListener('fullscreenchange', () => this.#update());
    this.#update();
  }

  get active() {
    return document.fullscreenElement === this.#frame || this.#frame.classList.contains('is-expanded');
  }

  toggle() {
    return this.active ? this.exit() : this.enter();
  }

  async enter() {
    if (this.active || !this.#canEnter()) return;
    if (document.fullscreenEnabled) {
      try {
        await this.#frame.requestFullscreen();
        return;
      } catch {
        // 全画面にできなかったときは、ページ内で広げる
      }
    }
    this.#frame.classList.add('is-expanded');
    document.body.classList.add('has-expanded-frame');
    this.#update();
  }

  async exit() {
    if (document.fullscreenElement === this.#frame) {
      await document.exitFullscreen().catch(() => {});
    }
    this.#frame.classList.remove('is-expanded');
    document.body.classList.remove('has-expanded-frame');
    this.#update();
  }

  #onKeyDown(event) {
    // 本物の全画面ではブラウザが Esc で戻すので、ページ内で広げたときだけ自分で戻す
    if (event.key === 'Escape' && this.#frame.classList.contains('is-expanded')) {
      this.exit();
      return;
    }
    if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.metaKey || event.altKey) return;
    // 選択肢やテキストの操作中に押した F は、その操作に使う
    if (event.target.closest?.('input, select, textarea, [contenteditable]')) return;
    event.preventDefault();
    this.toggle();
  }

  #update() {
    const active = this.active;
    this.#frame.classList.toggle('is-fullscreen', active);
    const label = active ? '全画面表示を終了' : '映像だけを全画面表示';
    this.#button.setAttribute('aria-label', label);
    this.#button.title = `${label}（F キー・ダブルクリックでも切り替えられます）`;
    this.#wake();
  }

  #wake() {
    this.#frame.classList.remove('is-idle');
    clearTimeout(this.#idleTimer);
    if (this.active) {
      this.#idleTimer = setTimeout(() => this.#frame.classList.add('is-idle'), IDLE_DELAY);
    }
  }
}
