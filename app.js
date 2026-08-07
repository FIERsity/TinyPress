'use strict';

/* =====================================================================
 * 图压 TinyPress - 纯前端图片压缩
 * 流程：上传图片 → 选择目标大小/输出格式 → 点「压缩」→ 显示结果
 * 全程本地处理，图片不上传任何服务器。
 * ===================================================================== */

/* ---------------- 状态 ---------------- */
const state = {
  targetBytes: 1024 * 1024, // 默认 1MB（GitHub 头像等常见门槛）
  format: 'auto',          // auto | jpeg | webp | png
  convertOnly: false,      // true = 仅格式转换，不压体积
  files: [],               // 待压缩文件
  processing: false,
};

/* ---------------- 工具函数 ---------------- */
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function fmtPct(n) {
  return Math.max(0, Math.round(n * 100)) + '%';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------- 国际化 ---------------- */
const I18N = {
  zh: {
    pageTitle: '图压 TinyPress · 图片压缩到指定大小',
    tagline: '简单快捷的图片压缩工具',
    privacy: '纯本地处理',
    langZh: '中', langEn: 'EN',
    feedback: '提交反馈',
    dropAria: '上传图片',
    dropTitle: '点击选择图片，拖拽或粘贴上传',
    dropHint: '支持 JPG / PNG / WebP / AVIF / GIF，可一次选择多张',
    targetLabel: '目标大小',
    convertOnly: '仅转换',
    customPh: '自定义 KB',
    formatLabel: '输出格式',
    fmtAuto: '自动：默认保持原格式，无法处理会按照 WebP → AVIF / JPEG 降级。',
    fmtJpeg: 'JPEG：照片类最合适，透明区域会填充白色',
    fmtWebp: 'WebP：体积小、支持透明',
    fmtAvif: 'AVIF：当前压缩率最好的格式，浏览器不支持时自动回退',
    fmtPng: 'PNG：无损格式，只缩小分辨率不损失画质',
    compress: '压缩',
    compressing: '压缩中…',
    converting: '转换中…',
    resultsTitle: '压缩结果',
    convertResultsTitle: '转换结果',
    downloadAll: '打包下载',
    packaging: '打包中…',
    clearAll: '清空',
    footer: '图压 TinyPress · 免费开源工具 · 图片仅在本地浏览器中处理，绝不上传',
    selectImages: '请选择图片文件',
    selected: '已选 {n} 张，共 {size}',
    fbTitle: '提交反馈',
    fbHint: '反馈会直接发送给开发者，请勿填写敏感信息。',
    fbPlaceholder: '遇到了什么问题？或有什么建议？',
    fbCancel: '取消',
    fbSubmit: '提交',
    fbSending: '提交中…',
    fbEmpty: '请先填写反馈内容',
    fbOk: '已提交，感谢反馈！',
    fbFail: '反馈提交失败',
    zipFail: '打包库加载失败',
    zipDone: '已打包 {n} 张图片',
    zipFailGen: '打包失败',
    origLabel: '原图', compLabel: '压缩后', convertCompLabel: '转换后',
    stateCompressing: '压缩中…', stateConverting: '转换中…',
    stateFailed: '失败', stateNoCompress: '无需压缩', stateConverted: '转换完成',
    stateDone: '压缩完成', stateOk: '已达标', stateBest: '尽力压缩',
    stateUnsupported: '（浏览器不支持 AVIF，已用 {ext}）',
    origSize: '原始大小', afterSize: '压缩后', convertAfterSize: '转换后',
    savedSpace: '节省空间', dims: '尺寸', quality: '质量',
    original: '原图', lossless: '无损',
    resizedWarn: '(已降分辨率)', convertedWarn: '(已转 {ext})',
    downloadOrig: '下载原图', download: '下载 {ext}', downloading: '处理中…',
    canNotHandle: '无法处理',
  },
  en: {
    pageTitle: 'TinyPress · Compress images to a target size',
    tagline: 'A simple, fast image compression tool',
    privacy: '100% local',
    langZh: '中', langEn: 'EN',
    feedback: 'Feedback',
    dropAria: 'Upload images',
    dropTitle: 'Click to select, drag & drop, or paste',
    dropHint: 'JPG / PNG / WebP / AVIF / GIF, multiple files supported',
    targetLabel: 'Target size',
    convertOnly: 'Convert only',
    customPh: 'Custom KB',
    formatLabel: 'Output format',
    fmtAuto: 'Auto: keeps the original format; falls back to WebP → AVIF / JPEG only when needed.',
    fmtJpeg: 'JPEG: best for photos; transparent areas become white',
    fmtWebp: 'WebP: small size, supports transparency',
    fmtAvif: 'AVIF: best compression ratio; falls back automatically if unsupported',
    fmtPng: 'PNG: lossless; only resolution is reduced',
    compress: 'Compress',
    compressing: 'Compressing…',
    converting: 'Converting…',
    resultsTitle: 'Results',
    convertResultsTitle: 'Results',
    downloadAll: 'Download all',
    packaging: 'Packing…',
    clearAll: 'Clear',
    footer: 'TinyPress · Free & open source · Images never leave your browser',
    selectImages: 'Please choose image files',
    selected: '{n} selected, {size} total',
    fbTitle: 'Send feedback',
    fbHint: 'Feedback goes directly to the developer. Please don\'t include sensitive info.',
    fbPlaceholder: 'What problem did you run into? Any suggestions?',
    fbCancel: 'Cancel',
    fbSubmit: 'Send',
    fbSending: 'Sending…',
    fbEmpty: 'Please enter feedback first',
    fbOk: 'Sent, thanks for the feedback!',
    fbFail: 'Failed to send feedback',
    zipFail: 'Failed to load zip library',
    zipDone: 'Packed {n} image(s)',
    zipFailGen: 'Failed to pack',
    origLabel: 'Original', compLabel: 'After', convertCompLabel: 'After',
    stateCompressing: 'Working…', stateConverting: 'Working…',
    stateFailed: 'Failed', stateNoCompress: 'No compression needed', stateConverted: 'Converted',
    stateDone: 'Done', stateOk: 'Done', stateBest: 'Best effort',
    stateUnsupported: ' (AVIF unsupported, used {ext})',
    origSize: 'Original size', afterSize: 'After', convertAfterSize: 'After',
    savedSpace: 'Saved', dims: 'Dimensions', quality: 'Quality',
    original: 'Original', lossless: 'Lossless',
    resizedWarn: ' (resized)', convertedWarn: ' (converted to {ext})',
    downloadOrig: 'Download original', download: 'Download {ext}', downloading: 'Working…',
    canNotHandle: 'Cannot process',
  },
};
let lang = 'zh';
const langBtns = document.querySelectorAll('.lang-btn');
const t = (key, vars) => {
  let s = (I18N[lang] || I18N.zh)[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', vars[k]);
  return s;
};
function applyLang() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = t('pageTitle');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  langBtns.forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  formatNote.textContent = t('fmt' + state.format.charAt(0).toUpperCase() + state.format.slice(1));
  renderFileList();
}
langBtns.forEach((b) => {
  b.addEventListener('click', () => {
    lang = b.dataset.lang;
    try { localStorage.setItem('tp-lang', lang); } catch (_) {}
    applyLang();
  });
});
try { lang = localStorage.getItem('tp-lang') || 'zh'; } catch (_) {}

/* ---------------- 设置区 ---------------- */
const presetBtns = document.getElementById('presetBtns');
const customSize = document.getElementById('customSize');
const formatBtns = document.getElementById('formatBtns');
const formatNote = document.getElementById('formatNote');

function setTarget(kb) {
  kb = Math.round(Number(kb));
  state.convertOnly = kb === -1;
  if (state.convertOnly) {
    state.targetBytes = 1024 * 1024;
    [...presetBtns.children].forEach((b) =>
      b.classList.toggle('active', b.dataset.kb === '-1'));
    if (customSize.value !== '') customSize.value = '';
  } else {
    kb = Math.max(10, Math.min(102400, kb || 100));
    state.targetBytes = kb * 1024;
    [...presetBtns.children].forEach((b) =>
      b.classList.toggle('active', Number(b.dataset.kb) === kb));
    if (String(customSize.value) !== String(kb)) customSize.value = '';
  }
}

presetBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset');
  if (!btn) return;
  setTarget(Number(btn.dataset.kb));
});

