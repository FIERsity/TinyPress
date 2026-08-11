'use strict';

/* =====================================================================
 * 图压 TinyPress - 纯前端图片压缩
 * 流程：上传图片 → 选择目标大小/输出格式 → 点「压缩」→ 显示结果
 * 全程本地处理，图片不上传任何服务器。
 * ===================================================================== */

/* ---------------- 状态 ---------------- */
const state = {
  targetBytes: 1024 * 1024, // 默认 1MB（GitHub 头像等常见门槛）
  format: 'auto',          // auto | jpeg | webp | avif | png
  convertOnly: false,      // true = 仅格式转换，不压体积
  files: [],               // 待压缩文件
  processing: false,
  runId: 0,                // 清空结果时使仍在运行的异步任务失效
};

function createAbortError() {
  const error = new Error('任务已取消');
  error.name = 'AbortError';
  return error;
}

function throwIfCancelled(shouldCancel) {
  if (shouldCancel && shouldCancel()) throw createAbortError();
}

const compressionPolicy = window.TinyPressCompressionPolicy;
if (!compressionPolicy) throw new Error('压缩策略加载失败');
const {
  RANGE_RATIO,
  buildAutoCandidates,
  compressLossless: runLosslessCompression,
  compressLossy: runLossyCompression,
  fitWithinCanvasBudget,
  isSupportedImageFile,
  pickPreferredResult,
  sourceExtensionForFile,
} = compressionPolicy;

/* ---------------- 工具函数 ---------------- */
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function fmtPct(n) {
  return Math.max(0, Math.round(n * 100)) + '%';
}

function baseName(name) {
  const stripped = String(name || '').replace(/\.[^.]+$/, '');
  return stripped || String(name || 'image');
}

