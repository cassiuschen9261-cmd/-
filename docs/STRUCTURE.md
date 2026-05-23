# 项目目录结构说明

## 启动入口

- 根目录 `server.js`
  - 兼容入口，内部转发到 `src/server/server.js`
- 根目录 `start_server.bat`
- 根目录 `start_server_cn.ps1`
  - 兼容入口，内部转发到 `scripts/launchers/`

## 核心目录

- `src/server/`
  - 后端服务与 API 实现
- `public/`
  - 前端静态资源
  - `index.html` 为页面入口
  - `js/`、`css/`、`vendor/` 存放浏览器侧脚本、样式和第三方库
- `data/`
  - 业务数据与草稿数据
  - `backups/` 存放数据备份
- `scripts/`
  - 项目脚本、验证脚本和启动器
  - `lib/project-paths.js` 统一管理运行时、数据和报告路径
  - `launchers/` 存放 BAT、PS1、VBS 启动器
- `artifacts/`
  - 自动化验证和回归测试产物
  - `reports/verify/` 存放单项验证 JSON/HTML
  - `reports/e2e/` 预留给全量回归汇总
- `.cache/runtime/`
  - 运行时状态文件
  - 包括 `.server-port`、`.server-pid`、`server_launcher.log`
- `docs/`
  - 项目说明和回归报告

## 维护约定

- 业务代码优先放入 `src/`，不要继续堆放到根目录。
- 静态资源统一放入 `public/`。
- 运行时状态、临时文件不要写回根目录，应写入 `.cache/` 或 `artifacts/`。
- 验证脚本产物统一写入 `artifacts/reports/verify/`。
- 如需新增公共路径常量，优先修改 `scripts/lib/project-paths.js`，避免再次出现硬编码路径。
