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