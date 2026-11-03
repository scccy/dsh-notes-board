# NOTICE

本仓库包含来自第三方项目的文件，声明如下。

## vendor/board.html

- **来源**：[czm15053/write-notes-like-deepseek](https://github.com/czm15053/write-notes-like-deepseek)
- **内容**：该项目的看板模板 `assets/agent-notes-board.html` 的逐字快照（74KB），用于在 Harness 面板内渲染笔记看板。
- **授权**：上游仓库当前尚未提供 LICENSE 文件；其生成的看板页面页脚自述「Agent Notes · 工程决策看板 · 遵循 MIT 协议开源」。本仓库据此按 MIT 处理并保留出处标注。若上游后续发布正式授权条款，以彼为准，本文件会同步更新。
- **改动**：本仓库**不修改**该文件本身。所有适配（`:root` → `:host`、作用域改写、事件接管、路由收拢、数据源注入、视图懒渲染）都发生在构建期，由 `scripts/build-client.mjs` 施加到生成物 `client.js` 上，且每处补丁都带数量断言。

## 字体

原版看板引用 Google Fonts（Space Grotesk / Plus Jakarta Sans / JetBrains Mono），由原版 `<link>` 在运行时加载，本仓库不打包字体文件。字体授权见 Google Fonts 各自条目（均为 SIL Open Font License）。
