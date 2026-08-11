import assert from 'node:assert/strict';
import policy from '../compression-policy.js';

const {
  QUALITY_FLOORS,
  buildAutoCandidates,
  compressLossless,
  compressLossy,
  fitWithinCanvasBudget,
  isSupportedImageFile,
  nextDimensions,
  pickPreferredResult,
  searchQuality,
  sourceExtensionForFile,
} = policy;

const fakeBlob = (size) => ({ size });

async function testQualitySearchKeepsFullQualityWhenItFits() {
  const qualities = [];
  const result = await searchQuality({
    width: 2000,
    height: 1000,
    targetBytes: 500_000,
    minQuality: QUALITY_FLOORS.jpeg,
    encode: async (_w, _h, quality) => {
      qualities.push(quality);
      return fakeBlob(300_000);
    },
  });

  assert.equal(result.quality, 1);
  assert.equal(result.width, 2000);
  assert.deepEqual(qualities, [1]);
}

async function testQualitySearchNeverLeavesBounds() {
  const qualities = [];
  const result = await searchQuality({
    width: 1200,
    height: 800,
    targetBytes: 700_000,
    minQuality: QUALITY_FLOORS.jpeg,
    encode: async (_w, _h, quality) => {
      qualities.push(quality);
      return fakeBlob(Math.round(100_000 + quality * 900_000));
    },
  });

  assert.ok(result.size <= 700_000);
  assert.ok(result.quality >= QUALITY_FLOORS.jpeg && result.quality <= 1);
  assert.ok(qualities.every((quality) => quality >= QUALITY_FLOORS.jpeg && quality <= 1));
}

async function testQualityFloorSignalsResize() {
  const result = await searchQuality({
    width: 1200,
    height: 800,
    targetBytes: 200_000,
    minQuality: QUALITY_FLOORS.webp,
    encode: async (_w, _h, quality) => fakeBlob(300_000 + quality * 100_000),
  });

  assert.equal(result.quality, QUALITY_FLOORS.webp);
  assert.ok(result.size > 200_000);
}

function testDimensionEstimateDirection() {
  const [width, height] = nextDimensions(4000, 3000, 20 * 1024 * 1024, 5 * 1024 * 1024);
  assert.ok(width >= 1950 && width <= 2000, `unexpected width ${width}`);
  assert.ok(height >= 1450 && height <= 1500, `unexpected height ${height}`);
  assert.deepEqual(nextDimensions(4000, 3000, 4 * 1024 * 1024, 5 * 1024 * 1024), [4000, 3000]);

  const nearTarget = nextDimensions(1000, 500, 101_000, 100_000);
  assert.ok(nearTarget[0] > 980, `near-target width dropped too far: ${nearTarget[0]}`);

  const panorama = nextDimensions(20, 1000, 400_000, 100_000);
  assert.deepEqual(panorama, [10, 497]);
}

async function testExtremeAspectRatioCanStillReachTarget() {
  const result = await compressLossless({
    width: 20,
    height: 1000,
    targetBytes: 5_000,
    encode: async (width, height) => fakeBlob(width * height * 10),
  });

  assert.ok(result.size <= 5_000);
  assert.ok(Math.abs(result.width / result.height - 0.02) < 0.002);
}

function testCanvasBudgetPreservesCommonHighResolutionImages() {
  assert.deepEqual(fitWithinCanvasBudget(8064, 6048), [8064, 6048]);
  const [width, height] = fitWithinCanvasBudget(12000, 8000);
  assert.ok(width <= 8192);
  assert.ok(width * height <= 64_000_000);
  assert.ok(Math.abs(width / height - 1.5) < 0.001);
}

function testHeifExtensionFallback() {
  assert.equal(isSupportedImageFile({ name: 'photo.HEIF', type: '' }), true);
  assert.equal(isSupportedImageFile({ name: 'photo.heic', type: 'application/octet-stream' }), true);
  assert.equal(isSupportedImageFile({ name: 'notes.txt', type: 'text/plain' }), false);
}