function formatName(value) {
  const normalized = String(value || '').toLowerCase().replace(/^image\//, '');
  const aliases = {
    jpg: 'JPEG',
    jpeg: 'JPEG',
    jfif: 'JPEG',
    tif: 'TIFF',
    tiff: 'TIFF',
    'svg+xml': 'SVG',
    'vnd.microsoft.icon': 'ICO',
  };
  return aliases[normalized] || normalized.toUpperCase() || 'IMAGE';
}

function sourceFormatName(file) {
  const knownExtensions = new Set([
    'jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif',
    'heic', 'heif', 'bmp', 'svg', 'tif', 'tiff', 'ico',
  ]);
  const match = String(file.name || '').match(/\.([a-z0-9]+)$/i);
  const extension = match ? match[1].toLowerCase() : '';
  if (knownExtensions.has(extension)) return formatName(extension);
  return formatName(file.type);
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
    customAria: '自定义目标大小',
    feedback: '反馈',
    dropAria: '上传图片',
    dropTitle: '点击选择图片，拖拽或粘贴上传',
    dropHint: '支持 JPG / PNG / WebP / AVIF / GIF / HEIC，可一次选择多张',
    targetLabel: '目标大小',
    convertOnly: '仅转换',
    customPh: '自定义',
    formatLabel: '输出格式',
    fmtAuto: '自动：优先保留分辨率和画质；HEIF 会转换为 AVIF / WebP / JPEG。',
    fmtJpeg: 'JPEG：照片类最合适，透明区域会填充白色',
    fmtWebp: 'WebP：体积小、支持透明',
    fmtAvif: 'AVIF：当前压缩率最好的格式，浏览器不支持时自动回退',
    fmtPng: 'PNG：无损但文件通常较大；达到目标大小时只降低分辨率',
    compress: '压缩',
    compressing: '压缩中…',
    converting: '转换中…',
    resultsTitle: '压缩结果',
    convertResultsTitle: '转换结果',
    mixedResultsTitle: '处理结果',
    downloadAll: '打包下载',
    packaging: '打包中…',
    selectAll: '全选',
    deselectAll: '取消全选',
    deleteSelected: '删除',
    deleteResult: '删除',
    selectResult: '选择 {name} 的结果',
    compareSlider: '对比 {name} 的压缩前后',
    convertSlider: '对比 {name} 的转换前后',
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
    origSize: '压缩前', afterSize: '压缩后', convertAfterSize: '转换后',
    savedSpace: '节省空间', dims: '尺寸', quality: '编码质量',
    original: '原图', lossless: '无损',
    resizedWarn: '(已降分辨率)', convertedWarn: '(已转 {ext})',
    downloadOrig: '下载', download: '下载', downloading: '处理中…',
    canNotHandle: '无法处理',
    canNotReachTarget: '无法在最低尺寸内压缩到目标大小',
  },
  en: {
    pageTitle: 'TinyPress · Compress images to a target size',
    tagline: 'A simple, fast image compression tool',
    privacy: '100% local',
    langZh: '中', langEn: 'EN',
    customAria: 'Custom target size',
    feedback: 'Feedback',
    dropAria: 'Upload images',
    dropTitle: 'Click to select, drag & drop, or paste',
    dropHint: 'JPG / PNG / WebP / AVIF / GIF / HEIC, multiple files supported',
    targetLabel: 'Target size',
    convertOnly: 'Convert only',
    customPh: 'Custom',
    formatLabel: 'Output format',
    fmtAuto: 'Auto: prioritizes resolution and visual quality; HEIF is converted to AVIF, WebP, or JPEG.',
    fmtJpeg: 'JPEG: best for photos; transparent areas become white',
    fmtWebp: 'WebP: small size, supports transparency',
    fmtAvif: 'AVIF: best compression ratio; falls back automatically if unsupported',
    fmtPng: 'PNG: lossless but often large; only resolution is reduced to meet the target',
    compress: 'Compress',
    compressing: 'Compressing…',
    converting: 'Converting…',
    resultsTitle: 'Compression results',
    convertResultsTitle: 'Conversion results',
    mixedResultsTitle: 'Results',
    downloadAll: 'Download ZIP',
    packaging: 'Packing…',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    deleteSelected: 'Delete',
    deleteResult: 'Delete',
    selectResult: 'Select the result for {name}',
    compareSlider: 'Compare before and after compression for {name}',
    convertSlider: 'Compare before and after conversion for {name}',
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
    origSize: 'Before', afterSize: 'After', convertAfterSize: 'After',
    savedSpace: 'Saved', dims: 'Dimensions', quality: 'Encoding quality',
    original: 'Original', lossless: 'Lossless',
    resizedWarn: '(resized)', convertedWarn: '(converted to {ext})',
    downloadOrig: 'Download', download: 'Download', downloading: 'Working…',
    canNotHandle: 'Cannot process',
    canNotReachTarget: 'Cannot reach the target size at the minimum dimensions',
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
  document.querySelectorAll('.cmp-range').forEach((range) => {
    range.setAttribute('aria-label', t(range.dataset.i18n, { name: range.dataset.name }));
  });
  document.querySelectorAll('.result-select').forEach((button) => {
    button.setAttribute('aria-label', t('selectResult', { name: button.dataset.name }));
  });
  doneResults.forEach(renderCompletedCardText);
  updateResultActions();
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

const customWrap = document.getElementById('customWrap');

function selectCustom(hasValue = true) {
  // 切到自定义：清除所有预设选中，点亮自定义胶囊
  [...presetBtns.children].forEach((b) => b.classList.remove('active'));
  customWrap.classList.toggle('active', hasValue);
  if (!hasValue && customSize.value !== '') customSize.value = '';
}

function setTarget(kb) {
  kb = Math.round(Number(kb));
  state.convertOnly = kb === -1;
  if (state.convertOnly) {
    state.targetBytes = 1024 * 1024;
    [...presetBtns.children].forEach((b) =>
      b.classList.toggle('active', b.dataset.kb === '-1'));
    customWrap.classList.remove('active');
    if (customSize.value !== '') customSize.value = '';
  } else {
    kb = Math.max(10, Math.min(102400, kb || 100));
    state.targetBytes = kb * 1024;
    [...presetBtns.children].forEach((b) =>
      b.classList.toggle('active', Number(b.dataset.kb) === kb));
    // 预设命中 → 取消自定义选中；自定义值 → 高亮胶囊
    const isPreset = [...presetBtns.children].some((b) => Number(b.dataset.kb) === kb);
    customWrap.classList.toggle('active', !isPreset);
    if (!isPreset && String(customSize.value) !== String(kb)) customSize.value = kb;
  }
}

presetBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset');
  if (!btn) return;
  setTarget(Number(btn.dataset.kb));
});