customSize.addEventListener('change', () => {
  const v = Number(customSize.value);
  if (!v || v < 10) { customSize.value = ''; return; }
  setTarget(v);
});

function setFormat(fmt) {
  state.format = fmt;
  [...formatBtns.children].forEach((b) =>
    b.classList.toggle('active', b.dataset.format === fmt));
  formatNote.textContent = t('fmt' + fmt.charAt(0).toUpperCase() + fmt.slice(1)) || '';
}

formatBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset');
  if (!btn) return;
  setFormat(btn.dataset.format);
});

/* ---------------- 上传 ---------------- */
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const selectedInfo = document.getElementById('selectedInfo');
const compressBtn = document.getElementById('compressBtn');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));

fileInput.addEventListener('change', (e) => {
  handleFiles([...e.target.files]);
  e.target.value = '';
});

// 粘贴上传：截图（Ctrl+V / 右键粘贴）直接加入列表
document.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const imgs = [...items]
    .filter((it) => it.type && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (!imgs.length) return;
  e.preventDefault();
  handleFiles(imgs);
});

function handleFiles(files) {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) { toast(t('selectImages'), true); return; }
  state.files = state.files.concat(imgs);
  renderFileList();
  updateCompressBtn();
}

function renderFileList() {
  fileList.innerHTML = '';
  state.files.forEach((f, i) => {
    const li = document.createElement('div');
    li.className = 'file-item';
    li.innerHTML =
      '<span class="file-name">' + escapeHtml(f.name) + '</span>' +
      '<span class="file-size">' + fmtBytes(f.size) + '</span>' +
      '<button type="button" class="file-remove" data-i="' + i + '" aria-label="移除">×</button>';
    fileList.appendChild(li);
  });
  const total = state.files.reduce((s, f) => s + f.size, 0);
  selectedInfo.textContent = state.files.length
    ? t('selected', { n: state.files.length, size: fmtBytes(total) })
    : '';
}

