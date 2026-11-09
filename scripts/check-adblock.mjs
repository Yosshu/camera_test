// 公開するファイルが、広告ブロッカー（uBlock Origin の標準フィルタ）に止められないかを調べる。
//
// github.io 上の fullscreen.js は、サポート詐欺のページ対策として uBlock Origin が一律に止めており、
// 画面のスクリプトが動かなくなったことがある。同じことが起きないよう、公開前にこれで確かめる。
//
// 使い方: node scripts/check-adblock.mjs [公開用フォルダ（既定: _site）]
//   ADBLOCK_LISTS_DIR を指定すると、ダウンロードせずにそのフォルダのフィルタ（*.txt）を使う
//
// フィルタの書式のうち、URL で読み込みを止めるルールだけを近似的に解釈する。
// 要素を隠すルール（## など）や、ドメイン単位の一覧（Peter Lowe’s、URLhaus）は対象外。
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname, sep } from 'node:path';

const PAGE_HOST = 'yosshu.github.io';
const BASE_URL = `https://${PAGE_HOST}/camera_test/`;

// uBlock Origin が標準で有効にしているフィルタ（assets.json の contentURL）
const LIST_URLS = [
  'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  'https://ublockorigin.github.io/uAssets/filters/badware.txt',
  'https://ublockorigin.github.io/uAssets/filters/privacy.txt',
  'https://ublockorigin.github.io/uAssets/filters/unbreak.txt',
  'https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt',
  'https://ublockorigin.github.io/uAssets/thirdparties/easylist.txt',
  'https://ublockorigin.github.io/uAssets/thirdparties/easyprivacy.txt',
];

const REQUEST_TYPES = {
  '.html': 'document',
  '.css': 'stylesheet',
  '.js': 'script',
  '.mjs': 'script',
  '.png': 'image',
  '.jpg': 'image',
  '.svg': 'image',
  '.ico': 'image',
  '.mp3': 'media',
  '.json': 'xmlhttprequest',
};

const TYPE_ALIASES = { css: 'stylesheet', doc: 'document', frame: 'subdocument', xhr: 'xmlhttprequest' };
const KNOWN_TYPES = new Set(['script', 'stylesheet', 'document', 'image', 'media', 'font', 'object', 'subdocument', 'xmlhttprequest', 'websocket', 'ping', 'other']);
// 読み込みそのものは止めない指定
const NON_BLOCKING = new Set(['csp', 'removeparam', 'redirect-rule', 'header', 'permissions', 'replace', 'urltransform', 'uritransform', 'badfilter', 'popup', 'popunder', 'generichide', 'ghide', 'elemhide', 'ehide', 'specifichide', 'shide', 'inline-script', 'inline-font', 'cname']);