customWrap.addEventListener('click', () => { selectCustom(); customSize.focus(); });
customWrap.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCustom(); customSize.focus(); }
});
customSize.addEventListener('focus', () => { selectCustom(); });
customSize.addEventListener('input', () => {
  selectCustom(!!customSize.value);
});
customSize.addEventListener('change', () => {
  const v = Number(customSize.value);
  if (!v || v < 10) { selectCustom(false); return; }
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
    .map((it) => it.getAsFile())
    .filter((file) => file && isSupportedImageFile(file));
  if (!imgs.length) return;
  e.preventDefault();
  handleFiles(imgs);
});

function handleFiles(files) {
  const imgs = files.filter(isSupportedImageFile);
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
const resultsTitle = results.querySelector('h2');
const resultGrid = document.getElementById('resultGrid');

compressBtn.addEventListener('click', async () => {
  if (!state.files.length || state.processing) return;
  state.processing = true;
  updateCompressBtn();
  compressBtn.dataset.i18n = state.convertOnly ? 'converting' : 'compressing';
  compressBtn.textContent = t(compressBtn.dataset.i18n);

  const files = state.files.slice();
  const runId = ++state.runId;
  const job = Object.freeze({
    targetBytes: state.targetBytes,
    formatMode: state.format,
    convertOnly: state.convertOnly,
  });
  state.files = [];
  renderFileList();

  results.hidden = false;
  for (const file of files) {
    if (runId !== state.runId) break;
    const card = createCard(file, job);
    try {
      const shouldCancel = () => runId !== state.runId;
      const r = await compressFile(file, job, {
        shouldCancel,
        onDecoded: (bitmap) => ensureBeforePreview(card, bitmap, shouldCancel),
      });
      if (runId !== state.runId) break;
      renderResult(card, file, r, job);
    } catch (err) {
      if (runId !== state.runId) break;
      console.error('压缩失败:', file.name, err);
      renderError(card, file, err);
    }
  }

  if (runId === state.runId) {
    state.processing = false;
    updateCompressBtn();
    compressBtn.dataset.i18n = 'compress';
    compressBtn.textContent = t('compress');
    updateDownloadAllBtn();
  }
});

/* ---------------- 结果卡片 ---------------- */
const doneResults = []; // {file, result, card, selected} 用于选择、删除和打包下载
const beforePreviewReady = new WeakMap();
const selectAllBtn = document.getElementById('selectAll');
const downloadAllBtn = document.getElementById('downloadAll');
const deleteSelectedBtn = document.getElementById('deleteSelected');
let packaging = false;

function updateResultsTitle() {
  const modes = new Set([...resultGrid.children].map((card) => card.dataset.resultMode));
  const key = modes.size > 1
    ? 'mixedResultsTitle'
    : modes.has('convert')
      ? 'convertResultsTitle'
      : 'resultsTitle';
  resultsTitle.dataset.i18n = key;
  resultsTitle.textContent = t(key);
}

function entryForCard(card) {
  return doneResults.find((entry) => entry.card === card);
}

function setEntrySelected(entry, selected) {
  entry.selected = selected;
  entry.card.classList.toggle('is-selected', selected);
  const button = entry.card.querySelector('.result-select');
  button.classList.toggle('selected', selected);
  button.setAttribute('aria-pressed', String(selected));
}

function selectedResults() {
  return doneResults.filter((entry) => entry.selected);
}

function updateResultActions() {
  const selectedCount = selectedResults().length;
  const canBulkAct = selectedCount >= 2 && !packaging;
  const allSelected = doneResults.length >= 2 && doneResults.every((entry) => entry.selected);

  selectAllBtn.disabled = doneResults.length < 2 || packaging;
  selectAllBtn.textContent = t(allSelected ? 'deselectAll' : 'selectAll');
  selectAllBtn.classList.toggle('is-deselect', allSelected);
  selectAllBtn.classList.toggle('is-select', !allSelected);
  downloadAllBtn.textContent = t(packaging ? 'packaging' : 'downloadAll');
  downloadAllBtn.disabled = !canBulkAct;
  deleteSelectedBtn.disabled = !canBulkAct;

  doneResults.forEach((entry) => {
    entry.card.querySelector('.result-select').disabled = packaging;
    entry.card.querySelector('.btn-card-delete').disabled = packaging;
  });
}

function removeResultCard(card) {
  const index = doneResults.findIndex((entry) => entry.card === card);
  if (index >= 0) doneResults.splice(index, 1);
  card.remove();
  updateResultsTitle();
  if (!resultGrid.children.length) results.hidden = true;
  updateResultActions();
}

function setBlobPreview(img, blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

function canvasToPreviewBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
  });
}