async function testLossyCompressionPreservesQualityBeforeResolution() {
  const result = await compressLossy({
    format: 'jpeg',
    width: 4000,
    height: 3000,
    targetBytes: 900_000,
    encode: async (width, height, quality) =>
      fakeBlob(Math.round(width * height * (0.08 + quality * 0.12))),
  });

  assert.ok(result.size <= 900_000);
  assert.ok(result.quality >= QUALITY_FLOORS.jpeg);
  assert.ok(result.width < 4000);
  assert.ok(result.width > 2000, `resolution dropped too far: ${result.width}`);
}

async function testLossyCompressionDoesNotShrinkAFullQualityResult() {
  const result = await compressLossy({
    format: 'webp',
    width: 2400,
    height: 1600,
    targetBytes: 500_000,
    encode: async () => fakeBlob(320_000),
  });

  assert.equal(result.width, 2400);
  assert.equal(result.height, 1600);
  assert.equal(result.quality, 1);
}

async function testPngResultIncludesComparableSize() {
  const result = await compressLossless({
    width: 1000,
    height: 1000,
    targetBytes: 500_000,
    encode: async (width, height) => fakeBlob(width * height * 2),
  });

  assert.equal(result.size, result.blob.size);
  assert.ok(result.size <= 500_000);
  assert.ok(result.width < 1000);
}

function testSourceExtensionUsesMimeBeforeFilename() {
  assert.equal(sourceExtensionForFile({ name: 'clipboard', type: 'image/png' }, 'png'), 'png');
  assert.equal(sourceExtensionForFile({ name: 'wrong.txt', type: 'image/jpeg' }, 'jpeg'), 'jpg');
  assert.equal(sourceExtensionForFile({ name: 'animation.gif', type: 'image/gif' }, null), 'gif');
}

function testHeifAutoCandidatesAvoidPngIntermediate() {
  assert.deepEqual(
    buildAutoCandidates({ srcFormat: null, isHeif: true, hasAlpha: false, supportsAvif: true }),
    ['avif', 'webp', 'jpeg']
  );
  assert.deepEqual(
    buildAutoCandidates({ srcFormat: null, isHeif: true, hasAlpha: true, supportsAvif: false }),
    ['webp']
  );
}

function testPreferredResultProtectsResolutionAndTarget() {
  const targetBytes = 500_000;
  const smaller = {
    size: 490_000, width: 1200, height: 800, quality: 0.9,
    format: 'jpeg', formatRank: 0,
  };
  const larger = {
    size: 430_000, width: 2000, height: 1300, quality: 0.75,
    format: 'webp', formatRank: 1,
  };
  const overTarget = {
    size: 510_000, width: 3000, height: 2000, quality: 1,
    format: 'avif', formatRank: 2,
  };

  assert.equal(pickPreferredResult(smaller, larger, targetBytes), larger);
  assert.equal(pickPreferredResult(larger, overTarget, targetBytes), larger);
}

const tests = [
  testQualitySearchKeepsFullQualityWhenItFits,
  testQualitySearchNeverLeavesBounds,
  testQualityFloorSignalsResize,
  testDimensionEstimateDirection,
  testExtremeAspectRatioCanStillReachTarget,
  testCanvasBudgetPreservesCommonHighResolutionImages,
  testHeifExtensionFallback,
  testSourceExtensionUsesMimeBeforeFilename,
  testLossyCompressionPreservesQualityBeforeResolution,
  testLossyCompressionDoesNotShrinkAFullQualityResult,
  testPngResultIncludesComparableSize,
  testHeifAutoCandidatesAvoidPngIntermediate,
  testPreferredResultProtectsResolutionAndTarget,
];

for (const test of tests) {
  await test();
  console.log(`PASS ${test.name}`);
}
console.log(`\n${tests.length} deterministic compression-policy tests passed.`);
