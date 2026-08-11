# AGENTS.md

## 作用域与上级规则

本文件适用于 TinyPress 仓库。跨项目策略、Git/main 规则和默认设备范围由 `../070315-site/AGENTS.md` 统一管理。开始跨项目工作或修改本文件前，先读取主文件。

本文件中的 `OWNER-MAINTAINED` 内容只有在用户明确改变产品策略时才能修改。`AGENT-MAINTAINED` 内容是项目事实；代码、配置或工作流改变后，执行变更的代理应同步更新。

## OWNER-MAINTAINED: 产品边界

- TinyPress 是本地优先的浏览器图片压缩与格式转换工具。
- 图片字节、图片元数据、预览和输出不得上传到服务器。
- 用户主动提交的反馈文字是允许的网络例外；不得把图片或其他文件信息附加到反馈。
- 不新增账户、云存储、遥测、分析或远程图片处理，除非用户明确批准为大改动。
- 默认面向桌面横屏开发。不主动进行竖屏专项设计，但保持已有基础响应式和触摸能力不被明显破坏。
- 小改动通过最低验证后可直接提交并推送 `main`；大改动先按主 AGENTS 的标准询问用户。

## 工作方式

1. 检查 `git status --short --branch`，保留已有本地修改和未跟踪内容。
2. 必要时读取 `../070315-site/AGENTS.md` 中的远端同步和提交规则。
3. 根目录就是 GitHub Pages 发布内容，新增任何非隐藏文件前先判断它是否适合公开。
4. 使用明确路径暂存，提交前检查 `git diff --cached`。
5. 推送 `main` 会自动发布 GitHub Pages，推送前完成最低验证。

## AGENT-MAINTAINED: 项目事实

<!-- AGENT-MAINTAINED:START project-facts -->

### 架构

TinyPress 没有 `package.json`、构建器或前端框架：

- `index.html`：页面结构和资源入口。
- `styles.css`：界面样式与响应式规则。
- `app.js`：图片解码、Canvas 编码、下载和交互。
- `compression-policy.js`：浏览器生产代码与 Node 测试共用的质量搜索、缩放、格式候选和结果排序策略。
- `manifest.webmanifest`、`sw.js`：PWA 和离线缓存。
- `icons/`：品牌与 PWA 图标。
- `jszip.min.js`、`heic2any.min.js`：同源懒加载的 vendored 依赖，不手工编辑。
- `test/algo.test.mjs`：直接导入生产压缩策略的确定性单元测试。
- `benchmark/`：本地浏览器基准工具、确定性合成样本生成器和 PSNR/SSIM 指标实现。
- `test/benchmark-metrics.test.mjs`：基准指标的确定性 Node 测试。
- `worker/`：独立部署的 Cloudflare 反馈 Worker。

`.wrangler/` 和 `worker/.wrangler/` 是本地生成状态，不得提交。

### 本地命令

- 预览：`python3 -m http.server 8080`
- 算法测试：`node test/algo.test.mjs`
- 指标测试：`node test/benchmark-metrics.test.mjs`
- 浏览器基准：启动预览后访问 `http://localhost:8080/benchmark/`
- 无构建、lint、类型检查或格式化命令。

Canvas、HEIC/AVIF、下载、PWA、service worker 或 UI 改动不能只依赖策略测试，需要通过 HTTP 服务做桌面浏览器检查。基准变更还要运行默认合成矩阵并确认 JSON 导出；版本化 `benchmark/baselines/` 只能包含合成样本，不得纳入本地图片名称、指纹或字节。

### 发布

`main` 推送通过 GitHub Actions 发布仓库根目录到 GitHub Pages。根目录中的 README、测试和 Worker 源码也会进入 Pages artifact，因此不得把本地样本、测试输出、密钥或内部材料放进未忽略的根目录。

公开地址为 `https://FIERsity.github.io/TinyPress/`。相对资源路径、manifest `start_url` 和 service-worker scope 必须继续兼容 GitHub Pages 子路径。

<!-- AGENT-MAINTAINED:END project-facts -->

## 关键实现约束

### 图片与压缩

- 图片处理必须在浏览器完成；新增网络请求需要显式隐私审查。
- 自动模式下，已经小于目标且无需转换的非 HEIC 文件应保持原字节。
- 输出不得超过用户目标大小；低于目标时优先保留质量和分辨率，而不是追求更小文件。
- 透明图片不得被不透明 JPEG 路径意外破坏。
- PNG 走无损编码与必要的尺寸调整；有损格式先保留可接受画质，只有质量下限仍超目标时才缩放。
- 超过 8192px 长边或 6400 万像素的极端大图可先按比例缩小以保护 Canvas 内存；修改该预算时增加对应策略测试。
- HEIC/HEIF 的 PNG 解码中间结果不代表源格式；自动模式应优先尝试 AVIF、WebP 或 JPEG，显式选择 PNG 时才输出 PNG。
- HEIC 和 ZIP 支持保持同源本地依赖，不改为运行时 CDN。
- 动画 GIF 经 Canvas 重编码会丢失动画；不得把现有支持描述为完整动画输出支持。
- 修改压缩算法时同步更新可测试逻辑、测试和用户文档，不能只调整测试模型。

### PWA 与反馈 Worker

- service worker 只处理同源 GET；不得缓存或拦截反馈 POST。
- 保持在线优先、缓存作为离线回退的现有语义，除非用户批准改变离线策略。
- 改变静态资源时检查资源版本参数和缓存名是否需要协调更新。
- 反馈 Worker 必须保留输入长度校验、HTML 转义、CORS 限制和滥用控制。
- `READ_SECRET` 等凭证只能通过 Wrangler secret 配置，不得进入源码、URL 示例、日志或 Git。
- `worker/` 独立于 Pages 发布；未经明确要求不手动部署 Worker。

## 文案与视觉

界面为中文和 English 双语。修改可见文本时同步维护两种语言。默认验收桌面横屏；仍需避免已有窄屏布局出现明显溢出或不可操作。

## 文档维护

代理可以更新 `project-facts` 中经过验证的目录、命令、依赖和发布事实。以下变化还必须同步更新 `../070315-site/AGENTS.md`：

- 项目目录、GitHub 仓库或公开 URL 改变。
- 最低验证命令、运行时或发布方式改变。
- 隐私边界、主要定位或主站工具入口需要改变。

用户功能、格式支持、使用方法或部署步骤变化时同步更新 README。不要在本文件记录临时进度、提交号、部署版本或秘密信息。