async function createCompatiblePreview(bitmap) {
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建预览画布');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  const webp = await canvasToPreviewBlob(canvas, 'image/webp', 0.95);
  if (webp) return webp;
  const png = await canvasToPreviewBlob(canvas, 'image/png');
  if (png) return png;
  throw new Error('浏览器无法生成兼容预览');
}

async function ensureBeforePreview(card, bitmap, shouldCancel) {
  const directPreviewOk = await beforePreviewReady.get(card);
  if (directPreviewOk || (shouldCancel && shouldCancel())) return;
  try {
    const preview = await createCompatiblePreview(bitmap);
    if (shouldCancel && shouldCancel()) return;
    const previewOk = await setBlobPreview(card.querySelector('.cmp-before'), preview);
    if (!previewOk) console.warn('浏览器无法显示解码后的兼容预览');
  } catch (err) {
    console.warn('生成压缩前预览失败:', err);
  }
}

function createCard(file, job) {
  const card = document.createElement('div');
  const displayName = baseName(file.name);
  const inputFormat = sourceFormatName(file);
  card.className = 'result-card';
  card.dataset.resultStatus = 'pending';
  card.dataset.resultMode = job.convertOnly ? 'convert' : 'compress';
  card.innerHTML =
    '<div class="compare">' +
      '<span class="cmp-label orig" data-i18n="origLabel">' + t('origLabel') + '</span>' +
      '<span class="cmp-label comp" data-i18n="' + (job.convertOnly ? 'convertCompLabel' : 'compLabel') + '">' + t(job.convertOnly ? 'convertCompLabel' : 'compLabel') + '</span>' +
      '<img class="cmp-before" alt="" />' +
      '<img class="cmp-after" alt="" />' +
      '<div class="cmp-handle"></div>' +
      '<input type="range" class="cmp-range" min="0" max="100" value="50" />' +
      '<button type="button" class="result-select" aria-label="' + escapeHtml(t('selectResult', { name: displayName })) + '" aria-pressed="false" disabled></button>' +
    '</div>' +
    '<div class="result-body">' +
      '<div class="result-name"><span class="name">' + escapeHtml(displayName) + '</span><span class="state" data-i18n="' + (job.convertOnly ? 'stateConverting' : 'stateCompressing') + '">' + t(job.convertOnly ? 'stateConverting' : 'stateCompressing') + '</span></div>' +
      '<div class="stat-row"><span data-i18n="origSize">' + t('origSize') + '</span><b>' + escapeHtml(inputFormat) + ' ' + fmtBytes(file.size) + '</b></div>' +
      '<div class="stat-row"><span data-i18n="' + (job.convertOnly ? 'convertAfterSize' : 'afterSize') + '">' + t(job.convertOnly ? 'convertAfterSize' : 'afterSize') + '</span><b class="size-out">…</b></div>' +
      '<div class="stat-row"><span data-i18n="savedSpace">' + t('savedSpace') + '</span><span class="saved">…</span></div>' +
      '<div class="stat-row"><span data-i18n="dims">' + t('dims') + '</span><b class="dims">…</b></div>' +
      '<div class="stat-row"><span data-i18n="quality">' + t('quality') + '</span><b class="quality">…</b></div>' +
      '<p class="result-error" hidden></p>' +
      '<div class="result-card-actions">' +
        '<button type="button" class="btn-download" data-i18n="downloading" disabled>' + t('downloading') + '</button>' +
        '<button type="button" class="btn-card-delete" data-i18n="deleteResult" disabled>' + t('deleteResult') + '</button>' +
      '</div>' +
    '</div>';
  resultGrid.appendChild(card);
  results.hidden = false;
  updateResultsTitle();

  const beforeImg = card.querySelector('.cmp-before');
  beforePreviewReady.set(card, setBlobPreview(beforeImg, file));
  const range = card.querySelector('.cmp-range');
  range.dataset.name = displayName;
  range.dataset.i18n = job.convertOnly ? 'convertSlider' : 'compareSlider';
  range.setAttribute('aria-label', t(range.dataset.i18n, { name: displayName }));
  const applyPos = () => card.querySelector('.compare').style.setProperty('--pos', range.value + '%');
  applyPos();
  range.addEventListener('input', applyPos);
  const selectButton = card.querySelector('.result-select');
  selectButton.dataset.name = displayName;
  selectButton.addEventListener('click', () => {
    const entry = entryForCard(card);
    if (!entry || packaging) return;
    setEntrySelected(entry, !entry.selected);
    updateResultActions();
  });
  card.querySelector('.btn-card-delete').addEventListener('click', () => removeResultCard(card));
  return card;
}

