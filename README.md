# dsh-notes-board · 笔记看板

把各个工作区 `.agents/notes` 里的工程决策笔记，变成 DeepSeek Harness 左侧栏里的一个原生面板：切换工作区、四个板块浏览、抽屉看正文。

界面直接跑 [write-notes-like-deepseek](https://github.com/czm15053/write-notes-like-deepseek) 的原版看板（`vendor/board.html` 是它的逐字快照），只是把数据来源从「浏览器选目录」换成了宿主注入——所以原版的引用入度、时间线切片、避坑智库、深链、快捷键一个都不少。

<!-- 截图占位：欢迎 PR 补一张面板截图 -->
<!-- ![screenshot](docs/screenshot.png) -->

## 它长什么样

左侧栏多一个「笔记看板」图标。点进去是：

- 顶部一条工作区下拉框 + 刷新按钮，切换工作区只换数据，不重建 DOM
- **🏛️ 架构基线**：KPI 四宫格 + 系统承重墙（按笔记间交叉引用入度排序）+ 领域架构分类阵列
- **⏱️ 演进时间线**：按月份 / 分类切片
- **🛡️ 避坑智库**：被否决的提案单独聚焦，防重犯
- **📋 决策清单**：状态 / 分类 / 排序筛选 + 全文搜索
- 点任意一条，右侧抽屉按五节展开：背景与痛点 / 落地裁定事实 / 放弃的备选 / 收益与工程代价 / 因果与血缘链路

数据全部来自各工作区 `.agents/notes/{implemented,proposed,rejected,archived}/{class}/yyyy-mm-dd-topic.md`。

## 安装

需要 DeepSeek Harness（DSH）。克隆到本地后，在 DSH 里以目录方式安装这个 bundle：

```
git clone https://github.com/scccy/dsh-notes-board.git
```

然后在 DSH 的插件管理里 `install_bundle`，目标填这个目录的绝对路径；或者直接把目录放进 profile 的依赖里（`"dsh-notes-board": "link:/path/to/dsh-notes-board"`）。装完刷新页面，左侧栏出现图标。

> 只读插件：Host 侧只注册两条 GET 路由，不写任何文件，也不接受任意路径——只读 workspace registry 里登记过的工作区。

## 工作原理

```
Host (index.js)                       Client (client.js)
  GET /api/dsh-notes-board/workspaces   ┌─ React 薄壳：工作区下拉 / 刷新 / 状态
  GET /api/dsh-notes-board/scan         │
        │                               └─ shadow root 里跑原版看板
        └── 只回 .agents/notes 的 Markdown 原文
            （zh 优先去重、>64KB gzip）
```

- **Host 不解析笔记**。它只列出工作区、读原文、按相对路径返回。分类、引用入度、四个视图全部交给原版 `parseNote` / `ingestDataset`，解析逻辑只有一份。
- **Client 不重写 UI**。`scripts/build-client.mjs` 把 `vendor/board.html` 做机械改造后拼进 `client.js`：`:root` → `:host`（挂 shadow root 做样式隔离）、`document.getElementById` → 作用域内 `byId()`、`location.hash` → 面板内自持路由、摘掉「浏览器目录授权」启动块改由 `ingestFiles()` 喂数据、四个视图改成按 tab 懒渲染。每个补丁都带数量断言，上游模板一变，构建直接失败而不是静默错改。

### 开发

```sh
npm run build   # src/panel.js + vendor/board.html -> client.js（生成物，别手改）
npm test        # 桩 DOM 跑一遍四视图 + 抽屉五节渲染
```

改界面：改 `src/panel.js`（宿主壳）或 `scripts/build-client.mjs`（补丁表）。
上游更新：替换 `vendor/board.html`，重跑 `npm run build`，按断言失败处修补丁。

## 授权与来源

- 本仓库代码：MIT，见 [LICENSE](LICENSE)。
- `vendor/board.html`（看板模板本体）来自 [czm15053/write-notes-like-deepseek](https://github.com/czm15053/write-notes-like-deepseek)，其生成的页面内自述「遵循 MIT 协议开源」。原样收录、未改动语义，只在构建期做上述机械改造。详见 [NOTICE.md](NOTICE.md)。
