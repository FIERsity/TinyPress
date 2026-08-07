// 模拟真实编码器: 体积随 quality 上升而增大, 随分辨率增大而增大(带噪声)
function mockEncodeFactory() {
  return (w, h, q) => {
    const pixels = w * h;
    const base = 0.35 + q * 2.2;                    // 每像素字节数(随质量)
    const bytes = pixels * base * (0.9 + Math.random() * 0.2);
    return Math.round(bytes);
  };
}

async function searchQuality(w, h, encodeBytes, target, maxQ = 1) {
  let lo = 0.03, hi = maxQ, best = null;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    const size = encodeBytes(w, h, mid);
    if (size <= target) { best = { size, quality: mid }; lo = mid + 0.02; }
    else hi = mid - 0.02;
  }
  return best;
}

const encode = mockEncodeFactory();
async function compress(origW, origH, target) {
  let width = origW, height = origH, resized = false;
  let r = await searchQuality(width, height, encode, target);
  if (r) return { ...r, width, height, resized };
  let w = Math.round(width * 0.8), h = Math.round(height * 0.8);
  while (w >= 8 && h >= 8) {
    const rr = await searchQuality(w, h, encode, target, 0.85);
    if (rr) return { ...rr, width: w, height: h, resized: true };
    w = Math.round(w * 0.8); h = Math.round(h * 0.8);
  }
  return { size: encode(w, h, 0.5), width: w, height: h, quality: 0.5, resized: true };
}

const cases = [
  [4000, 3000, 100*1024],   // 大图压到100KB
  [4000, 3000, 500*1024],
  [4000, 3000, 2048*1024],  // 2MB
  [1920, 1080, 100*1024],
  [800, 600, 50*1024],
  [12000, 8000, 200*1024],  // 超大图
  [500, 500, 20*1024],      // 很小目标
];
let fail = 0;
for (const [w, h, t] of cases) {
  for (let trial = 0; trial < 3; trial++) {
    const r = await compress(w, h, t);
    const ok = r.size <= t;
    if (!ok) fail++;
    console.log(`${ok ? '✅' : '❌'} ${w}×${h} -> 目标${(t/1024).toFixed(0)}KB | 结果 ${(r.size/1024).toFixed(1)}KB q=${r.quality.toFixed(2)} ${r.resized?'(降分辨率)':''} ${r.width}×${r.height}`);
  }
}
console.log(fail === 0 ? '\n🎉 全部通过: 所有结果均 ≤ 目标大小' : `\n💥 ${fail} 个失败`);
process.exit(fail === 0 ? 0 : 1);