function renderCompletedCardText(entry) {
  const { card, file, result: r, job } = entry;
  const stateEl = card.querySelector('.state');
  const sizeOut = card.querySelector('.size-out');
  const savedEl = card.querySelector('.saved');
  const dimsEl = card.querySelector('.dims');
  const qualityEl = card.querySelector('.quality');
  const btn = card.querySelector('.btn-download');
  const isConvert = job.convertOnly;

  stateEl.removeAttribute('data-i18n');
  dimsEl.textContent = r.width + ' × ' + r.height;
  qualityEl.textContent = r.kept
    ? t('original')
    : r.ext === 'png'
      ? t('lossless')
      : Math.round(r.quality * 100) + '%';

  if (r.kept) {
    stateEl.textContent = isConvert ? t('stateConverted') : t('stateNoCompress');
    stateEl.className = 'state ok';
    savedEl.textContent = '—';
  } else if (isConvert) {
    stateEl.textContent = t('stateConverted');
    stateEl.className = 'state ok';
    savedEl.textContent = '—';
    if (r.resized) {
      dimsEl.innerHTML = r.width + ' × ' + r.height + ' <span class="warn">' + t('resizedWarn') + '</span>';
    }
  } else {
    const savedRatio = 1 - r.blob.size / file.size;
    const underTarget = r.blob.size <= job.targetBytes;
    const inRange = r.blob.size >= job.targetBytes * (1 - RANGE_RATIO);
    stateEl.textContent = inRange ? t('stateDone') : (underTarget ? t('stateOk') : t('stateBest'));
    stateEl.className = 'state ' + (underTarget ? 'ok' : 'err');
    if (job.formatMode === 'avif' && r.ext !== 'avif') {
      stateEl.textContent += t('stateUnsupported', { ext: r.ext.toUpperCase() });
    }
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
  }

  sizeOut.textContent = formatName(r.ext) + ' ' + fmtBytes(r.blob.size);
  btn.dataset.i18n = r.kept ? 'downloadOrig' : 'download';
  btn.textContent = t(btn.dataset.i18n);
}

