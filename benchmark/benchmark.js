'use strict';

const Policy = globalThis.TinyPressCompressionPolicy;
const Metrics = globalThis.TinyPressBenchmarkMetrics;
const {
  MAX_CANVAS_DIMENSION,
  MAX_CANVAS_PIXELS,
  QUALITY_FLOORS,
  buildAutoCandidates,
  compressLossless,
  compressLossy,
  fitWithinCanvasBudget,
  isSupportedImageFile,
  pickPreferredResult,
} = Policy;

const elements = {
  fileInput: document.getElementById('fileInput'),
  resetSamples: document.getElementById('resetSamples'),
  sampleList: document.getElementById('sampleList'),
  run: document.getElementById('runBenchmark'),
  cancel: document.getElementById('cancelBenchmark'),
  export: document.getElementById('exportResults'),
  progress: document.getElementById('progress'),
  status: document.getElementById('status'),
  summary: document.getElementById('summary'),
  resultRows: document.getElementById('resultRows'),
  trialCount: document.getElementById('trialCount'),
  avifFormat: document.getElementById('avifFormat'),
  avifOption: document.getElementById('avifOption'),
};

const FORMAT_MAP = Object.freeze({
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
});
const METRIC_MAX_DIMENSION = 512;
const GENERATOR_VERSION = 2;
const IMPLEMENTATION_ID = 'canvas-policy-v1';
const state = {
  samples: [],
  results: [],
  running: false,
  cancelled: false,
  supportsAvif: false,
  lastTrialCount: 0,
};
let sampleSequence = 0;

