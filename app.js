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