function renderResult(card, file, r, job) {
  const entry = { file, result: r, job, card, selected: false };
  doneResults.push(entry);
  card.dataset.resultStatus = 'done';
  void setBlobPreview(card.querySelector('.cmp-after'), r.blob);
  renderCompletedCardText(entry);

  const btn = card.querySelector('.btn-download');
  const deleteBtn = card.querySelector('.btn-card-delete');
  const selectBtn = card.querySelector('.result-select');
  const base = baseName(file.name);
  const ext = (r.ext || 'jpg').toLowerCase();
  const actionSuffix = job.convertOnly ? 'converted' : 'compressed';

  btn.disabled = false;
  deleteBtn.disabled = false;
  selectBtn.disabled = false;
  updateResultActions();
  btn.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob);
    a.download = base + '_' + actionSuffix + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
}

function renderError(card, file, err) {
  card.dataset.resultStatus = 'error';
  card.classList.add('has-error');
  card.querySelector('.cmp-range').disabled = true;
  card.querySelector('.state').dataset.i18n = 'stateFailed';
  card.querySelector('.state').textContent = t('stateFailed');
  card.querySelector('.state').className = 'state err';
  card.querySelector('.size-out').textContent = '—';
  card.querySelector('.saved').textContent = '—';
  card.querySelector('.dims').textContent = '—';
  card.querySelector('.quality').textContent = '—';
  const errorEl = card.querySelector('.result-error');
  errorEl.textContent = err.message || String(err);
  errorEl.hidden = false;
  const btn = card.querySelector('.btn-download');
  const deleteBtn = card.querySelector('.btn-card-delete');
  btn.dataset.i18n = 'canNotHandle';
  btn.textContent = t('canNotHandle');
  btn.disabled = true;
  deleteBtn.disabled = false;
  updateResultActions();
}

/* ---------------- 打包下载 ---------------- */
function updateDownloadAllBtn() {
  updateResultActions();
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

selectAllBtn.addEventListener('click', () => {
  if (doneResults.length < 2 || packaging) return;
  const shouldSelect = !doneResults.every((entry) => entry.selected);
  doneResults.forEach((entry) => setEntrySelected(entry, shouldSelect));
  updateResultActions();
});

deleteSelectedBtn.addEventListener('click', () => {
  const selected = selectedResults();
  if (selected.length < 2 || packaging) return;
  selected.forEach((entry) => removeResultCard(entry.card));
});

downloadAllBtn.addEventListener('click', async () => {
  const selected = selectedResults();
  if (selected.length < 2 || packaging) return;
  try {
    packaging = true;
    updateResultActions();
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const usedNames = new Set();
    for (const { file, result, job } of selected) {
      const base = baseName(file.name);
      const ext = (result.ext || 'jpg').toLowerCase();
      const actionSuffix = job.convertOnly ? 'converted' : 'compressed';
      let name = base + '_' + actionSuffix + '.' + ext;
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) {
        name = base + '_' + actionSuffix + '_' + suffix + '.' + ext;
        suffix++;
      }
      usedNames.add(name.toLowerCase());
      zip.file(name, result.blob);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tinypress-' + selected.length + '.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(t('zipDone', { n: selected.length }));
  } catch (err) {
    console.error('打包失败:', err);
    toast(err.message || t('zipFailGen'), true);
  } finally {
    packaging = false;
    updateResultActions();
  }
});

/* =====================================================================
 * 压缩核心
 * ===================================================================== */

/** HEIC/HEIF → PNG Blob（懒加载 heic2any WASM 解码器） */
let heicLib = null;
async function loadHeicLib() {
  if (heicLib) return heicLib;
  heicLib = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'heic2any.min.js';
    script.onload = () => resolve(window.heic2any);
    script.onerror = () => { heicLib = null; reject(new Error('HEIC 解码库加载失败')); };
    document.head.appendChild(script);
  });
  return heicLib;
}