fileList.addEventListener('click', (e) => {
  const btn = e.target.closest('.file-remove');
  if (!btn) return;
  state.files.splice(Number(btn.dataset.i), 1);
  renderFileList();
  updateCompressBtn();
});

function updateCompressBtn() {
  compressBtn.disabled = state.files.length === 0 || state.processing;
}

/* ---------------- 压缩按钮 ---------------- */
const results = document.getElementById('results');
const resultGrid = document.getElementById('resultGrid');

compressBtn.addEventListener('click', async () => {
  if (!state.files.length || state.processing) return;
  state.processing = true;
  updateCompressBtn();
  compressBtn.textContent = t(state.convertOnly ? 'converting' : 'compressing');

  const files = state.files.slice();
  const target = state.targetBytes;
  const format = state.format;
  const convertOnly = state.convertOnly;
  state.files = [];
  renderFileList();

  results.hidden = false;
  for (const file of files) {
    const card = createCard(file);
    try {
      const r = await compressFile(file, target, format, convertOnly);
      renderResult(card, file, r);
    } catch (err) {
      console.error('压缩失败:', file.name, err);
      renderError(card, file, err);
    }
  }

  state.processing = false;
  updateCompressBtn();
  compressBtn.textContent = t('compress');
  updateDownloadAllBtn();
});

/* ---------------- 结果卡片 ---------------- */
const doneResults = []; // {file, result} 用于打包下载

function createCard(file) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML =
    '<div class="compare">' +
      '<span class="cmp-label orig">' + t('origLabel') + '</span>' +
      '<span class="cmp-label comp">' + t('compLabel') + '</span>' +
      '<img class="cmp-before" alt="original" />' +
      '<img class="cmp-after" alt="after" />' +
      '<div class="cmp-handle"></div>' +
      '<input type="range" class="cmp-range" min="0" max="100" value="50" aria-label="compare slider" />' +
    '</div>' +
    '<div class="result-body">' +
      '<div class="result-name"><span class="name">' + escapeHtml(file.name) + '</span><span class="state">' + t(state.convertOnly ? 'stateConverting' : 'stateCompressing') + '</span></div>' +
      '<div class="stat-row"><span>' + t('origSize') + '</span><b>' + fmtBytes(file.size) + '</b></div>' +
      '<div class="stat-row"><span>' + t(state.convertOnly ? 'convertAfterSize' : 'afterSize') + '</span><b class="size-out">…</b></div>' +
      '<div class="stat-row"><span>' + t('savedSpace') + '</span><span class="saved">…</span></div>' +
      '<div class="stat-row"><span>' + t('dims') + '</span><b class="dims">…</b></div>' +
      '<div class="stat-row"><span>' + t('quality') + '</span><b class="quality">…</b></div>' +
      '<button class="btn-download" disabled>' + t('downloading') + '</button>' +
    '</div>';
  resultGrid.appendChild(card);

  const origUrl = URL.createObjectURL(file);
  card.querySelector('.cmp-before').src = origUrl;
  const range = card.querySelector('.cmp-range');
  const applyPos = () => card.querySelector('.compare').style.setProperty('--pos', range.value + '%');
  applyPos();
  range.addEventListener('input', applyPos);
  return card;
}

