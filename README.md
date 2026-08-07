# 图压 TinyPress 🖼️

> 纯前端图片压缩工具：上传图片，一键把文件压缩到**指定大小以下**（100KB / 200KB / 500KB / 1MB / 自定义）。
> 图片全程在浏览器本地处理，**不会上传到任何服务器**。

在线体验：<https://sanclodymm.github.io/tinypress/>（部署到 GitHub Pages 后可用）

## ✨ 功能特性

- 📤 **拖拽 / 点击上传**，支持多张图片批量处理（JPG / PNG / WebP / GIF）
- 🎯 **压缩到指定大小以下**：预设 100KB / 200KB / 500KB / 1MB / 2MB，也可输入自定义 KB 值
- 🧠 **智能算法**：自动二分搜索最优质量档，尽量保持画质；质量压到最低仍超目标时，再自动降分辨率
- 🎨 **多种输出格式**：自动 / JPEG / WebP / PNG（自动模式会检测透明背景，透明图用 WebP，照片用 JPEG）
- 🔒 **100% 本地处理**：图片不出浏览器，无隐私风险，可离线使用
- 📱 **响应式界面**：手机、平板、桌面均可用
- 💾 压缩后一键下载，显示压缩前后大小、节省比例、质量档

## 🚀 快速使用

### 方式一：直接打开

克隆仓库后，双击 `index.html` 即可在浏览器中使用（无需任何服务器）。

### 方式二：本地起服务（可选）

```bash
cd tinypress
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

### 方式三：部署到 GitHub Pages

1. 把本仓库推到 GitHub（见下方「推送到 GitHub」）
2. 进入仓库 **Settings → Pages**
3. Source 选择 **Deploy from a branch**，Branch 选 `main`，目录选 `/ (root)`
4. 保存后等待 1~2 分钟，访问 `https://<你的用户名>.github.io/tinypress/`

## 🧠 工作原理

纯前端、零依赖，核心就一个 HTML 文件 + 一个 JS 文件：

1. **解码**：用浏览器原生 API（`createImageBitmap`）把图片读入内存
2. **编码**：绘制到 `<canvas>`，用 `canvas.toBlob()` 按指定质量输出 JPEG / WebP
3. **二分搜索**：在质量档 3% ~ 100% 之间二分搜索，找到「不超目标大小」的最高质量——既达标又不浪费画质
4. **降分辨率兜底**：若质量降到最低仍超目标（如目标太小或图片太复杂），按 0.8 倍逐步缩小分辨率重试
5. **下载**：把压缩结果 Blob 转成临时 URL 触发浏览器下载

关键代码在 [`app.js`](app.js) 的 `compressFile()` 函数。

## 🧪 运行测试

压缩算法（二分搜索 + 降分辨率兜底）用模拟编码器做收敛性验证：

```bash
node test/algo.test.mjs
```

## 🛠 技术栈

- 原生 HTML + CSS + JavaScript（ES2020+）
- Canvas API、`createImageBitmap`、`Blob` / `URL`
- **零依赖、零构建**，不需要 npm / node_modules

## 📁 目录结构

```
tinypress/
├── index.html   # 页面结构
├── styles.css   # 样式
├── app.js       # 压缩算法 + 交互逻辑
└── README.md
```

## 🔧 推送到 GitHub（在本地执行）

```bash
git init
git add .
git commit -m "feat: 图压 TinyPress - 纯前端图片压缩工具"
git branch -M main
git remote add origin https://github.com/<你的用户名>/tinypress.git
git push -u origin main
```

## 📄 许可证

[MIT](LICENSE)
