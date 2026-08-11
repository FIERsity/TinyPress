'use strict';

(function initTinyPressCompressionPolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.TinyPressCompressionPolicy = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPolicy() {
  const RANGE_RATIO = 0.15;
  const MIN_DIMENSION = 1;
  const MAX_CANVAS_DIMENSION = 8192;
  const MAX_CANVAS_PIXELS = 64_000_000;
  const QUALITY_FLOORS = Object.freeze({
    jpeg: 0.55,
    webp: 0.55,
    avif: 0.5,
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function qualityFloorFor(format) {
    return QUALITY_FLOORS[format] ?? 0.55;
  }

  function makeEntry(blob, width, height, quality) {
    if (!blob || !Number.isFinite(blob.size)) {
      throw new Error('Image encoding returned an invalid result');
    }
    return { blob, width, height, quality, size: blob.size };
  }

  function fitWithinCanvasBudget(width, height, options = {}) {
    const maxDimension = options.maxDimension ?? MAX_CANVAS_DIMENSION;
    const maxPixels = options.maxPixels ?? MAX_CANVAS_PIXELS;
    const dimensionScale = maxDimension / Math.max(width, height);
    const pixelScale = Math.sqrt(maxPixels / Math.max(width * height, 1));
    const scale = Math.min(1, dimensionScale, pixelScale);
    return [
      Math.max(1, Math.floor(width * scale)),
      Math.max(1, Math.floor(height * scale)),
    ];
  }

  function isSupportedImageFile(file) {
    const type = (file?.type || '').toLowerCase();
    const name = (file?.name || '').toLowerCase();
    return type.startsWith('image/') || /\.(heic|heif)$/.test(name) || /heic|heif/.test(type);
  }

  function sourceExtensionForFile(file, srcFormat) {
    const formatExtension = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' }[srcFormat];
    if (formatExtension) return formatExtension;

    const type = (file?.type || '').toLowerCase();
    const mimeExtension = {
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
    }[type];
    if (mimeExtension) return mimeExtension;

    const match = (file?.name || '').match(/\.([a-z0-9]+)$/i);
    const extension = match ? match[1].toLowerCase() : '';
    return /^(gif|svg|bmp|tiff?|ico)$/.test(extension) ? extension : 'png';
  }

  async function searchQuality(options) {
    const {
      width,
      height,
      encode,
      targetBytes,
      minQuality = 0.55,
      maxQuality = 1,
      iterations = 10,
    } = options;

    const lowLimit = clamp(minQuality, 0, 1);
    const highLimit = clamp(maxQuality, lowLimit, 1);
    const highBlob = await encode(width, height, highLimit);
    const high = makeEntry(highBlob, width, height, highLimit);
    if (high.size <= targetBytes || highLimit === lowLimit) return high;

    const lowBlob = await encode(width, height, lowLimit);
    const low = makeEntry(lowBlob, width, height, lowLimit);
    if (low.size > targetBytes) return low;

    let lo = lowLimit;
    let hi = highLimit;
    let best = low;
    for (let i = 0; i < iterations && hi - lo > 0.002; i++) {
      const mid = (lo + hi) / 2;
      const blob = await encode(width, height, mid);
      const candidate = makeEntry(blob, width, height, mid);
      if (candidate.size <= targetBytes) {
        best = candidate;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return best;
  }

  function nextDimensions(width, height, measuredSize, targetBytes, minDimension = MIN_DIMENSION) {
    if (measuredSize <= targetBytes || width <= minDimension || height <= minDimension) {
      return [width, height];
    }

    const estimated = Math.sqrt(targetBytes / Math.max(measuredSize, 1)) * 0.995;
    const minScale = Math.max(minDimension / width, minDimension / height);
    const scale = clamp(estimated, minScale, 0.995);
    let nextWidth;
    let nextHeight;
    if (width >= height) {
      nextWidth = Math.max(minDimension, Math.floor(width * scale));
      nextHeight = Math.max(minDimension, Math.round(nextWidth * height / width));
    } else {
      nextHeight = Math.max(minDimension, Math.floor(height * scale));
      nextWidth = Math.max(minDimension, Math.round(nextHeight * width / height));
    }

    if (nextWidth === width && nextHeight === height) {
      if (width >= height) {
        nextWidth = Math.max(minDimension, width - 1);
        nextHeight = Math.max(minDimension, Math.round(nextWidth * height / width));
      } else {
        nextHeight = Math.max(minDimension, height - 1);
        nextWidth = Math.max(minDimension, Math.round(nextHeight * width / height));
      }
    }
    return [nextWidth, nextHeight];
  }

  async function compressLossy(options) {
    const {
      format,
      width,
      height,
      targetBytes,
      encode,
      maxIterations = 24,
      minDimension = MIN_DIMENSION,
    } = options;

    let currentWidth = width;
    let currentHeight = height;
    let last = null;
    const minQuality = qualityFloorFor(format);

    for (let i = 0; i < maxIterations; i++) {
      const result = await searchQuality({
        width: currentWidth,
        height: currentHeight,
        encode,
        targetBytes,
        minQuality,
      });
      last = result;
      if (result.size <= targetBytes) return result;

      const [nextWidth, nextHeight] = nextDimensions(
        currentWidth,
        currentHeight,
        result.size,
        targetBytes,
        minDimension
      );
      if (nextWidth === currentWidth && nextHeight === currentHeight) break;
      currentWidth = nextWidth;
      currentHeight = nextHeight;
    }
    return last;
  }

  async function compressLossless(options) {
    const {
      width,
      height,
      targetBytes,
      encode,
      maxIterations = 24,
      minDimension = MIN_DIMENSION,
    } = options;

    let currentWidth = width;
    let currentHeight = height;
    let last = null;

    for (let i = 0; i < maxIterations; i++) {
      const blob = await encode(currentWidth, currentHeight, 1);
      const result = makeEntry(blob, currentWidth, currentHeight, 1);
      last = result;
      if (result.size <= targetBytes) return result;

      const [nextWidth, nextHeight] = nextDimensions(
        currentWidth,
        currentHeight,
        result.size,
        targetBytes,
        minDimension
      );
      if (nextWidth === currentWidth && nextHeight === currentHeight) break;
      currentWidth = nextWidth;
      currentHeight = nextHeight;
    }
    return last;
  }

  function buildAutoCandidates(options) {
    const { srcFormat, isHeif, hasAlpha, supportsAvif } = options;
    const candidates = [];
    const add = (format) => {
      if (format && !candidates.includes(format)) candidates.push(format);
    };

    if (isHeif) {
      if (supportsAvif) add('avif');
      add('webp');
      if (!hasAlpha) add('jpeg');
      return candidates;
    }

    add(srcFormat);
    add('webp');
    if (supportsAvif) add('avif');
    if (!hasAlpha) add('jpeg');
    return candidates;
  }

  function normalizedQuality(result) {
    if (result.format === 'png') return 1;
    const floor = qualityFloorFor(result.format);
    return clamp((result.quality - floor) / (1 - floor), 0, 1);
  }

  function pickPreferredResult(current, candidate, targetBytes) {
    if (!current) return candidate;

    const currentFits = current.size <= targetBytes;
    const candidateFits = candidate.size <= targetBytes;
    if (currentFits !== candidateFits) return candidateFits ? candidate : current;
    if (!candidateFits) return candidate.size < current.size ? candidate : current;

    const currentPixels = current.width * current.height;
    const candidatePixels = candidate.width * candidate.height;
    if (candidatePixels !== currentPixels) return candidatePixels > currentPixels ? candidate : current;

    const currentQuality = normalizedQuality(current);
    const candidateQuality = normalizedQuality(candidate);
    if (Math.abs(candidateQuality - currentQuality) > 0.01) {
      return candidateQuality > currentQuality ? candidate : current;
    }

    if (candidate.formatRank !== current.formatRank) {
      return candidate.formatRank < current.formatRank ? candidate : current;
    }
    return candidate.size > current.size ? candidate : current;
  }

  return Object.freeze({
    RANGE_RATIO,
    MIN_DIMENSION,
    MAX_CANVAS_DIMENSION,
    MAX_CANVAS_PIXELS,
    QUALITY_FLOORS,
    qualityFloorFor,
    fitWithinCanvasBudget,
    isSupportedImageFile,
    sourceExtensionForFile,
    searchQuality,
    nextDimensions,
    compressLossy,
    compressLossless,
    buildAutoCandidates,
    normalizedQuality,
    pickPreferredResult,
  });
});