function renderResult(card, file, r) {
  doneResults.push({ file, result: r });
  card.querySelector('.cmp-after').src = URL.createObjectURL(r.blob);
  const nameEl = card.querySelector('.name');
  const stateEl = card.querySelector('.state');
  const sizeOut = card.querySelector('.size-out');
  const savedEl = card.querySelector('.saved');
  const dimsEl = card.querySelector('.dims');
  const qualityEl = card.querySelector('.quality');
  const btn = card.querySelector('.btn-download');

  const base = file.name.replace(/\.[^.]+$/, '');
  const ext = (r.ext || 'jpg').toLowerCase();
  const isConvert = state.convertOnly;

  dimsEl.textContent = r.width + ' × ' + r.height;
  qualityEl.textContent = r.kept ? t('original') : r.quality === 1 ? t('lossless') : Math.round(r.quality * 100) + '%';

  if (r.kept) {
    stateEl.textContent = isConvert ? t('stateConverted') : t('stateNoCompress');
    stateEl.className = 'state ok';
    sizeOut.textContent = fmtBytes(r.blob.size);
    savedEl.textContent = '—';
    btn.textContent = t('downloadOrig');
  } else if (isConvert) {
    stateEl.textContent = t('stateConverted');
    stateEl.className = 'state ok';
    sizeOut.textContent = fmtBytes(r.blob.size);
    savedEl.textContent = '—';
    if (r.resized) {
      dimsEl.innerHTML = r.width + ' × ' + r.height + ' <span class="warn">' + t('resizedWarn') + '</span>';
    }
    btn.textContent = t('download', { ext: ext.toUpperCase() });
  } else {
    const savedRatio = 1 - r.blob.size / file.size;
    const underTarget = r.blob.size <= state.targetBytes;
    const inRange = r.blob.size >= state.targetBytes * (1 - RANGE_RATIO);
    stateEl.textContent = inRange ? t('stateDone') : (underTarget ? t('stateOk') : t('stateBest'));
    stateEl.className = 'state ' + (underTarget ? 'ok' : 'err');
    if (state.format === 'avif' && r.ext !== 'avif') {
      stateEl.textContent += t('stateUnsupported', { ext: r.ext.toUpperCase() });
    }
    sizeOut.textContent = fmtBytes(r.blob.size);
    savedEl.textContent = savedRatio > 0 ? '−' + fmtPct(savedRatio) : '+0%';
    if (r.resized) {
      dimsEl.innerHTML = r.width + ' × ' + r.height + ' <span class="warn">' + t('resizedWarn') + '</span>';
    }
    const srcMime = (file.type || '').toLowerCase();
    const srcSame = (srcMime === 'image/jpeg' && r.ext === 'jpg') ||
      (srcMime === 'image/png' && r.ext === 'png') ||
      (srcMime === 'image/webp' && r.ext === 'webp') ||
      (srcMime === 'image/avif' && r.ext === 'avif');
    if (r.converted && !srcSame) {
      dimsEl.innerHTML += ' <span class="warn">' + t('convertedWarn', { ext: r.ext.toUpperCase() }) + '</span>';
    }
    btn.textContent = t('download', { ext: ext.toUpperCase() });
  }

  btn.disabled = false;
  btn.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob);
    a.download = base + '_compressed.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
}

function renderError(card, file, err) {
  card.querySelector('.state').textContent = t('stateFailed');
  card.querySelector('.state').className = 'state err';
  card.querySelector('.size-out').textContent = '—';
  card.querySelector('.saved').textContent = err.message || String(err);
  const btn = card.querySelector('.btn-download');
  btn.textContent = t('canNotHandle');
  btn.disabled = true;
}

