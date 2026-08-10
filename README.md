# 图压 TinyPress

<p><img src="icons/brandmark.svg" alt="TinyPress logo" width="72" /></p>

纯前端图片压缩工具：上传图片，压缩到指定大小以下（100KB / 200KB / 500KB / 1MB / 自定义）。图片全程在浏览器本地处理，不会上传到服务器。

在线使用：https://FIERsity.github.io/TinyPress/

## 功能

- 拖拽或点击上传，支持多张图片（JPG / PNG / WebP / GIF）
- 目标大小可预设或自定义（KB）
- 自动二分搜索最优质量，必要时降分辨率，保证结果在目标大小以下
- 输出格式：自动 / JPEG / WebP / PNG（自动模式会检测透明背景）
- 显示压缩前后大小、节省比例，一键下载

## 使用

直接打开 `index.html` 即可，无需服务器。

本地预览：

```bash
cd tinypress
python3 -m http.server 8080
```

## 部署到 GitHub Pages

1. 将仓库推送到 GitHub
2. 仓库 Settings → Pages
3. Source 选择 Deploy from a branch，Branch 选 `main`，目录 `/ (root)`
4. 访问 https://FIERsity.github.io/TinyPress/

## 工作原理

1. 用 `createImageBitmap` 解码图片
2. 绘制到 `<canvas>`，用 `canvas.toBlob` 按指定质量输出
3. 二分搜索质量（3% ~ 100%），找到不超过目标大小的最高质量
4. 质量降到最低仍超目标时，按比例缩小分辨率重试
5. 下载压缩后的 Blob

核心代码见 `app.js` 的 `compressFile()`。

## 目录结构

```
tinypress/
├── index.html   # 页面结构
├── styles.css   # 样式
├── app.js       # 压缩算法与交互
├── test/        # 算法测试
└── README.md
```

## 测试

```bash
node test/algo.test.mjs
```

## 许可证

MIT
