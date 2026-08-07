'use strict';
const state = {
targetBytes: 100 * 1024,
format: 'auto',
urlStore: [],
};
function fmtBytes(n) {
if (n < 1024) return `${n} B`;
if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function fmtPct(n) {
return `${Math.max(0, Math.round(n * 100))}%`;
}
function toast(msg, isErr = false) {
const el = document.getElementById('toast');
el.textContent = msg;
el.classList.toggle('err', isErr);
el.classList.add('show');
clearTimeout(toast._t);
toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
const presetBtns = document.getElementById('presetBtns');
const formatBtns = document.getElementById('formatBtns');
const customSize = document.getElementById('customSize');
const formatNote = document.getElementById('formatNote');
function loadSettings() {
try {
const s = JSON.parse(localStorage.getItem('tinypress:settings') || '{}');
if (s.kb) applyTarget(s.kb);
if (s.format) applyFormat(s.format);
} catch (_) {  }
}
function saveSettings() {
try {
localStorage.setItem('tinypress:settings', JSON.stringify({
kb: Math.round(state.targetBytes / 1024),
format: state.format,
}));
} catch (_) {  }
}
function applyTarget(kb) {
kb = Math.max(10, Math.min(102400, Math.round(Number(kb) || 100)));
state.targetBytes = kb * 1024;
[...presetBtns.children].forEach((b) => {
b.classList.toggle('active', Number(b.dataset.kb) === kb);
});
if (Number(customSize.value) !== kb) customSize.value = '';
saveSettings();
}
presetBtns.addEventListener('click', (e) => {
const btn = e.target.closest('.preset');
if (!btn) return;
applyTarget(Number(btn.dataset.kb));
});
customSize.addEventListener('change', () => {
const v = Number(customSize.value);
if (!v || v < 10) { customSize.value = ''; return; }
applyTarget(v);
toast(`目标大小已设为 ${fmtBytes(v * 1024)}`);
});
function applyFormat(fmt) {
state.format = fmt;
[...formatBtns.children].forEach((b) => b.classList.toggle('active', b.dataset.format === fmt));
const notes = {
auto: '自动：有透明背景 → WebP，否则 → JPEG（体积最小）',
jpeg: 'JPEG：照片类最合适，透明区域会填充白色',
webp: 'WebP：体积小、支持透明，现代浏览器均支持',
png: 'PNG：无损格式，只缩小分辨率不损失画质',
};
formatNote.textContent = notes[fmt] || '';
saveSettings();
}
formatBtns.addEventListener('click', (e) => {
const btn = e.target.closest('.preset');
if (!btn) return;
applyFormat(btn.dataset.format);
});
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const dropInner = document.getElementById('dropInner');
const results = document.getElementById('results');
const resultGrid = document.getElementById('resultGrid');
let processing = 0;
function setBusy(busy) {
dropzone.classList.toggle('busy', busy);
}
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', (e) => {
handleFiles([...e.target.files]);
e.target.value = '';
});
['dragenter', 'dragover'].forEach((ev) =>
dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
);
['dragleave', 'drop'].forEach((ev) =>
dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
);
dropzone.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));
function handleFiles(files) {
const imgs = files.filter((f) => f.type.startsWith('image/'));
if (!imgs.length) { toast('请选择图片文件', true); return; }
if (files.length !== imgs.length) toast(`已跳过 ${files.length - imgs.length} 个非图片文件`);
results.hidden = false;
processing += imgs.length;
setBusy(true);
imgs.forEach((file, i) => {
const card = createCard(file, i);
processOne(file, card).finally(() => {
processing -= 1;
if (processing <= 0) setBusy(false);
});
});
}
function createCard(file, index) {
const card = document.createElement('div');
card.className = 'result-card';
card.innerHTML = `
<img class="result-thumb" alt="" />
<div class="result-body">
<div class="result-name">
<span class="name">${escapeHtml(file.name)}</span>
<span class="state">压缩中…</span>
</div>
<div class="stat-row"><span>原始大小</span><b>${fmtBytes(file.size)}</b></div>
<div class="stat-row"><span>压缩后</span><b class="size-out">…</b></div>
<div class="stat-row"><span>节省空间</span><span class="saved">…</span></div>
<div class="stat-row"><span>尺寸</span><b class="dims">…</b></div>
<div class="stat-row"><span>质量</span><b class="quality">…</b></div>
<button class="btn-download" disabled>处理中…</button>
</div>`;
resultGrid.appendChild(card);
const url = URL.createObjectURL(file);
state.urlStore.push(url);
card.querySelector('.result-thumb').src = url;
return card;
}
function escapeHtml(s) {
return s.replace(/[&<>"']/g, (c) =>
({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function renderResult(card, file, r) {
const nameEl = card.querySelector('.name');
const stateEl = card.querySelector('.state');
const sizeOut = card.querySelector('.size-out');
const savedEl = card.querySelector('.saved');
const dimsEl = card.querySelector('.dims');
const qualityEl = card.querySelector('.quality');
const btn = card.querySelector('.btn-download');
dimsEl.textContent = `${r.width} × ${r.height}`;
qualityEl.textContent = r.kept ? '原图' : r.quality === 1 ? '无损' : `${Math.round(r.quality * 100)}%`;
if (r.kept) {
stateEl.textContent = '已达标';
stateEl.className = 'state ok';
sizeOut.textContent = fmtBytes(r.blob.size);
savedEl.textContent = '无需压缩';
btn.textContent = '下载原图';
} else {
const savedRatio = 1 - r.blob.size / file.size;
const underTarget = r.blob.size <= state.targetBytes;
stateEl.textContent = underTarget ? '压缩完成' : '尽力压缩';
stateEl.className = `state ${underTarget ? 'ok' : 'err'}`;
sizeOut.textContent = fmtBytes(r.blob.size);
savedEl.textContent = savedRatio > 0 ? `−${fmtPct(savedRatio)}` : '+0%';
if (r.resized) {
dimsEl.innerHTML = `${r.width} × ${r.height} <span class="warn">(已降分辨率)</span>`;
}
const base = file.name.replace(/\.[^.]+$/, '');
btn.textContent = `下载 ${r.ext.toUpperCase()}`;
btn.dataset.blobUrl = '';
}
const dl = () => {
const a = document.createElement('a');
a.href = URL.createObjectURL(r.blob);
a.download = file.name.replace(/\.[^.]+$/, '') + '_compressed.' + r.ext;
a.click();
setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
btn.disabled = false;
btn.onclick = dl;
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
async function searchQuality(w, h, encode, targetBytes, maxQ = 1) {
let lo = 0.03, hi = maxQ;
let best = null;
for (let i = 0; i < 9; i++) {
const mid = (lo + hi) / 2;
const blob = await encode(w, h, mid);
if (blob.size <= targetBytes) {
best = { blob, width: w, height: h, quality: mid };
lo = mid + 0.02;
} else {
hi = mid - 0.02;
}
}
return best;
}
async function compressFile(file, targetBytes, formatMode) {
const bitmap = await decodeImage(file);
let effType, ext;
if (formatMode === 'jpeg') { effType = 'image/jpeg'; ext = 'jpg'; }
else if (formatMode === 'webp') { effType = 'image/webp'; ext = 'webp'; }
else if (formatMode === 'png') { efffType = 'image/png'; ext = 'png'; }
else {
const hasAlpha = detectAlpha(bitmap);
const src = (file.type || '').toLowerCase();
const maybeTransparent = src.includes('png') || src.includes('gif') || src.includes('webp') || src.includes('svg');
if (hasAlpha && (maybeTransparent || src.includes('jpeg') === false)) {
effType = 'image/webp'; ext = 'webp';
} else {
effType = 'image/jpeg'; ext = 'jpg';
}
}
const MAX_DIM = 4096;
let width = bitmap.width, height = bitmap.height;
const dimScale = Math.min(1, MAX_DIM / Math.max(width, height));et resized = dimScale < 1;
width = Math.max(1, Math.round(width * dimScale));
height = Math.max(1, Math.round(height * dimScale));
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
if (file.size <= targetBytes && formatMode === 'auto') {
const m = file.name.match(/\.([a-z0-9]+)$/i);
return {
blob: file, width: bitmap.width, height: bitmap.height,
ext: m ? m[1].toLowerCase() : 'jpg', quality: 1, kept: true,
};
}
if (effType === 'image/png' && file.type === 'image/png' && file.size <= targetBytes) {
return { blob: file, width: bitmap.width, height: bitmap.height, ext: 'png', quality: 1, kept: true };
}
if (effType === 'image/png') {
let w = width, h = height;
for (let i = 0; i < 40; i++) {
const blob = await encode(w, h, 1);
if (blob.size <= targetBytes) return { blob, width: w, height: h, quality: 1, resized: resized || w < bitmap.width };
w = Math.max(1, Math.round(w * 0.85));
h = Math.max(1, Math.round(h * 0.85));
}
const blob = await encode(w, h, 1);
return { blob, width: w, height: h, quality: 1, resized: true };
}
let result = await searchQuality(width, height, encode, targetBytes);
if (result) return { ...result, resized };
let w = Math.round(width * 0.8), h = Math.round(height * 0.8);
while (w >= 8 && h >= 8) {
const r = await searchQuality(w, h, encode, targetBytes, 0.85);
if (r) return { ...r, resized: true };
w = Math.round(w * 0.8);
h = Math.round(h * 0.8);
}
const blob = await encode(Math.max(1, w), Math.max(1, h), 0.5);
return { blob, width: Math.max(1, w), height: Math.max(1, h), quality: 0.5, resized: true };
}
async function processOne(file, card) {
try {
const r = await compressFile(file, state.targetBytes, state.format);
renderResult(card, file, r);
} catch (err) {
console.error('压缩失败:', file.name, err);
renderError(card, file, err);
}
}
document.getElementById('clearAll').addEventListener('click', () => {
resultGrid.innerHTML = '';
results.hidden = true;
state.urlStore.forEach((u) => URL.revokeObjectURL(u));
state.urlStore = [];
});
loadSettings();