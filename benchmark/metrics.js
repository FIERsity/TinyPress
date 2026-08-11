'use strict';

(function initTinyPressBenchmarkMetrics(root, factory) {
  const metrics = factory();
  if (typeof module === 'object' && module.exports) module.exports = metrics;
  if (root) root.TinyPressBenchmarkMetrics = metrics;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMetrics() {
  const MAX_CHANNEL = 255;
  const C1 = (0.01 * MAX_CHANNEL) ** 2;
  const C2 = (0.03 * MAX_CHANNEL) ** 2;

  function validateImageData(reference, candidate, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error('Metric dimensions must be positive integers');
    }
    const expected = width * height * 4;
    if (!reference || !candidate || reference.length < expected || candidate.length < expected) {
      throw new Error('Metric buffers do not match the requested dimensions');
    }
  }

  function compositeChannel(data, offset, alpha, background) {
    return data[offset] * alpha + background * (1 - alpha);
  }

  function calculateMetrics(reference, candidate, width, height, options = {}) {
    validateImageData(reference, candidate, width, height);
    const windowSize = options.windowSize ?? 8;
    const background = options.background ?? [255, 255, 255];
    if (!Array.isArray(background) || background.length !== 3 ||
        background.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
      throw new Error('Metric background must contain three channels between 0 and 255');
    }
    if (!Number.isInteger(windowSize) || windowSize < 1) {
      throw new Error('SSIM window size must be a positive integer');
    }

    const pixelCount = width * height;
    const referenceLuma = new Float32Array(pixelCount);
    const candidateLuma = new Float32Array(pixelCount);
    let rgbSquaredError = 0;
    let alphaSquaredError = 0;

    for (let pixel = 0, offset = 0; pixel < pixelCount; pixel++, offset += 4) {
      const referenceAlpha = reference[offset + 3] / MAX_CHANNEL;
      const candidateAlpha = candidate[offset + 3] / MAX_CHANNEL;
      const referenceRgb = [
        compositeChannel(reference, offset, referenceAlpha, background[0]),
        compositeChannel(reference, offset + 1, referenceAlpha, background[1]),
        compositeChannel(reference, offset + 2, referenceAlpha, background[2]),
      ];
      const candidateRgb = [
        compositeChannel(candidate, offset, candidateAlpha, background[0]),
        compositeChannel(candidate, offset + 1, candidateAlpha, background[1]),
        compositeChannel(candidate, offset + 2, candidateAlpha, background[2]),
      ];

      for (let channel = 0; channel < 3; channel++) {
        const delta = referenceRgb[channel] - candidateRgb[channel];
        rgbSquaredError += delta * delta;
      }
      const alphaDelta = reference[offset + 3] - candidate[offset + 3];
      alphaSquaredError += alphaDelta * alphaDelta;

      referenceLuma[pixel] =
        0.2126 * referenceRgb[0] + 0.7152 * referenceRgb[1] + 0.0722 * referenceRgb[2];
      candidateLuma[pixel] =
        0.2126 * candidateRgb[0] + 0.7152 * candidateRgb[1] + 0.0722 * candidateRgb[2];
    }

    const rgbMse = rgbSquaredError / (pixelCount * 3);
    const psnr = rgbMse === 0
      ? Infinity
      : 10 * Math.log10((MAX_CHANNEL * MAX_CHANNEL) / rgbMse);
    const alphaRmse = Math.sqrt(alphaSquaredError / pixelCount);

    let weightedSsim = 0;
    let totalWeight = 0;
    for (let top = 0; top < height; top += windowSize) {
      for (let left = 0; left < width; left += windowSize) {
        const blockWidth = Math.min(windowSize, width - left);
        const blockHeight = Math.min(windowSize, height - top);
        const count = blockWidth * blockHeight;
        let referenceMean = 0;
        let candidateMean = 0;

        for (let y = 0; y < blockHeight; y++) {
          const row = (top + y) * width + left;
          for (let x = 0; x < blockWidth; x++) {
            referenceMean += referenceLuma[row + x];
            candidateMean += candidateLuma[row + x];
          }
        }
        referenceMean /= count;
        candidateMean /= count;

        let referenceVariance = 0;
        let candidateVariance = 0;
        let covariance = 0;
        for (let y = 0; y < blockHeight; y++) {
          const row = (top + y) * width + left;
          for (let x = 0; x < blockWidth; x++) {
            const referenceDelta = referenceLuma[row + x] - referenceMean;
            const candidateDelta = candidateLuma[row + x] - candidateMean;
            referenceVariance += referenceDelta * referenceDelta;
            candidateVariance += candidateDelta * candidateDelta;
            covariance += referenceDelta * candidateDelta;
          }
        }
        const divisor = Math.max(1, count - 1);
        referenceVariance /= divisor;
        candidateVariance /= divisor;
        covariance /= divisor;

        const luminance = (2 * referenceMean * candidateMean + C1) /
          (referenceMean * referenceMean + candidateMean * candidateMean + C1);
        const structure = (2 * covariance + C2) /
          (referenceVariance + candidateVariance + C2);
        weightedSsim += luminance * structure * count;
        totalWeight += count;
      }
    }

    return {
      psnr,
      ssim: weightedSsim / totalWeight,
      alphaRmse,
    };
  }

  return Object.freeze({ calculateMetrics });
});