async function isHeic(file) {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return mime.includes('heic') || mime.includes('heif') ||
    name.endsWith('.heic') || name.endsWith('.heif');
}

/** 解码为可绘制对象（HEIC 先转 PNG，其余走 ImageBitmap/Image） */
async function decodeImage(file) {
  if (await isHeic(file)) {
    const heic2any = await loadHeicLib();
    const out = await heic2any({
      blob: file,
      toType: 'image/png',
      quality: 1,
    });
    const pngBlob = Array.isArray(out) ? out[0] : out;
    try {
      return await createImageBitmap(pngBlob);
    } catch (_) {
      const img = new Image();
      const url = URL.createObjectURL(pngBlob);
      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('HEIC 解码失败'));
          img.src = url;
        });
        return img;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
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

/** 精确检测透明像素。分块读取，避免为大图额外分配整幅 RGBA 缓冲区。 */
function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function detectAlpha(bitmap, shouldCancel) {
  const TILE_SIZE = 512;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;

  let tilesRead = 0;
  for (let y = 0; y < bitmap.height; y += TILE_SIZE) {
    for (let x = 0; x < bitmap.width; x += TILE_SIZE) {
      throwIfCancelled(shouldCancel);
      const width = Math.min(TILE_SIZE, bitmap.width - x);
      const height = Math.min(TILE_SIZE, bitmap.height - y);
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) return true;
      }
      tilesRead++;
      if (tilesRead % 16 === 0) {
        await yieldToBrowser();
        throwIfCancelled(shouldCancel);
      }
    }
  }
  return false;
}

