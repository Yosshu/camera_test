// RGB-D カメラの深度を、RealSense Viewer と同じ見え方で色付けして表示する。
//
// 深度は 16 bit の値（RealSense の標準では 1 = 1 mm）だが、ブラウザは <video> に表示するとき
// 8 bit の濃淡（上位の桁）に落とすため、数 m 以内はほぼ真っ黒に見える。
// そこで WebGL で深度の値を取り出し、librealsense の colorizer と同じ方法で色を付けて canvas に描く。
// - 配色は Jet（青 → 水色 → 黄 → 赤 → 暗い赤）。近いほど青、遠いほど赤
// - 「自動」はヒストグラム均等化（多く写っている距離ほど色の幅を広く割り当てる。RealSense Viewer の既定）
// - 値が 0（距離を測れなかった画素）は黒

// librealsense の colorizer の Jet と同じ色。等間隔に置き、間は直線で補間する
export const JET = [[0, 0, 255], [0, 255, 255], [255, 255, 0], [255, 0, 0], [50, 0, 0]];

export const DEPTH_RANGES = [
  { value: 'auto', label: '自動（RealSense Viewer と同じ）' },
  { value: '300-1500', near: 300, far: 1500, label: '0.3〜1.5 m（近距離）' },
  { value: '0-6000', near: 0, far: 6000, label: '0〜6 m' },
  { value: '1000-16000', near: 1000, far: 16000, label: '1〜16 m（遠距離）' },
];

export function findDepthRange(value) {
  return DEPTH_RANGES.find((range) => range.value === value) ?? DEPTH_RANGES[0];
}

const MAX_DEPTH = 0x10000;
const PALETTE_SIZE = 1024;

export function jetColor(t) {
  const x = Math.min(Math.max(t, 0), 1) * (JET.length - 1);
  const index = Math.min(Math.floor(x), JET.length - 2);
  const f = x - index;
  return JET[index].map((value, channel) => Math.round(value * (1 - f) + JET[index + 1][channel] * f));
}

const PALETTE = (() => {
  const palette = new Uint8Array(PALETTE_SIZE * 3);
  for (let i = 0; i < PALETTE_SIZE; i++) palette.set(jetColor(i / (PALETTE_SIZE - 1)), i * 3);
  return palette;
})();

export const JET_GRADIENT = `linear-gradient(to right, ${JET.map(([r, g, b]) => `rgb(${r} ${g} ${b})`).join(', ')})`;

// 深度の値ごとの、0〜1 の色の位置を返す関数を作る
export function depthMapping(depths, range) {
  if (range.far !== undefined) {
    const { near, far } = range;
    return { position: (d) => (d - near) / (far - near), near, far };
  }
  // ヒストグラム均等化：その距離より近い画素の割合を色の位置にする（値 0 は数えない）
  const cumulative = new Uint32Array(MAX_DEPTH);
  for (let i = 0; i < depths.length; i++) cumulative[depths[i]]++;
  cumulative[0] = 0;
  for (let d = 1; d < MAX_DEPTH; d++) cumulative[d] += cumulative[d - 1];
  const total = cumulative[MAX_DEPTH - 1];
  if (total === 0) return { position: () => 0, near: undefined, far: undefined };
  // 凡例には、外れ値を除いた範囲（1%〜99%）を出す
  let near = 1;
  while (cumulative[near] < total * 0.01) near++;
  let far = near;
  while (cumulative[far] < total * 0.99) far++;
  return { position: (d) => cumulative[d] / total, near, far };
}

// 深度の値（Uint16Array）を、Jet で色付けした RGBA に変換する
export function colorizeDepth(depths, rgba, range) {
  const mapping = depthMapping(depths, range);
  for (let i = 0; i < depths.length; i++) {
    const d = depths[i];
    const o = i * 4;
    if (d === 0) {
      rgba[o] = 0;
      rgba[o + 1] = 0;
      rgba[o + 2] = 0;
    } else {
      const t = Math.min(Math.max(mapping.position(d), 0), 1);
      const p = Math.floor(t * (PALETTE_SIZE - 1)) * 3;
      rgba[o] = PALETTE[p];
      rgba[o + 1] = PALETTE[p + 1];
      rgba[o + 2] = PALETTE[p + 2];
    }
    rgba[o + 3] = 255;
  }
  return mapping;
}

// 映像から深度の値を取り出す。WebGL2 で浮動小数のテクスチャに読み込み、16 bit を2バイトに分けて読み戻す。
// ブラウザが 8 bit しか渡さない場合は、上位の桁だけが入った（256 mm 刻みの）値になる。
class WebGLDepthReader {
  kind = 'webgl';
  #gl;
  #texture;
  #framebuffer;
  #target;
  #floatUpload = true;
  #width = 0;
  #height = 0;
  #pixels = new Uint8Array(0);

  static create() {
    const gl = document.createElement('canvas').getContext('webgl2');
    return gl ? new WebGLDepthReader(gl) : null;
  }

