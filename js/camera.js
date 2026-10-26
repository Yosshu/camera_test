// カメラのストリームの開始・停止を一手に引き受ける。
// 古いストリームを止め忘れるとカメラが開きっぱなしになるため、
// ストリームを持つのはこのクラスだけにする。
export class Camera extends EventTarget {
  #video;
  #stream = null;
  // start / stop のたびに増やし、待っている間に追い越された古い要求を見分ける
  #generation = 0;

  constructor(video) {
    super();
    this.#video = video;
  }

  get active() {
    return this.#stream !== null;
  }

  get track() {
    return this.#stream?.getVideoTracks()[0] ?? null;
  }

  // 新しい条件でカメラを開く。開いていたストリームは先に止める
  // （スマホなどは同時に2つ開けないため）。
  // 別の start / stop に追い越された場合は null を返す。
  async start(videoConstraints) {
    const generation = ++this.#generation;
    this.#release();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    } catch (error) {
      if (generation !== this.#generation) return null;
      throw error;
    }
    if (generation !== this.#generation) {
      stopTracks(stream);
      return null;
    }

    this.#stream = stream;
    this.track.addEventListener('ended', () => {
      // カメラが取り外された・OS に止められたなど、こちらが止めたのではない終了
      if (this.#stream !== stream) return;
      this.#release();
      this.dispatchEvent(new Event('ended'));
    }, { once: true });

    this.#video.srcObject = stream;
    try {
      await this.#video.play();
    } catch {
      // 再生待ちの間に停止・切替されると中断される。autoplay 属性があるので通常は再生が続く
    }
    return generation === this.#generation ? stream : null;
  }

  stop() {
    this.#generation++;
    this.#release();
  }

  #release() {
    if (!this.#stream) return;
    stopTracks(this.#stream);
    this.#stream = null;
    this.#video.srcObject = null;
  }
}

function stopTracks(stream) {
  for (const track of stream.getTracks()) track.stop();
}