/* ---------------- 打包下载 ---------------- */
const downloadAllBtn = document.getElementById('downloadAll');

function updateDownloadAllBtn() {
  downloadAllBtn.disabled = doneResults.length === 0;
}

let jszipPromise = null;
function loadJSZip() {
  if (jszipPromise) return jszipPromise;
  jszipPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'jszip.min.js';
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error(t('zipFail')));
    document.head.appendChild(script);
  });
  return jszipPromise;
}

downloadAllBtn.addEventListener('click', async () => {
  if (!doneResults.length) return;
  try {
    downloadAllBtn.disabled = true;
    downloadAllBtn.textContent = t('packaging');
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    for (const { file, result } of doneResults) {
      const base = file.name.replace(/\.[^.]+$/, '');
      const ext = (result.ext || 'jpg').toLowerCase();
      zip.file(base + '_compressed.' + ext, result.blob);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tinypress-' + doneResults.length + '张.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(t('zipDone', { n: doneResults.length }));
  } catch (err) {
    console.error('打包失败:', err);
    toast(err.message || t('zipFailGen'), true);
  } finally {
    downloadAllBtn.textContent = '打包下载';
    updateDownloadAllBtn();
  }
});

/* =====================================================================
 * 压缩核心
 * ===================================================================== */

/** 解码为可绘制对象（ImageBitmap 优先，回退 Image） */
async function decodeImage(file) {
  try {
    return await createImageBitmap(file);
  } catch (_) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('无法解码该图片，可能已损坏或格式不支持'));
        img.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** 检测是否含透明像素（降采样 64×64 判断） */
function detectAlpha(bitmap) {
  const w = Math.min(bitmap.width || 1, 64);
  const h = Math.min(bitmap.height || 1, 64);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

/**
 * 二分搜索质量。
 * - 目标区间 [minBytes, targetBytes]，minBytes = targetBytes * (1 - RANGE_RATIO)
 * - 优先返回「不超上限、且尽可能接近上限」的质量（落在区间内）
 * - 若没有任何质量落在区间内，返回不超上限的最高质量（尽力而为）
 * - maxQ < 1 时步进按 maxQ 自适应（避免 0.02 固定步进在低位区间失效）
 */
const RANGE_RATIO = 0.15; // 区间宽度：目标值的 ±15% 以内视为达标
const QUALITY_STEP = 0.02;

async function searchQuality(w, h, encode, targetBytes, maxQ = 1) {
  let lo = 0.04, hi = Math.max(0.04, maxQ);
  let best = null;      // 不超上限的最高质量
  let inRange = null;   // 落在区间内的最高质量
  let overMin = null;   // 最低质量下的实测（即使超目标，用于估算下一档分辨率）
  const minBytes = targetBytes * (1 - RANGE_RATIO);
  const step = Math.max(0.001, Math.min(QUALITY_STEP, (hi - lo) / 8));
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const blob = await encode(w, h, mid);
    const entry = { blob, width: w, height: h, quality: mid, size: blob.size };
    if (!overMin || mid < overMin.quality) overMin = entry;
    if (blob.size <= targetBytes) {
      best = entry;
      if (blob.size >= minBytes) inRange = entry;
      lo = mid + step;
    } else {
      hi = mid - step;
    }
  }
  return inRange || best || overMin;
}

/**
 * 压缩单个文件到目标大小以下。
 * - auto：优先保留原格式；压不到目标区间才按通用度降级（原格式 → WebP → AVIF / JPEG）
 * - 显式格式：强制输出所选格式（AVIF 不支持时回退 WebP）
 * - 有损压缩：先原尺寸压质量；质量到底仍超目标 → 按体积比例估算下一档分辨率（收敛快、不盲目缩小）
 * 所有返回路径均携带 ext，并标记 converted（发生过格式转换）。
 */
async function compressFile(file, targetBytes, formatMode, convertOnly = false) {
  const bitmap = await decodeImage(file);
  const srcMime = (file.type || '').toLowerCase();

  // AVIF 编码支持检测
  const supportsAvif = typeof HTMLCanvasElement !== 'undefined' &&
    document.createElement('canvas').toDataURL('image/avif').startsWith('data:image/avif');

  // 尺寸上限保护（超大图先归一化，避免 Canvas 内存溢出）
  const MAX_DIM = 4096;
  let width = bitmap.width, height = bitmap.height;
  const dimScale = Math.min(1, MAX_DIM / Math.max(width, height));
  const maxDimResized = dimScale < 1;
  width = Math.max(1, Math.round(width * dimScale));
  height = Math.max(1, Math.round(height * dimScale));

  // 原始格式（来自 MIME，兜底文件扩展名）
  let srcFmt = null;
  if (srcMime === 'image/jpeg' || srcMime === 'image/jpg') srcFmt = 'jpeg';
  else if (srcMime === 'image/png') srcFmt = 'png';
  else if (srcMime === 'image/webp') srcFmt = 'webp';
  else if (srcMime === 'image/avif') srcFmt = 'avif';
  if (!srcFmt) {
    const m = file.name.match(/\.([a-z0-9]+)$/i);
    if (m) {
      const e = m[1].toLowerCase();
      if (e === 'jpg' || e === 'jpeg') srcFmt = 'jpeg';
      else if (e === 'png') srcFmt = 'png';
      else if (e === 'webp') srcFmt = 'webp';
      else if (e === 'avif') srcFmt = 'avif';
    }
  }

  // 自动模式：原图已达标 → 直接保留原文件（仅压缩模式；转换模式永远重编码）
  if (!convertOnly && formatMode === 'auto' && file.size <= targetBytes) {
    const m = file.name.match(/\.([a-z0-9]+)$/i);
    return {
      blob: file, width: bitmap.width, height: bitmap.height,
      ext: m ? m[1].toLowerCase() : 'jpg', quality: 1, kept: true,
    };
  }

  // 候选格式（有序）：auto = 原格式 → WebP → AVIF/JPEG
  const fmtMap = {
    jpeg: ['image/jpeg', 'jpg'],
    webp: ['image/webp', 'webp'],
    avif: ['image/avif', 'avif'],
    png: ['image/png', 'png'],
  };
  let candidates = [];
  if (formatMode === 'auto') {
    const hasAlpha = detectAlpha(bitmap);
    if (srcFmt) candidates.push(srcFmt);
    if (srcFmt !== 'webp') candidates.push('webp');
    if (supportsAvif && srcFmt !== 'avif') candidates.push('avif');
    // 不透明图再加 JPEG 作为最后兜底（PNG/WebP 已覆盖透明场景）
    if (!hasAlpha && srcFmt !== 'jpeg' && srcFmt !== 'webp' && srcFmt !== 'avif') candidates.push('jpeg');
  } else if (formatMode === 'avif') {
    // 显式 AVIF：不支持时明确回退 WebP
    candidates = [supportsAvif ? 'avif' : 'webp'];
  } else {
    candidates = [formatMode];
  }

  // 仅格式转换：不压缩体积，原分辨率按目标格式全质量重编码
  if (convertOnly) {
    const [fmt] = candidates;
    const [mime, ext] = fmtMap[fmt];
    const fillWhite = mime === 'image/jpeg';
    const blob = await new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (fillWhite) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      canvas.toBlob((res) => resolve(res), mime, fmt === 'png' ? undefined : 1);
    });
    return {
      blob, width, height, ext, quality: 1,
      resized: maxDimResized,
      converted: fmt !== srcFmt,
      convertOnly: true,
    };
  }

  // 编码器
  const makeEncode = (fmt) => {
    const mime = fmtMap[fmt][0];
    const fillWhite = mime === 'image/jpeg';
    return (w, h, quality) => new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (fillWhite) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), mime, fmt === 'png' ? undefined : quality);
    });
  };

  // 按实测体积比例估算下一档分辨率：
  // 体积 ∝ 面积（边长平方），边长比例 = sqrt(当前体积 / 目标体积)。
  // 始终用二分搜索的实测体积，比固定 0.8 步进收敛更快，也不会过度缩小。
  function nextDim(w, h, measuredSize) {
    const ratio = Math.sqrt(Math.max(measuredSize, 1) / targetBytes);
    const scale = Math.max(0.4, Math.min(0.92, ratio));
    const MIN_DIM = 16;
    return [
      Math.max(MIN_DIM, Math.round(w * scale)),
      Math.max(MIN_DIM, Math.round(h * scale)),
    ];
  }

  // 无损 PNG：只缩小分辨率
  async function compressLossless(fmt, ext) {
    const encode = makeEncode('png');
    let w = width, h = height;
    for (let i = 0; i < 40; i++) {
      const blob = await encode(w, h, 1);
      if (blob.size <= targetBytes) {
        return { blob, width: w, height: h, quality: 1, ext, resized: maxDimResized || w < bitmap.width, converted: fmt !== srcFmt };
      }
      [w, h] = nextDim(w, h, blob.size);
      if (w <= 16 || h <= 16) break;
    }
    const blob = await encode(w, h, 1);
    return { blob, width: w, height: h, quality: 1, ext, resized: true, converted: fmt !== srcFmt };
  }

  // 有损 JPEG/WebP/AVIF：原尺寸压质量；质量到底 → 按体积比例跳档缩小分辨率
  async function compressLossy(fmt, ext) {
    const encode = makeEncode(fmt);
    let best = null;      // 不超上限中体积最小的结果
    let w = width, h = height;

    for (let i = 0; i < 30; i++) {
      const r = await searchQuality(w, h, encode, targetBytes, 1);
      const meta = { ...r, ext, resized: maxDimResized || w < bitmap.width, converted: fmt !== srcFmt };
      if (r.blob.size <= targetBytes && (!best || r.blob.size < best.blob.size)) best = meta;
      if (r.blob.size >= targetBytes * (1 - RANGE_RATIO) && r.blob.size <= targetBytes) return meta;
      if (w <= 16 || h <= 16) break;
      // 始终用实测体积估算下一档（即使当前略超目标，也比线性模型准）
      [w, h] = nextDim(w, h, r.blob.size);
    }

    if (best) return best;
    const blob = await encode(w, h, 0.04);
    return { blob, width: w, height: h, quality: 0.04, ext, resized: true, converted: fmt !== srcFmt };
  }

  // 依次尝试候选格式，保留全局最优与全局落在区间内的结果
  let globalBest = null, globalFeasible = null;
  for (const fmt of candidates) {
    const [mime] = fmtMap[fmt];
    const ext = fmtMap[fmt][1];
    let r;
    if (fmt === 'png') r = await compressLossless(fmt, ext);
    else r = await compressLossy(fmt, ext);
    if (!globalBest || r.size < globalBest.size || (r.size === globalBest.size && r.quality > globalBest.quality)) {
      globalBest = r;
    }
    if (r.size >= targetBytes * (1 - RANGE_RATIO) && r.size <= targetBytes) {
      if (!globalFeasible || r.size > globalFeasible.size) globalFeasible = r;
      if (fmt === candidates[0]) return r; // 首选格式已达标 → 立即返回
    }
  }
  return globalFeasible || globalBest;
}

