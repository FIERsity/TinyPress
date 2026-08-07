// 策略测试：镜像 app.js 中 compressFile / compressLossy 的算法
// - 有损：原尺寸二分质量 → 不达标按实测体积比例估算下一档分辨率
// - 自动格式：原格式 → WebP → AVIF/JPEG，保持不超上限且尽量落在区间内

const RANGE_RATIO = 0.15;

// 模拟编码器：体积随 quality 上升而增大、随分辨率增大而增大（带噪声）
function mockEncodeFactory(baseBpp) {
  return (w, h, q) => {
    const pixels = w * h;
    const base = baseBpp * (0.35 + q * 0.75);
    const bytes = pixels * base * (0.9 + Math.random() * 0.2);
    return Math.round(bytes);
  };
}

const encoders = {
  jpeg: mockEncodeFactory(0.32),
  webp: mockEncodeFactory(0.24),
  avif: mockEncodeFactory(0.16),
  png: mockEncodeFactory(1.4),
};

async function searchQuality(w, h, enc, target, maxQ = 1) {
  let lo = 0.04, hi = Math.max(0.04, maxQ), best = null, inRange = null, overMin = null;
  const minBytes = target * (1 - RANGE_RATIO);
  const step = Math.max(0.001, Math.min(0.02, (hi - lo) / 8));
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const size = enc(w, h, mid);
    const entry = { size, quality: mid };
    if (!overMin || mid < overMin.quality) overMin = entry;
    if (size <= target) {
      best = entry;
      if (size >= minBytes) inRange = entry;
      lo = mid + step;
    } else hi = mid - step;
  }
  return inRange || best || overMin;
}

function nextDim(w, h, measured, target) {
  const ratio = Math.sqrt(Math.max(measured, 1) / target);
  const scale = Math.max(0.4, Math.min(0.92, ratio));
  const MIN_DIM = 16;
  return [Math.max(MIN_DIM, Math.round(w * scale)), Math.max(MIN_DIM, Math.round(h * scale))];
}

async function compressLossy(fmt, origW, origH, target) {
  const enc = encoders[fmt];
  let w = origW, h = origH;
  let best = null;

  for (let i = 0; i < 30; i++) {
    const r = await searchQuality(w, h, enc, target, 1);
    if (r.size <= target && (!best || r.size < best.size)) best = { ...r, width: w, height: h };
    if (r.size >= target * (1 - RANGE_RATIO) && r.size <= target) return { ...r, width: w, height: h };
    if (w <= 16 || h <= 16) break;
    [w, h] = nextDim(w, h, r.size, target);
  }
  return best;
}

async function compress(origW, origH, target, srcFmt) {
  const candidates = [];
  if (srcFmt) candidates.push(srcFmt);
  if (srcFmt !== 'webp') candidates.push('webp');
  if (srcFmt !== 'avif') candidates.push('avif');
  if (srcFmt !== 'jpeg') candidates.push('jpeg');

  let globalBest = null, globalFeasible = null;
  for (const fmt of candidates) {
    const r = await compressLossy(fmt, origW, origH, target);
    if (!r) continue;
    if (!globalBest || r.size < globalBest.size) globalBest = { ...r, fmt };
    if (r.size >= target * (1 - RANGE_RATIO) && r.size <= target) {
      if (!globalFeasible || r.size > globalFeasible.size) globalFeasible = { ...r, fmt };
      if (fmt === candidates[0]) return globalFeasible;
    }
  }
  return globalFeasible || globalBest;
}

const cases = [
  ['jpeg', 4000, 3000, 100 * 1024],
  ['jpeg', 4000, 3000, 500 * 1024],
  ['jpeg', 4000, 3000, 2048 * 1024],
  ['webp', 1920, 1080, 100 * 1024],
  ['png', 800, 600, 50 * 1024],
  ['jpeg', 12000, 8000, 200 * 1024],
  ['jpeg', 500, 500, 20 * 1024],
  ['avif', 3000, 2000, 300 * 1024],
  ['webp', 2000, 1500, 150 * 1024],
  ['png', 2000, 1500, 150 * 1024],
];
let fail = 0, inRangeCount = 0, overCount = 0;
for (const [srcFmt, w, h, t] of cases) {
  for (let trial = 0; trial < 3; trial++) {
    const r = await compress(w, h, t, srcFmt);
    if (!r) { console.log(`❌ ${srcFmt} ${w}×${h} 无结果`); fail++; continue; }
    const minOk = r.size >= t * (1 - RANGE_RATIO);
    const maxOk = r.size <= t;
    if (!maxOk) fail++;
    if (minOk && maxOk) inRangeCount++;
    if (!maxOk) overCount++;
    const near = minOk ? '区间内' : (maxOk ? '达标但低于区间' : '超限');
    console.log(`${maxOk ? '✅' : '❌'} ${srcFmt} ${w}×${h} -> 目标${(t / 1024).toFixed(0)}KB | ${(r.size / 1024).toFixed(1)}KB ${near} q=${r.quality.toFixed(2)} fmt=${r.fmt} ${r.width}×${r.height}`);
  }
}
console.log('');
console.log(`区间内: ${inRangeCount}/30, 超限: ${overCount}/30`);
if (fail === 0 && inRangeCount >= 24) {
  console.log('🎉 全部通过：结果均 ≤ 目标，且 ≥80% 落在区间内');
  process.exit(0);
} else {
  console.log(`💥 ${fail} 个超限失败（区间内 ${inRangeCount}/30）`);
  process.exit(1);
}
