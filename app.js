'use strict';

/* =====================================================================
 * 图压 TinyPress - 纯前端图片压缩
 * 流程：上传图片 → 选择目标大小/输出格式 → 点「压缩」→ 显示结果
 * 全程本地处理，图片不上传任何服务器。
 * ===================================================================== */

/* ---------------- 状态 ---------------- */
const state = {
  targetBytes: 100 * 1024, // 默认 100KB
  format: 'auto',          // auto | jpeg | webp | png
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

/* ---------------- 设置区 ---------------- */
const presetBtns = document.getElementById('presetBtns');
const customSize = document.getElementById('customSize');
const formatBtns = document.getElementById('formatBtns');
const formatNote = document.getElementById('formatNote');

function setTarget(kb) {
  kb = Math.max(10, Math.min(102400, Math.round(Number(kb) || 100)));
  state.targetBytes = kb * 1024;
  [...presetBtns.children].forEach((b) =>
    b.classList.toggle('active', Number(b.dataset.kb) === kb));
  if (String(customSize.value) !== String(kb)) customSize.value = '';
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
  const notes = {
    auto: '自动：优先 AVIF（体积最小），不支持时 → WebP / JPEG',
    jpeg: 'JPEG：照片类最合适，透明区域会填充白色',
    webp: 'WebP：体积小、支持透明',
    avif: 'AVIF：当前压缩率最好的格式，浏览器不支持时自动回退',
    png: 'PNG：无损格式，只缩小分辨率不损失画质',
  };
  formatNote.textContent = notes[fmt] || '';
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

function handleFiles(files) {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) { toast('请选择图片文件', true); return; }
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
    ? '已选 ' + state.files.length + ' 张，共 ' + fmtBytes(total)
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
  compressBtn.textContent = '压缩中…';

  const files = state.files.slice();
  const target = state.targetBytes;
  const format = state.format;
  state.files = [];
  renderFileList();

  results.hidden = false;
  for (const file of files) {
    const card = createCard(file);
    try {
      const r = await compressFile(file, target, format);
      renderResult(card, file, r);
    } catch (err) {
      console.error('压缩失败:', file.name, err);
      renderError(card, file, err);
    }
  }

  state.processing = false;
  updateCompressBtn();
  compressBtn.textContent = '压缩';
});

/* ---------------- 结果卡片 ---------------- */
function createCard(file) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML =
    '<img class="result-thumb" alt="" />' +
    '<div class="result-body">' +
      '<div class="result-name"><span class="name">' + escapeHtml(file.name) + '</span><span class="state">压缩中…</span></div>' +
      '<div class="stat-row"><span>原始大小</span><b>' + fmtBytes(file.size) + '</b></div>' +
      '<div class="stat-row"><span>压缩后</span><b class="size-out">…</b></div>' +
      '<div class="stat-row"><span>节省空间</span><span class="saved">…</span></div>' +
      '<div class="stat-row"><span>尺寸</span><b class="dims">…</b></div>' +
      '<div class="stat-row"><span>质量</span><b class="quality">…</b></div>' +
      '<button class="btn-download" disabled>处理中…</button>' +
    '</div>';
  resultGrid.appendChild(card);

  const url = URL.createObjectURL(file);
  card.querySelector('.result-thumb').src = url;
  return card;
}

function renderResult(card, file, r) {
  const nameEl = card.querySelector('.name');
  const stateEl = card.querySelector('.state');
  const sizeOut = card.querySelector('.size-out');
  const savedEl = card.querySelector('.saved');
  const dimsEl = card.querySelector('.dims');
  const qualityEl = card.querySelector('.quality');
  const btn = card.querySelector('.btn-download');

  dimsEl.textContent = r.width + ' × ' + r.height;
  qualityEl.textContent = r.kept ? '原图' : r.quality === 1 ? '无损' : Math.round(r.quality * 100) + '%';

  const base = file.name.replace(/\.[^.]+$/, '');
  const ext = (r.ext || 'jpg').toLowerCase();

  if (r.kept) {
    stateEl.textContent = '无需压缩';
    stateEl.className = 'state ok';
    sizeOut.textContent = fmtBytes(r.blob.size);
    savedEl.textContent = '已达标';
    btn.textContent = '下载原图';
  } else {
    const savedRatio = 1 - r.blob.size / file.size;
    const underTarget = r.blob.size <= state.targetBytes;
    const inRange = r.blob.size >= state.targetBytes * (1 - RANGE_RATIO);
    stateEl.textContent = inRange ? '压缩完成' : (underTarget ? '已达标' : '尽力压缩');
    stateEl.className = 'state ' + (underTarget ? 'ok' : 'err');
    if (state.format === 'avif' && r.ext !== 'avif') {
      stateEl.textContent += '（浏览器不支持 AVIF，已用 ' + r.ext.toUpperCase() + '）';
    }
    sizeOut.textContent = fmtBytes(r.blob.size);
    savedEl.textContent = savedRatio > 0 ? '−' + fmtPct(savedRatio) : '+0%';
    if (r.resized) {
      dimsEl.innerHTML = r.width + ' × ' + r.height + ' <span class="warn">(已降分辨率)</span>';
    }
    btn.textContent = '下载 ' + ext.toUpperCase();
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
  card.querySelector('.state').textContent = '失败';
  card.querySelector('.state').className = 'state err';
  card.querySelector('.size-out').textContent = '—';
  card.querySelector('.saved').textContent = err.message || String(err);
  const btn = card.querySelector('.btn-download');
  btn.textContent = '无法处理';
  btn.disabled = true;
}

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
 */
const RANGE_RATIO = 0.15; // 区间宽度：目标值的 ±15% 以内视为达标

async function searchQuality(w, h, encode, targetBytes, maxQ = 1) {
  let lo = 0.04, hi = maxQ;
  let best = null;      // 不超上限的最高质量
  let inRange = null;   // 落在区间内的最高质量
  const minBytes = targetBytes * (1 - RANGE_RATIO);
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const blob = await encode(w, h, mid);
    if (blob.size <= targetBytes) {
      best = { blob, width: w, height: h, quality: mid, size: blob.size };
      if (blob.size >= minBytes) inRange = best;
      lo = mid + 0.02;
    } else {
      hi = mid - 0.02;
    }
  }
  return inRange || best;
}

