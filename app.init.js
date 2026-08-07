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