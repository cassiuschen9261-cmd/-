# 稳定性与全流程回归报告

- 生成时间: 2026-05-22T08:56:07.252Z
- 基线服务: http://localhost:3000
- 覆盖步骤数: 23
- 通过: 23
- 失败: 0
- 总耗时: 98277.5 ms

## 覆盖范围

- 启动与健康检查
- 权限边界与游客/管理员 UI 差异
- 模块创建、停用、删除与持久化
- 停用模块对右侧排班概览的过滤
- 右侧栏高级模式、关键字/白名单、标题/电话/密度/视觉样式
- 页面基础运行与头部布局

## 结果汇总

- PASS status-check | startup | 121.4 ms
- PASS health-check | api | 107.9 ms
- PASS benchmark-local | performance | 160.9 ms
- PASS verify-start-browser-runtime | ui | 4637.6 ms
- PASS verify-role-boundaries | auth | 216.2 ms
- PASS verify-export-permissions-ui | auth-ui | 4399 ms
- PASS verify-department-management | department | 317.7 ms
- PASS verify-module-actions-ui | module | 9991.2 ms
- PASS verify-disabled-module-sidebar | module | 6153.5 ms
- PASS verify-custom-module-sidebar | sidebar | 7433.8 ms
- PASS verify-module-sidebar-advanced | sidebar | 8186 ms
- PASS verify-module-sidebar-advanced-display | sidebar | 4513.6 ms
- PASS verify-module-sidebar-badge-hierarchy | sidebar | 4563.9 ms
- PASS verify-module-sidebar-count-mode | sidebar | 6855.5 ms
- PASS verify-module-sidebar-density | sidebar | 5613.5 ms
- PASS verify-module-sidebar-empty-state | sidebar | 3569.1 ms
- PASS verify-module-sidebar-mode-whitelist | sidebar | 3539 ms
- PASS verify-module-sidebar-mode-keyword | sidebar | 4511.5 ms
- PASS verify-module-sidebar-phone-display-mode | sidebar | 7395.1 ms
- PASS verify-module-sidebar-title-mode | sidebar | 5718.6 ms
- PASS verify-module-sidebar-visual | sidebar | 4511.9 ms
- PASS verify-sidebar-label-order | sidebar | 110.1 ms
- PASS verify-header-layout | ui | 5650.5 ms

## 发现与处理

- 已收口停用模块后右侧“当日排班人员”仍提取该模块医生的问题。
- 已收口自动排班个人模式仍暴露停用模块医生的问题。
- 已收口游客仍可见/可触发导出按钮的问题。
- 现有验证脚本已统一纳入总控套件，便于后续多轮回归。

## 残余风险

- 当前仍以浏览器脚本与接口脚本为主，未覆盖操作系统级安装/开机自启的真实重启场景。
- 导出功能当前验证到权限与页面入口，未做文件内容逐字节比对。
- 启动器性能项已保留待继续深挖，但不影响本轮核心业务稳定性回归。