/** 压缩单个文件到目标大小以下。所有返回路径均携带 ext。 */
async function compressFile(file, targetBytes, formatMode) {
  const bitmap = await decodeImage(file);

  // 决定输出格式与扩展名
  const supportsAvif = typeof HTMLCanvasElement !== 'undefined' &&
    document.createElement('canvas').toDataURL('image/avif').startsWith('data:image/avif');
  let effType, ext;
  if (formatMode === 'jpeg') { effType = 'image/jpeg'; ext = 'jpg'; }
  else if (formatMode === 'webp') { effType = 'image/webp'; ext = 'webp'; }
  else if (formatMode === 'png') { effType = 'image/png'; ext = 'png'; }
  else if (formatMode === 'avif') {
    if (supportsAvif) { effType = 'image/avif'; ext = 'avif'; }
    else { effType = 'image/webp'; ext = 'webp'; } // 不支持 AVIF → 明确回退 WebP
  }
  else {
    const hasAlpha = detectAlpha(bitmap);
    const src = (file.type || '').toLowerCase();
    const maybeTransparent = src.includes('png') || src.includes('gif') || src.includes('webp') || src.includes('svg');
    if (supportsAvif) {
      effType = 'image/avif'; ext = 'avif';
    } else if (hasAlpha && (maybeTransparent || !src.includes('jpeg'))) {
      effType = 'image/webp'; ext = 'webp';
    } else {
      effType = 'image/jpeg'; ext = 'jpg';
    }
  }

  // 尺寸上限保护（超大图先归一化，避免 Canvas 内存溢出）
  const MAX_DIM = 4096;
  let width = bitmap.width, height = bitmap.height;
  const dimScale = Math.min(1, MAX_DIM / Math.max(width, height));
  let resized = dimScale < 1;
  width = Math.max(1, Math.round(width * dimScale));
  height = Math.max(1, Math.round(height * dimScale));

  // 编码器（JPEG 填白底）
  const fillWhite = effType === 'image/jpeg';
  const encode = (w, h, quality) => new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (fillWhite) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    canvas.toBlob((blob) => resolve(blob), effType, effType === 'image/png' ? undefined : quality);
  });

  // 原图已达标：自动格式下直接返回原文件
  if (file.size <= targetBytes && formatMode === 'auto') {
    const m = file.name.match(/\.([a-z0-9]+)$/i);
    return {
      blob: file, width: bitmap.width, height: bitmap.height,
      ext: m ? m[1].toLowerCase() : 'jpg', quality: 1, kept: true,
    };
  }
  // PNG 无损模式：原图达标也直接保留
  if (effType === 'image/png' && file.type === 'image/png' && file.size <= targetBytes) {
    return { blob: file, width: bitmap.width, height: bitmap.height, ext: 'png', quality: 1, kept: true };
  }

  // 无损 PNG：只缩小分辨率
  if (effType === 'image/png') {
    let w = width, h = height;
    for (let i = 0; i < 40; i++) {
      const blob = await encode(w, h, 1);
      if (blob.size <= targetBytes) return { blob, width: w, height: h, quality: 1, ext, resized: resized || w < bitmap.width };
      w = Math.max(1, Math.round(w * 0.85));
      h = Math.max(1, Math.round(h * 0.85));
    }
    const blob = await encode(w, h, 1);
    return { blob, width: w, height: h, quality: 1, ext, resized: true };
  }

  // 有损 JPEG/WebP/AVIF：二分搜索质量（优先落在目标区间内）
  let result = await searchQuality(width, height, encode, targetBytes);
  if (result) return { ...result, ext, resized };

  // 质量到底仍超目标 → 逐步缩小分辨率（质量上限保持 1.0，不再人为限制）
  let w = Math.round(width * 0.8), h = Math.round(height * 0.8);
  while (w >= 8 && h >= 8) {
    const r = await searchQuality(w, h, encode, targetBytes, 1);
    if (r) return { ...r, ext, resized: true };
    w = Math.round(w * 0.8);
    h = Math.round(h * 0.8);
  }
  const blob = await encode(Math.max(1, w), Math.max(1, h), 0.5);
  return { blob, width: Math.max(1, w), height: Math.max(1, h), quality: 0.5, ext, resized: true };
}

/* ---------------- 清空 ---------------- */
document.getElementById('clearAll').addEventListener('click', () => {
  resultGrid.innerHTML = '';
  results.hidden = true;
});

/* ---------------- PWA: 注册 Service Worker ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