/* ---------------- 提交反馈 ---------------- */
const feedbackModal = document.getElementById('feedbackModal');
const feedbackBtn = document.getElementById('feedbackBtn');
const feedbackText = document.getElementById('feedbackText');
const feedbackCancel = document.getElementById('feedbackCancel');
const feedbackSubmit = document.getElementById('feedbackSubmit');

function openFeedback() { feedbackModal.hidden = false; feedbackText.value = ''; feedbackText.focus(); }
function closeFeedback() { feedbackModal.hidden = true; }

feedbackBtn.addEventListener('click', openFeedback);
feedbackCancel.addEventListener('click', closeFeedback);
feedbackModal.addEventListener('click', (e) => { if (e.target === feedbackModal) closeFeedback(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !feedbackModal.hidden) closeFeedback();
});

feedbackSubmit.addEventListener('click', async () => {
  const text = feedbackText.value.trim();
  if (!text) { toast(t('fbEmpty'), true); return; }
  try {
    feedbackSubmit.disabled = true;
    feedbackSubmit.textContent = t('fbSending');
    const res = await fetch('https://feedback.070315.site/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    toast(t('fbOk'));
    closeFeedback();
  } catch (err) {
    console.error('反馈提交失败:', err);
    toast(t('fbFail'), true);
  } finally {
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = t('fbSubmit');
  }
});

// 初始化语言（依赖 DOM 元素，放最后）
applyLang();

/* ---------------- 清空 ---------------- */
document.getElementById('clearAll').addEventListener('click', () => {
  resultGrid.innerHTML = '';
  results.hidden = true;
  doneResults.length = 0;
  updateDownloadAllBtn();
});

/* ---------------- PWA: 注册 Service Worker ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
