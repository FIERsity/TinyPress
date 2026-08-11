# 图压 TinyPress

<p><img src="icons/brandmark.svg" alt="TinyPress logo" width="72" /></p>

纯前端图片压缩与格式转换工具。图片解码、预览、压缩和下载全部在浏览器本地完成，不会上传到服务器。

在线使用：https://FIERsity.github.io/TinyPress/

## 功能

- 点击、拖拽或粘贴上传多张图片
- 输入支持 JPG、PNG、WebP、AVIF、GIF、HEIC 和 HEIF
- 目标大小预设或自定义（最低 10KB）
- 输出格式支持自动、JPEG、WebP、AVIF 和 PNG
- 仅转换模式、压缩前后对比、结果选择与删除、单张下载和选中项 ZIP 打包下载
- 自动模式优先保留分辨率和视觉质量，必要时才降低分辨率

## 分辨率与画质

- **分辨率**是图片包含多少像素，例如 `4032 × 3024`。降低分辨率会减少可放大的细节。
- **画质**是有损编码保留细节的程度。较低的 JPEG、WebP 或 AVIF 质量会产生模糊、色块和边缘噪点，但图片尺寸可以保持不变。
- TinyPress 会先在原分辨率尝试可接受的编码质量；只有最低质量仍超过目标时才降低分辨率。
- 为避免浏览器因极端大图耗尽内存，超过 8192px 长边或 6400 万像素的图片会先按比例缩小；常见的 48MP 照片不受该限制。

PNG 是无损格式，浏览器的 PNG 编码没有可调画质。照片从 HEIF 转成 PNG 后由约 2MB 变成 20MB 并不异常：HEIF 使用高效率有损压缩，PNG 则要无损保存解码后的像素。若强制 PNG 又要求 5MB，当前浏览器方案只能降低分辨率。照片通常应选择“自动”、WebP、AVIF 或 JPEG；需要透明背景或无损像素时再选择 PNG。

动画 GIF 经过 Canvas 重编码后只保留静态帧。自动模式直接保留已达标的原 GIF 时，动画不会丢失。

## 压缩基准

仓库包含本地浏览器基准工具。启动 HTTP 预览后访问：

```text
http://localhost:8080/benchmark/
```

基准默认生成 JPEG 照片纹理、WebP 精细线条和透明 PNG 三类样本，也可以临时选择本机 JPG、PNG、WebP、AVIF、HEIC 或 HEIF。图片和结果不会发出网络请求；真实样本只存在于当前浏览器页面，仓库不保存图片字节。合成样本不依赖系统字体，导出结果记录生成器版本和源文件 SHA-256；本地图片默认不导出内容指纹。

每个测试用例先预热一次，再按页面选择重复 1、3 或 5 次并记录中位数和 p95。结果包含目标与实际体积、格式、分辨率、像素保留率、编码质量和耗时，并在按源图固定的最长边 512px 尺度上计算黑、白背景中较差的 PSNR 与 8×8 窗口亮度 SSIM，同时记录 Alpha RMSE。这样不同输出分辨率使用相同评估尺度，但该尺度仍使用浏览器 Canvas 缩放器作为固定参考；比较其他缩放器时应同时查看像素保留率和视觉样本。页面导出的 JSON 不包含图片字节。

本地真实样本和临时导出结果不要提交。`benchmark/fixtures/` 与 `benchmark/results/` 已被 Git 忽略。`benchmark/baselines/electron-chrome146-macos.json` 保存了只使用合成样本的首轮 36 项基线；其中的耗时仅适合在相近硬件和浏览器版本下比较。

## 使用

可直接打开 `index.html`。涉及 Service Worker、PWA 或完整浏览器检查时，建议通过 HTTP 预览：

```bash
cd tinypress
python3 -m http.server 8080
```

然后访问 http://localhost:8080/。

## 工作原理

1. 使用 `createImageBitmap` 解码图片，失败时回退到 `<img>`；HEIC/HEIF 通过同源的 `heic2any` 解码。
2. 只有超过 8192px 长边或 6400 万像素的极端大图会先按比例缩小，以限制 Canvas 内存。
3. 自动模式下，已经小于目标且无需转换的非 HEIF 图片保留原始文件。
4. 有损格式先尝试质量 `1.0`，再在格式质量下限与 `1.0` 之间搜索不超过目标的最高质量。
5. 质量下限仍超目标时，根据实测体积估算下一档分辨率并重新编码。
6. PNG 使用无损编码，只在超过目标时降低分辨率。
7. 自动模式比较候选格式时，依次优先满足目标上限、更高分辨率和更高相对质量。

浏览器交互与 Canvas 编码见 `app.js`，共享的压缩决策见 `compression-policy.js`。

## 目录结构

```text
tinypress/
├── index.html                 # 页面结构与资源入口
├── styles.css                 # 界面样式
├── app.js                     # 解码、Canvas 编码与交互
├── compression-policy.js      # 生产与测试共用的压缩策略
├── heic2any.min.js            # 本地 HEIC/HEIF 解码依赖
├── jszip.min.js               # 本地 ZIP 依赖
├── manifest.webmanifest       # PWA 元数据
├── sw.js                      # 网络优先的离线回退
├── benchmark/                # 本地 Canvas 压缩基准与质量指标
│   ├── index.html
│   ├── benchmark.js
│   ├── metrics.js
│   ├── styles.css
│   └── baselines/            # 仅含合成样本的版本化基线
├── test/
│   ├── algo.test.mjs         # 确定性压缩策略测试
│   └── benchmark-metrics.test.mjs # PSNR/SSIM 指标测试
└── worker/                    # 独立的反馈 Cloudflare Worker
```

## 测试

```bash
node test/algo.test.mjs
node test/benchmark-metrics.test.mjs
```

Canvas、HEIC/AVIF、下载或 PWA 变更还需要通过 HTTP 服务进行桌面浏览器检查。

## 发布

推送 `main` 后，GitHub Actions 会把仓库根目录发布到 GitHub Pages。反馈 Worker 位于 `worker/`，使用独立的 Wrangler 配置和发布流程。

## 许可证

MIT
