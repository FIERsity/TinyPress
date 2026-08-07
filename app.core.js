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
else if (formatMode === 'png') { effType = 'image/png'; ext = 'png'; }
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
const dimScale = Math.min(1, MAX_DIM / Math.max(width, height));
let resized = dimScale < 1;
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