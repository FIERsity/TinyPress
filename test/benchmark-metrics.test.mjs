import assert from 'node:assert/strict';
import metrics from '../benchmark/metrics.js';

const { calculateMetrics } = metrics;

function solidPixel(red, green, blue, alpha = 255) {
  return Uint8ClampedArray.from([red, green, blue, alpha]);
}

function testIdenticalPixelsArePerfect() {
  const pixels = Uint8ClampedArray.from([
    10, 20, 30, 255,
    200, 150, 100, 128,
  ]);
  const result = calculateMetrics(pixels, pixels, 2, 1);
  assert.equal(result.psnr, Infinity);
  assert.equal(result.ssim, 1);
  assert.equal(result.alphaRmse, 0);
}

function testBlackAndWhiteHaveZeroPsnr() {
  const result = calculateMetrics(
    solidPixel(0, 0, 0),
    solidPixel(255, 255, 255),
    1,
    1
  );
  assert.ok(Math.abs(result.psnr) < 1e-12);
  assert.ok(result.ssim < 0.001);
  assert.equal(result.alphaRmse, 0);
}

function testInvisibleRgbDoesNotAffectVisualMetrics() {
  const result = calculateMetrics(
    solidPixel(255, 0, 0, 0),
    solidPixel(0, 255, 255, 0),
    1,
    1
  );
  assert.equal(result.psnr, Infinity);
  assert.equal(result.ssim, 1);
  assert.equal(result.alphaRmse, 0);
}

function testAlphaLossIsReportedSeparately() {
  const result = calculateMetrics(
    solidPixel(20, 40, 60, 0),
    solidPixel(20, 40, 60, 255),
    1,
    1
  );
  assert.ok(Number.isFinite(result.psnr));
  assert.ok(result.ssim < 1);
  assert.equal(result.alphaRmse, 255);
}

function testBackgroundChoiceChangesTransparentComparison() {
  const reference = solidPixel(255, 255, 255, 128);
  const candidate = solidPixel(180, 180, 180, 192);
  const white = calculateMetrics(reference, candidate, 1, 1, { background: [255, 255, 255] });
  const black = calculateMetrics(reference, candidate, 1, 1, { background: [0, 0, 0] });
  assert.notEqual(white.psnr, black.psnr);
  assert.equal(white.alphaRmse, black.alphaRmse);
}

function testWindowedSsimHandlesPartialBlocks() {
  const reference = new Uint8ClampedArray(3 * 5 * 4).fill(255);
  const candidate = reference.slice();
  candidate[0] = 200;
  const result = calculateMetrics(reference, candidate, 3, 5, { windowSize: 8 });
  assert.ok(Number.isFinite(result.psnr));
  assert.ok(result.ssim > 0 && result.ssim < 1);
}

function testInvalidBuffersAreRejected() {
  assert.throws(
    () => calculateMetrics(new Uint8ClampedArray(3), new Uint8ClampedArray(4), 1, 1),
    /buffers/
  );
}

const tests = [
  testIdenticalPixelsArePerfect,
  testBlackAndWhiteHaveZeroPsnr,
  testInvisibleRgbDoesNotAffectVisualMetrics,
  testAlphaLossIsReportedSeparately,
  testBackgroundChoiceChangesTransparentComparison,
  testWindowedSsimHandlesPartialBlocks,
  testInvalidBuffersAreRejected,
];

for (const test of tests) {
  test();
  console.log(`PASS ${test.name}`);
}
console.log(`\n${tests.length} deterministic benchmark-metrics tests passed.`);