  constructor(gl) {
    this.#gl = gl;
    const vertex = `#version 300 es
      in vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
    const fragment = `#version 300 es
      precision highp float;
      uniform sampler2D depthTexture;
      out vec4 color;
      void main() {
        float d = floor(texelFetch(depthTexture, ivec2(gl_FragCoord.xy), 0).r * 65535.0 + 0.5);
        color = vec4(floor(d / 256.0) / 255.0, mod(d, 256.0) / 255.0, 0.0, 1.0);
      }`;
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.#texture = this.#createTexture();
    this.#target = this.#createTexture();
    this.#framebuffer = gl.createFramebuffer();
  }

  #createTexture() {
    const gl = this.#gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.NEAREST);
    for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
    return texture;
  }

  read(video, depths) {
    const gl = this.#gl;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width !== this.#width || height !== this.#height) {
      this.#width = width;
      this.#height = height;
      this.#pixels = new Uint8Array(width * height * 4);
      gl.bindTexture(gl.TEXTURE_2D, this.#target);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.#target, 0);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#texture);
    if (this.#floatUpload) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, gl.RED, gl.FLOAT, video);
      // 浮動小数で読み込めないブラウザでは、8 bit で読み込む（値の尺度は同じ）
      if (gl.getError() !== gl.NO_ERROR) this.#floatUpload = false;
    }
    if (!this.#floatUpload) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.#pixels);
    for (let i = 0; i < width * height; i++) depths[i] = (this.#pixels[i * 4] << 8) | this.#pixels[i * 4 + 1];
  }
}

// WebGL2 がないときは、8 bit の濃淡から値を取り出す（256 mm 刻みの粗い値になる）
class CanvasDepthReader {
  kind = 'canvas';
  #context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

  read(video, depths) {
    const { canvas } = this.#context;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });
    this.#context.drawImage(video, 0, 0);
    const { data } = this.#context.getImageData(0, 0, width, height);
    for (let i = 0; i < width * height; i++) depths[i] = data[i * 4] * 257;
  }
}

// 凡例の数値を書き換える間隔（毎フレーム書き換えると読めないため）
const LEGEND_INTERVAL = 500;

export class DepthView {
  #video;
  #canvas;
  #legend;
  #context;
  #reader = null;
  #running = false;
  #range = DEPTH_RANGES[0];
  #depths = new Uint16Array(0);
  #image = null;
  #legendUpdatedAt = -Infinity;

  // legend: { near, far, note }（凡例の文字を入れる要素）
  constructor(video, canvas, legend) {
    this.#video = video;
    this.#canvas = canvas;
    this.#legend = legend;
    this.#context = canvas.getContext('2d');
  }

  get renderer() {
    return this.#reader?.kind ?? null;
  }

  set range(value) {
    this.#range = findDepthRange(value);
    this.#legendUpdatedAt = -Infinity;
  }

  start() {
    if (this.#running) return;
    this.#reader ??= WebGLDepthReader.create() ?? new CanvasDepthReader();
    this.#canvas.dataset.renderer = this.#reader.kind;
    this.#running = true;
    this.#legendUpdatedAt = -Infinity;
    // 次のフレームを待たず、今の映像ですぐに1回描く
    requestAnimationFrame(() => this.#draw());
  }

  stop() {
    this.#running = false;
  }

  #scheduleNext() {
    if (!this.#running) return;
    // 新しいフレームが届いたときだけ描く。requestVideoFrameCallback がなければ画面の更新ごとに描く
    if (this.#video.requestVideoFrameCallback) this.#video.requestVideoFrameCallback(() => this.#draw());
    else requestAnimationFrame(() => this.#draw());
  }

  #draw() {
    if (!this.#running) return;
    const video = this.#video;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width && height) {
      if (this.#canvas.width !== width || this.#canvas.height !== height || !this.#image) {
        Object.assign(this.#canvas, { width, height });
        this.#image = this.#context.createImageData(width, height);
        this.#depths = new Uint16Array(width * height);
      }
      this.#reader.read(video, this.#depths);
      const mapping = colorizeDepth(this.#depths, this.#image.data, this.#range);
      this.#context.putImageData(this.#image, 0, 0);
      this.#updateLegend(mapping);
    }
    this.#scheduleNext();
  }

  #updateLegend({ near, far }) {
    const now = performance.now();
    if (now - this.#legendUpdatedAt < LEGEND_INTERVAL) return;
    this.#legendUpdatedAt = now;
    this.#legend.near.textContent = formatMeters(near);
    this.#legend.far.textContent = formatMeters(far);
    this.#legend.note.textContent = this.#range.far === undefined
      ? '自動：多く写っている距離ほど色の幅を広く割り当てています'
      : `固定：${this.#range.label}`;
  }
}

// 深度の値を m で表す（RealSense の標準の単位 1 mm として計算する）
export function formatMeters(depth) {
  return depth === undefined ? '—' : `${(depth / 1000).toFixed(depth < 10000 ? 2 : 1)} m`;
}