function setStatus(message) {
  elements.status.textContent = message;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '—';
  return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(2)} s`;
}

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function addSample(file, kind) {
  state.samples.push({ id: ++sampleSequence, file, kind });
}

function invalidateResults() {
  state.results = [];
  elements.progress.value = 0;
  elements.export.disabled = true;
  renderResults();
  updateSummary();
}

function renderSamples() {
  elements.sampleList.replaceChildren();
  for (const sample of state.samples) {
    const item = document.createElement('div');
    item.className = 'sample-item';

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'sample-name';
    name.textContent = sample.file.name;
    name.title = sample.file.name;
    const meta = document.createElement('div');
    meta.className = 'sample-meta';
    meta.textContent = `${sample.kind === 'synthetic' ? '合成 / Synthetic' : '本地 / Local'} · ${formatBytes(sample.file.size)}`;
    info.append(name, meta);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = '移除 / Remove';
    remove.setAttribute('aria-label', `移除 ${sample.file.name}`);
    remove.disabled = state.running;
    remove.addEventListener('click', () => {
      state.samples = state.samples.filter((entry) => entry.id !== sample.id);
      invalidateResults();
      renderSamples();
    });

    item.append(info, remove);
    elements.sampleList.append(item);
  }
}

function canvasToFile(canvas, name, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== type) {
        reject(new Error(`无法生成合成样本 ${name}`));
        return;
      }
      resolve(new File([blob], name, { type }));
    }, type, quality);
  });
}

function makePhotoTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#91bad4');
  sky.addColorStop(0.48, '#d8c7a4');
  sky.addColorStop(1, '#3f5944');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#526b5a';
  ctx.beginPath();
  ctx.moveTo(0, 980);
  for (let x = 0; x <= canvas.width; x += 80) {
    ctx.lineTo(x, 850 + 120 * Math.sin(x * 0.006) + 45 * Math.sin(x * 0.019));
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.fill();

  ctx.fillStyle = '#d7d0bd';
  ctx.fillRect(230, 770, 460, 430);
  ctx.fillStyle = '#7d483b';
  ctx.beginPath();
  ctx.moveTo(170, 790);
  ctx.lineTo(460, 570);
  ctx.lineTo(750, 790);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#406579';
  for (let y = 840; y < 1110; y += 100) {
    for (let x = 285; x < 640; x += 120) ctx.fillRect(x, y, 62, 70);
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let random = 0x6d2b79f5;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    const noise = ((random >>> 0) % 19) - 9;
    image.data[offset] = Math.max(0, Math.min(255, image.data[offset] + noise));
    image.data[offset + 1] = Math.max(0, Math.min(255, image.data[offset + 1] + noise));
    image.data[offset + 2] = Math.max(0, Math.min(255, image.data[offset + 2] + noise));
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function makeFineDetail() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f8f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < canvas.width; x += 8) {
    ctx.fillStyle = x % 32 === 0 ? '#1d3557' : '#b8c2cc';
    ctx.fillRect(x, 0, x % 32 === 0 ? 2 : 1, 720);
  }
  for (let y = 0; y < 720; y += 8) {
    ctx.fillStyle = y % 32 === 0 ? '#8f3d45' : '#c6ced5';
    ctx.fillRect(0, y, 1024, y % 32 === 0 ? 2 : 1);
  }

  ctx.lineWidth = 2;
  for (let offset = -700; offset < 2200; offset += 13) {
    ctx.strokeStyle = offset % 39 === 0 ? '#c03d2e' : '#213547';
    ctx.beginPath();
    ctx.moveTo(offset, 760);
    ctx.lineTo(offset + 760, 1520);
    ctx.stroke();
  }

  for (let y = 90; y < 1450; y += 82) {
    for (let x = 1080; x < 1990; x += 58) {
      const index = Math.floor(x / 58) + Math.floor(y / 82);
      ctx.fillStyle = index % 3 === 0 ? '#1769aa' : index % 3 === 1 ? '#243849' : '#c03d2e';
      ctx.fillRect(x, y, 34 + (index % 4) * 4, 10 + (index % 5) * 3);
      ctx.fillStyle = '#d5dbe1';
      ctx.fillRect(x, y + 30, 42, 3);
    }
  }
  for (let size = 260; size >= 28; size -= 22) {
    ctx.strokeStyle = size % 44 === 0 ? '#162c40' : '#c4473d';
    ctx.lineWidth = size % 44 === 0 ? 3 : 1;
    ctx.strokeRect(1450 - size / 2, 1160 - size / 2, size, size);
  }
  return canvas;
}

function makeTransparency() {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 18; i++) {
    const x = 120 + (i % 6) * 270;
    const y = 120 + Math.floor(i / 6) * 360;
    const gradient = ctx.createRadialGradient(x, y, 20, x, y, 145);
    gradient.addColorStop(0, `rgba(${35 + i * 9}, ${150 - i * 3}, ${210 - i * 4}, 0.92)`);
    gradient.addColorStop(0.65, `rgba(${190 - i * 5}, ${55 + i * 6}, ${90 + i * 3}, 0.5)`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, 145, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(28, 42, 58, 0.78)';
  ctx.lineWidth = 8;
  ctx.strokeRect(72, 72, 1456, 1056);
  for (let y = 420; y <= 780; y += 72) {
    for (let x = 410; x <= 1190; x += 78) {
      ctx.fillStyle = (x + y) % 144 === 0
        ? 'rgba(20, 30, 45, 0.72)'
        : 'rgba(230, 238, 245, 0.38)';
      ctx.fillRect(x, y, 46, 46);
    }
  }
  return canvas;
}

async function resetSyntheticSamples() {
  if (state.running) return;
  elements.resetSamples.disabled = true;
  setStatus('正在生成合成样本 / Generating synthetic samples');
  try {
    const localSamples = state.samples.filter((sample) => sample.kind === 'local');
    const synthetic = await Promise.all([
      canvasToFile(makePhotoTexture(), 'synthetic-photo-texture.jpg', 'image/jpeg', 0.95),
      canvasToFile(makeFineDetail(), 'synthetic-fine-detail.webp', 'image/webp', 1),
      canvasToFile(makeTransparency(), 'synthetic-transparency.png', 'image/png'),
    ]);
    state.samples = localSamples;
    for (const file of synthetic) addSample(file, 'synthetic');
    invalidateResults();
    renderSamples();
    setStatus('合成样本已就绪 / Synthetic samples ready');
  } catch (error) {
    console.error(error);
    setStatus(`样本生成失败 / Sample generation failed: ${error.message}`);
  } finally {
    elements.resetSamples.disabled = false;
  }
}

function fileIsHeif(file) {
  return /heic|heif/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
}

function sourceFormat(file) {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpeg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/avif') return 'avif';
  const match = (file.name || '').match(/\.([a-z0-9]+)$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg';
  return ['png', 'webp', 'avif'].includes(extension) ? extension : null;
}

async function decodeFile(file) {
  let blob = file;
  if (fileIsHeif(file)) {
    const converted = await globalThis.heic2any({ blob: file, toType: 'image/png', quality: 1 });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }
  try {
    return await createImageBitmap(blob);
  } catch (_) {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Image decode failed'));
        image.src = url;
      });
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function detectAlpha(bitmap) {
  const tileSize = 512;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;

  for (let y = 0; y < bitmap.height; y += tileSize) {
    for (let x = 0; x < bitmap.width; x += tileSize) {
      const width = Math.min(tileSize, bitmap.width - x);
      const height = Math.min(tileSize, bitmap.height - y);
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] < 255) return true;
      }
    }
  }
  return false;
}

function makeEncoder(bitmap, format) {
  const mime = FORMAT_MAP[format];
  const fillWhite = format === 'jpeg';
  return (width, height, quality) => new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context unavailable'));
      return;
    }
    if (fillWhite) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== mime) {
        reject(new Error(`${format.toUpperCase()} encoding unsupported`));
        return;
      }
      resolve(blob);
    }, mime, format === 'png' ? undefined : quality);
  });
}

async function compressCase(source, requestedFormat, targetBytes) {
  const { file, bitmap, format: srcFormat, isHeif, hasAlpha } = source;
  const [width, height] = fitWithinCanvasBudget(bitmap.width, bitmap.height);

  if (requestedFormat === 'auto' && file.size <= targetBytes && !isHeif) {
    return {
      blob: file,
      size: file.size,
      width: bitmap.width,
      height: bitmap.height,
      quality: 1,
      format: srcFormat || file.type.replace('image/', '') || 'source',
      kept: true,
    };
  }

  let candidates;
  if (requestedFormat === 'auto') {
    candidates = buildAutoCandidates({
      srcFormat,
      isHeif,
      hasAlpha,
      supportsAvif: state.supportsAvif,
    });
  } else if (requestedFormat === 'avif') {
    if (!state.supportsAvif) throw new Error('AVIF Canvas encoding unsupported');
    candidates = ['avif'];
  } else {
    candidates = [requestedFormat];
  }

  let preferred = null;
  for (let formatRank = 0; formatRank < candidates.length; formatRank++) {
    const format = candidates[formatRank];
    try {
      const result = format === 'png'
        ? await compressLossless({ width, height, targetBytes, encode: makeEncoder(bitmap, format) })
        : await compressLossy({ format, width, height, targetBytes, encode: makeEncoder(bitmap, format) });
      if (!result) continue;
      const candidate = { ...result, format, formatRank };
      preferred = requestedFormat === 'auto'
        ? pickPreferredResult(preferred, candidate, targetBytes)
        : candidate;
    } catch (error) {
      if (requestedFormat !== 'auto') throw error;
      console.warn(`Skipping ${format}:`, error);
    }
  }

  if (!preferred) throw new Error('No supported output format');
  return preferred;
}

function imageDataAtMetricSize(bitmap, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

async function measureOutput(referenceBitmap, output) {
  const outputBitmap = await decodeFile(output.blob);
  try {
    const scale = Math.min(1, METRIC_MAX_DIMENSION / Math.max(referenceBitmap.width, referenceBitmap.height));
    const width = Math.max(1, Math.round(referenceBitmap.width * scale));
    const height = Math.max(1, Math.round(referenceBitmap.height * scale));
    const reference = imageDataAtMetricSize(referenceBitmap, width, height);
    const candidate = imageDataAtMetricSize(outputBitmap, width, height);
    const white = Metrics.calculateMetrics(reference, candidate, width, height, {
      background: [255, 255, 255],
    });
    const black = Metrics.calculateMetrics(reference, candidate, width, height, {
      background: [0, 0, 0],
    });
    return {
      psnr: Math.min(white.psnr, black.psnr),
      ssim: Math.min(white.ssim, black.ssim),
      alphaRmse: white.alphaRmse,
      whitePsnr: white.psnr,
      blackPsnr: black.psnr,
      whiteSsim: white.ssim,
      blackSsim: black.ssim,
      metricWidth: width,
      metricHeight: height,
    };
  } finally {
    if (typeof outputBitmap.close === 'function') outputBitmap.close();
  }
}

function selectedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function rounded(value, digits) {
  return Number(value.toFixed(digits));
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)];
}

function makeResultRow(sample, source, requestedFormat, targetBytes, output, metrics, timing, metricMs) {
  return {
    sample: sample.file.name,
    sampleKind: sample.kind,
    sourceType: sample.file.type || null,
    sourceSha256: source.sha256,
    sourceBytes: sample.file.size,
    sourceWidth: source.bitmap.width,
    sourceHeight: source.bitmap.height,
    targetBytes,
    requestedFormat,
    outputFormat: output.format,
    outputMime: output.blob.type || null,
    actualBytes: output.size,
    outputWidth: output.width,
    outputHeight: output.height,
    pixelRetention: rounded((output.width * output.height) / (source.bitmap.width * source.bitmap.height), 4),
    quality: rounded(output.quality, 4),
    keptOriginal: Boolean(output.kept),
    psnrDb: Number.isFinite(metrics.psnr) ? rounded(metrics.psnr, 3) : 'Infinity',
    ssim: rounded(metrics.ssim, 6),
    whitePsnrDb: Number.isFinite(metrics.whitePsnr) ? rounded(metrics.whitePsnr, 3) : 'Infinity',
    blackPsnrDb: Number.isFinite(metrics.blackPsnr) ? rounded(metrics.blackPsnr, 3) : 'Infinity',
    whiteSsim: rounded(metrics.whiteSsim, 6),
    blackSsim: rounded(metrics.blackSsim, 6),
    alphaRmse: rounded(metrics.alphaRmse, 3),
    metricWidth: metrics.metricWidth,
    metricHeight: metrics.metricHeight,
    warmupMs: rounded(timing.warmupMs, 1),
    encodeTrialsMs: timing.trials.map((value) => rounded(value, 1)),
    encodeMedianMs: rounded(percentile(timing.trials, 0.5), 1),
    encodeP95Ms: rounded(percentile(timing.trials, 0.95), 1),
    metricMs: rounded(metricMs, 1),
    status: output.size <= targetBytes ? 'ok' : 'over-target',
  };
}

function makeErrorRow(sample, source, requestedFormat, targetBytes, error, elapsedMs) {
  return {
    sample: sample.file.name,
    sampleKind: sample.kind,
    sourceType: sample.file.type || null,
    sourceSha256: source?.sha256 ?? null,
    sourceBytes: sample.file.size,
    sourceWidth: source?.bitmap.width ?? null,
    sourceHeight: source?.bitmap.height ?? null,
    targetBytes,
    requestedFormat,
    status: 'error',
    error: error.message,
    elapsedMs: rounded(elapsedMs, 1),
  };
}

function appendCell(row, text, className = '') {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (className) cell.className = className;
  row.append(cell);
}

function renderResults() {
  elements.resultRows.replaceChildren();
  if (state.results.length === 0) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 13;
    cell.textContent = '—';
    row.append(cell);
    elements.resultRows.append(row);
    return;
  }

  for (const result of state.results) {
    const row = document.createElement('tr');
    if (result.status === 'error') row.className = 'error';
    appendCell(row, result.sample);
    appendCell(row, formatBytes(result.targetBytes));
    appendCell(row, result.requestedFormat.toUpperCase());
    appendCell(row, result.outputFormat?.toUpperCase() || '—');
    appendCell(row, formatBytes(result.actualBytes));
    appendCell(row, result.outputWidth ? `${result.outputWidth} × ${result.outputHeight}` : '—');
    appendCell(row, Number.isFinite(result.pixelRetention) ? `${(result.pixelRetention * 100).toFixed(1)}%` : '—');
    appendCell(row, Number.isFinite(result.quality) ? `${(result.quality * 100).toFixed(1)}%` : '—');
    appendCell(row, result.psnrDb === 'Infinity' ? '∞' : result.psnrDb ?? '—');
    appendCell(row, result.ssim ?? '—');
    appendCell(row, result.alphaRmse ?? '—');
    appendCell(row, formatDuration(result.encodeMedianMs));
    const statusText = result.status === 'ok'
      ? '达标 / OK'
      : result.status === 'over-target'
        ? '超限 / Over'
        : `错误 / Error: ${result.error}`;
    appendCell(row, statusText, result.status === 'ok' ? 'status-ok' : 'status-over');
    elements.resultRows.append(row);
  }
}

function updateSummary() {
  if (state.results.length === 0) {
    elements.summary.textContent = '尚未运行 / Not run';
    return;
  }
  const ok = state.results.filter((result) => result.status === 'ok').length;
  const over = state.results.filter((result) => result.status === 'over-target').length;
  const errors = state.results.filter((result) => result.status === 'error').length;
  elements.summary.textContent = `${state.results.length} cases · ${ok} OK · ${over} over · ${errors} errors`;
}

function setRunning(running) {
  state.running = running;
  elements.run.disabled = running;
  elements.cancel.disabled = !running;
  elements.export.disabled = running || state.results.length === 0;
  elements.fileInput.disabled = running;
  elements.resetSamples.disabled = running;
  elements.trialCount.disabled = running;
  renderSamples();
}

async function runBenchmark() {
  const targets = selectedValues('target').map(Number);
  const formats = selectedValues('format');
  const trialCount = Number(elements.trialCount.value);
  if (state.samples.length === 0 || targets.length === 0 || formats.length === 0) {
    setStatus('请选择样本、目标和格式 / Select samples, targets, and formats');
    return;
  }

  state.cancelled = false;
  state.results = [];
  state.lastTrialCount = trialCount;
  const total = state.samples.length * targets.length * formats.length;
  let completed = 0;
  elements.progress.max = total;
  elements.progress.value = 0;
  renderResults();
  updateSummary();
  setRunning(true);

  try {
    for (const sample of state.samples) {
      if (state.cancelled) break;
      let bitmap;
      try {
        bitmap = await decodeFile(sample.file);
      } catch (error) {
        for (const targetBytes of targets) {
          for (const requestedFormat of formats) {
            state.results.push(makeErrorRow(sample, null, requestedFormat, targetBytes, error, 0));
            completed++;
          }
        }
        elements.progress.value = completed;
        renderResults();
        updateSummary();
        continue;
      }

      const source = {
        file: sample.file,
        bitmap,
        format: sourceFormat(sample.file),
        isHeif: fileIsHeif(sample.file),
        hasAlpha: detectAlpha(bitmap),
        sha256: sample.kind === 'synthetic' ? await sha256(sample.file) : null,
      };

      try {
        for (const targetBytes of targets) {
          for (const requestedFormat of formats) {
            if (state.cancelled) break;
            setStatus(`${completed + 1}/${total} · ${sample.file.name} · ${formatBytes(targetBytes)} · ${requestedFormat.toUpperCase()}`);
            const caseStarted = performance.now();
            try {
              const warmupStarted = performance.now();
              let output = await compressCase(source, requestedFormat, targetBytes);
              const warmupMs = performance.now() - warmupStarted;
              const trials = [];
              for (let trial = 0; trial < trialCount; trial++) {
                const trialStarted = performance.now();
                output = await compressCase(source, requestedFormat, targetBytes);
                trials.push(performance.now() - trialStarted);
              }
              const metricStarted = performance.now();
              const metrics = await measureOutput(bitmap, output);
              const metricMs = performance.now() - metricStarted;
              state.results.push(makeResultRow(
                sample,
                source,
                requestedFormat,
                targetBytes,
                output,
                metrics,
                { warmupMs, trials },
                metricMs
              ));
            } catch (error) {
              console.error(error);
              state.results.push(makeErrorRow(
                sample,
                source,
                requestedFormat,
                targetBytes,
                error,
                performance.now() - caseStarted
              ));
            }
            completed++;
            elements.progress.value = completed;
            renderResults();
            updateSummary();
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
          if (state.cancelled) break;
        }
      } finally {
        if (typeof bitmap.close === 'function') bitmap.close();
      }
    }
  } finally {
    setRunning(false);
    if (state.cancelled) {
      setStatus(`已取消 / Cancelled · ${completed}/${total}`);
    } else {
      setStatus(`完成 / Complete · ${completed}/${total}`);
    }
  }
}

function exportResults() {
  const payload = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    benchmark: {
      implementationId: IMPLEMENTATION_ID,
      generatorVersion: GENERATOR_VERSION,
      warmupRunsPerCase: 1,
      measuredTrialsPerCase: state.lastTrialCount,
      timingScope: 'compression search and Canvas encoding; source decode, alpha scan, and metrics excluded',
    },
    environment: {
      userAgent: navigator.userAgent,
      supportsAvif: state.supportsAvif,
    },
    policy: {
      qualityFloors: QUALITY_FLOORS,
      maxCanvasDimension: MAX_CANVAS_DIMENSION,
      maxCanvasPixels: MAX_CANVAS_PIXELS,
    },
    metrics: {
      maxDimension: METRIC_MAX_DIMENSION,
      referenceScale: 'fixed per source; lower-resolution outputs are upscaled to the same evaluation dimensions',
      resampler: 'Canvas 2D imageSmoothingQuality=high',
      psnr: 'worst RGB PSNR across black and white matte',
      ssim: 'worst non-overlapping 8x8 luminance SSIM across black and white matte',
      alphaRmse: '0-255 alpha channel RMSE',
    },
    results: state.results,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tinypress-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

elements.fileInput.addEventListener('change', () => {
  const files = [...elements.fileInput.files].filter(isSupportedImageFile);
  for (const file of files) addSample(file, 'local');
  elements.fileInput.value = '';
  invalidateResults();
  renderSamples();
  setStatus(`${files.length} 个本地样本已添加 / ${files.length} local samples added`);
});
elements.resetSamples.addEventListener('click', resetSyntheticSamples);
elements.run.addEventListener('click', runBenchmark);
elements.cancel.addEventListener('click', () => {
  state.cancelled = true;
  elements.cancel.disabled = true;
  setStatus('正在停止 / Stopping after current case');
});
elements.export.addEventListener('click', exportResults);

state.supportsAvif = document.createElement('canvas').toDataURL('image/avif').startsWith('data:image/avif');
if (!state.supportsAvif) {
  elements.avifFormat.disabled = true;
  elements.avifOption.title = '当前浏览器不支持 Canvas AVIF 编码 / Canvas AVIF encoding unsupported';
}
resetSyntheticSamples();
