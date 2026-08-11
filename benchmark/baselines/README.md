# TinyPress benchmark baselines

This directory contains reviewed benchmark exports generated only from the synthetic samples in `benchmark/benchmark.js`. It must not contain user images, image bytes, private filenames, or exports produced from local samples. Synthetic source hashes in each export identify the exact browser-generated inputs.

## `electron-chrome146-macos.json`

Initial Canvas baseline for the compression policy introduced in commit `dfe5f81`, captured with Electron 41 / Chromium 146 on macOS. The default matrix contains:

- Samples: JPEG photo texture, WebP fine detail, transparent PNG
- Targets: 50KB, 200KB, and 1MB
- Formats: Auto, JPEG, WebP, PNG
- Protocol: one warmup plus three measured trials per case
- Cases: 36

All 36 cases met their target. Timing columns report the median and p95 of the three measured trials and should only be compared on similar hardware and browser builds. Quality metrics use fixed 512×384 source-relative evaluation dimensions; PSNR and SSIM report the worse result across black and white matte backgrounds. Size, dimensions, pixel retention, PSNR, SSIM, and Alpha RMSE remain the primary regression signals.

AVIF is absent because this browser build did not expose Canvas AVIF encoding. Run AVIF comparisons in a browser that reports `supportsAvif: true` and keep those results in a separately named baseline.