async function loadLists() {
  const texts = [];
  const seen = new Set();

  async function readList(source, isFile) {
    if (seen.has(source)) return;
    seen.add(source);
    let text;
    try {
      text = isFile ? await readFile(source, 'utf8') : await fetchText(source);
    } catch (error) {
      console.log(`::warning::フィルタを読み込めませんでした: ${source}（${error.message}）`);
      return;
    }
    texts.push({ name: isFile ? relative(process.cwd(), source) : source, text });
    // uBlock 本体のフィルタは、年ごとのファイルなどを !#include で取り込んでいる
    for (const [, included] of text.matchAll(/^!#include\s+(\S+)/gm)) {
      await readList(isFile ? join(source, '..', included) : new URL(included, source).href, isFile);
    }
  }

  const dir = process.env.ADBLOCK_LISTS_DIR;
  if (dir) {
    for (const file of (await readdir(dir)).filter((name) => name.endsWith('.txt')).sort()) {
      await readList(join(dir, file), true);
    }
  } else {
    for (const url of LIST_URLS) await readList(url, false);
  }
  return texts;
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function toRegExp(pattern, matchCase) {
  const flags = matchCase ? '' : 'i';
  if (pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/')) {
    return new RegExp(pattern.slice(1, -1), flags);
  }
  let source = '';
  let rest = pattern;
  if (rest.startsWith('||')) {
    source += '^[a-z][a-z0-9+.-]*://([^/?#]*\\.)?';
    rest = rest.slice(2);
  } else if (rest.startsWith('|')) {
    source += '^';
    rest = rest.slice(1);
  }
  let tail = '';
  if (rest.endsWith('|')) {
    tail = '$';
    rest = rest.slice(0, -1);
  }
  for (const char of rest) {
    if (char === '*') source += '.*';
    else if (char === '^') source += '(?:[^\\w.%-]|$)';
    else source += char.replace(/[.+?${}()[\]\\/|]/g, '\\$&');
  }
  return new RegExp(source + tail, flags);
}

function parseRule(line, listName) {
  line = line.trim();
  if (!line || line.startsWith('!') || line.startsWith('[')) return null;
  if (/#[@?$%]?#|#\+js|#@\$#/.test(line)) return null;

  const exception = line.startsWith('@@');
  if (exception) line = line.slice(2);

  let pattern = line;
  let options = '';
  const regexWithOptions = line.startsWith('/') && line.match(/^(\/.*\/)\$([^/]*)$/);
  if (regexWithOptions) {
    [, pattern, options] = regexWithOptions;
  } else if (!(line.startsWith('/') && line.endsWith('/')) && line.includes('$')) {
    const index = line.lastIndexOf('$');
    pattern = line.slice(0, index);
    options = line.slice(index + 1);
  }
  if (pattern === '' || pattern === '*') return null;

  const rule = { raw: line, listName, exception, types: new Set(), notTypes: new Set(), domains: [], notDomains: [], party: null, matchCase: false };
  for (const option of options.split(',').map((text) => text.trim()).filter(Boolean)) {
    const negated = option.startsWith('~');
    const [rawName, value = ''] = (negated ? option.slice(1) : option).split(/=(.*)/s);
    const name = TYPE_ALIASES[rawName] ?? rawName;
    if (NON_BLOCKING.has(name)) return null;
    if (name === 'domain' || name === 'from') {
      for (const domain of value.split('|')) {
        if (domain.startsWith('~')) rule.notDomains.push(domain.slice(1));
        else rule.domains.push(domain);
      }
    } else if (name === 'third-party' || name === '3p' || name === 'strict3p') {
      rule.party = negated ? 'first' : 'third';
    } else if (name === 'first-party' || name === '1p' || name === 'strict1p') {
      rule.party = negated ? 'third' : 'first';
    } else if (name === 'match-case') {
      rule.matchCase = true;
    } else if (KNOWN_TYPES.has(name)) {
      (negated ? rule.notTypes : rule.types).add(name);
    }
  }
  try {
    rule.regexp = toRegExp(pattern, rule.matchCase);
  } catch {
    return null;
  }
  return rule;
}

function hostMatches(host, domain) {
  if (domain.endsWith('.*')) {
    const name = domain.slice(0, -2);
    return host === name || host.startsWith(`${name}.`) || host.includes(`.${name}.`);
  }
  return host === domain || host.endsWith(`.${domain}`);
}

function applies(rule, url, type) {
  if (rule.types.size > 0 && !rule.types.has(type)) return false;
  if (rule.notTypes.has(type)) return false;
  // 公開するファイルはすべて自サイト（同じ github.io）から読み込むので、第三者向けのルールは当たらない
  if (rule.party === 'third') return false;
  if (rule.domains.length > 0 && !rule.domains.some((domain) => hostMatches(PAGE_HOST, domain))) return false;
  if (rule.notDomains.some((domain) => hostMatches(PAGE_HOST, domain))) return false;
  return rule.regexp.test(url);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath ?? entry.path, entry.name)).split(sep).join('/'))
    .sort();
}

const siteDir = process.argv[2] ?? '_site';
const files = await listFiles(siteDir);
const requests = [{ url: BASE_URL, type: 'document' }, ...files.map((file) => ({
  url: BASE_URL + file,
  type: REQUEST_TYPES[extname(file)] ?? 'other',
}))];

const lists = await loadLists();
if (lists.length === 0) {
  console.log('::warning::フィルタを1つも読み込めなかったため、広告ブロッカーのチェックを省きました');
  process.exit(0);
}
const rules = lists.flatMap(({ name, text }) => text.split('\n').map((line) => parseRule(line, name)).filter(Boolean));
const blockRules = rules.filter((rule) => !rule.exception);
const allowRules = rules.filter((rule) => rule.exception);
console.log(`フィルタ ${lists.length} 件（ルール ${rules.length} 件）で ${requests.length} 件の URL を調べます`);

let blocked = 0;
for (const { url, type } of requests) {
  const hit = blockRules.find((rule) => applies(rule, url, type));
  if (!hit || allowRules.some((rule) => applies(rule, url, type))) continue;
  blocked++;
  console.log(`::error::広告ブロッカーに止められます: ${url}（${type}）`);
  console.log(`    ルール: ${hit.raw}`);
  console.log(`    フィルタ: ${hit.listName}`);
}

if (blocked > 0) {
  console.log(`${blocked} 件の URL が止められます。ファイル名やフォルダ名を変えてください。`);
  process.exit(1);
}
console.log('止められる URL はありませんでした');