/** 压缩单个文件到目标大小以下。格式决策与搜索策略来自可测试的共享策略。 */
async function compressFile(file, job, hooks = {}) {
  const { shouldCancel } = hooks;
  throwIfCancelled(shouldCancel);
  const bitmap = await decodeImage(file);
  try {
    throwIfCancelled(shouldCancel);
    return await compressDecodedImage(file, job, bitmap, hooks);
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

async function compressDecodedImage(file, job, bitmap, hooks) {
  const { targetBytes, formatMode, convertOnly } = job;
  const { onDecoded, shouldCancel } = hooks;
  if (onDecoded) await onDecoded(bitmap);
  throwIfCancelled(shouldCancel);
  const srcMime = (file.type || '').toLowerCase();

  // AVIF 编码支持检测
  const supportsAvif = typeof HTMLCanvasElement !== 'undefined' &&
    document.createElement('canvas').toDataURL('image/avif').startsWith('data:image/avif');

  // 总像素预算只保护极端大图；常见 48MP 照片不再无条件缩到 4096px。
  const [width, height] = fitWithinCanvasBudget(bitmap.width, bitmap.height);
  const maxDimResized = width !== bitmap.width || height !== bitmap.height;

  // 原始格式来自 MIME，兜底文件扩展名。HEIF 的 PNG 只是解码中间格式，
  // 不能据此把照片当成 PNG 源图，否则自动模式会为保无损而过度降分辨率。
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
  // 例外：HEIC/HEIF 不是通用格式，即使达标也要重编码为常见格式
  const srcIsHeic = /heic|heif/i.test(srcMime) || /\.(heic|heif)$/i.test(file.name || '');
  if (!convertOnly && formatMode === 'auto' && file.size <= targetBytes && !srcIsHeic) {
    return {
      blob: file, width: bitmap.width, height: bitmap.height,
      ext: sourceExtensionForFile(file, srcFmt), quality: 1, kept: true,
    };
  }

  // 候选格式：普通图片从原格式开始；HEIF 优先高效率有损格式。
  const fmtMap = {
    jpeg: ['image/jpeg', 'jpg'],
    webp: ['image/webp', 'webp'],
    avif: ['image/avif', 'avif'],
    png: ['image/png', 'png'],
  };
  let candidates = [];
  if (formatMode === 'auto') {
    const hasAlpha = await detectAlpha(bitmap, shouldCancel);
    candidates = buildAutoCandidates({
      srcFormat: srcFmt,
      isHeif: srcIsHeic,
      hasAlpha,
      supportsAvif,
    });
  } else if (formatMode === 'avif') {
    // 显式 AVIF：不支持时明确回退 WebP
    candidates = [supportsAvif ? 'avif' : 'webp'];
  } else {
    candidates = [formatMode];
  }

  const makeEncode = (fmt) => {
    const mime = fmtMap[fmt][0];
    const fillWhite = mime === 'image/jpeg';
    return (w, h, quality) => new Promise((resolve, reject) => {
      if (shouldCancel && shouldCancel()) {
        reject(createAbortError());
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建图片画布'));
        return;
      }
      if (fillWhite) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (shouldCancel && shouldCancel()) {
          reject(createAbortError());
          return;
        }
        if (!blob) {
          reject(new Error('浏览器无法编码该图片格式'));
          return;
        }
        if (blob.type !== mime) {
          reject(new Error('浏览器不支持 ' + fmt.toUpperCase() + ' 编码'));
          return;
        }
        resolve(blob);
      }, mime, fmt === 'png' ? undefined : quality);
    });
  };

  // 仅格式转换：不限制体积，按目标格式全质量重编码。
  if (convertOnly) {
    const [fmt] = candidates;
    const [, ext] = fmtMap[fmt];
    const blob = await makeEncode(fmt)(width, height, 1);
    return {
      blob, size: blob.size, width, height, ext, quality: 1,
      resized: maxDimResized,
      converted: fmt !== srcFmt,
      convertOnly: true,
    };
  }

  // 比较候选时先保目标上限，再保分辨率和相对质量，不再偏爱更小文件。
  let preferred = null;
  for (let formatRank = 0; formatRank < candidates.length; formatRank++) {
    const fmt = candidates[formatRank];
    const ext = fmtMap[fmt][1];
    let r;
    try {
      r = fmt === 'png'
        ? await runLosslessCompression({ width, height, targetBytes, encode: makeEncode(fmt) })
        : await runLossyCompression({ format: fmt, width, height, targetBytes, encode: makeEncode(fmt) });
    } catch (err) {
      if (formatMode !== 'auto') throw err;
      console.warn('跳过不支持的编码格式:', fmt, err);
      continue;
    }
    if (!r) continue;

    const candidate = {
      ...r,
      format: fmt,
      formatRank,
      ext,
      resized: maxDimResized || r.width < bitmap.width || r.height < bitmap.height,
      converted: fmt !== srcFmt,
    };
    preferred = pickPreferredResult(preferred, candidate, targetBytes);
  }

  if (!preferred || preferred.size > targetBytes) {
    throw new Error(t('canNotReachTarget'));
  }
  return preferred;
}

/* ---------------- 提交反馈 ---------------- */
const feedbackModal = document.getElementById('feedbackModal');
const feedbackBtn = document.getElementById('feedbackBtn');
const feedbackText = document.getElementById('feedbackText');
const feedbackCancel = document.getElementById('feedbackCancel');
const feedbackSubmit = document.getElementById('feedbackSubmit');

function openFeedback() {
  feedbackModal.hidden = false;
  feedbackModal.classList.add('open');
  feedbackText.focus();
}
function closeFeedback() {
  feedbackModal.classList.remove('open');
  feedbackModal.hidden = true;
}

feedbackBtn.addEventListener('click', openFeedback);
feedbackCancel.addEventListener('click', closeFeedback);
feedbackModal.addEventListener('click', (e) => { if (e.target === feedbackModal) closeFeedback(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && feedbackModal.classList.contains('open')) closeFeedback();
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
    feedbackText.value = '';
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

/* ---------------- PWA: 注册 Service Worker ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
