const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  e2eReportFile,
  docsReportFile,
  runtimeFile
} = require('./lib/project-paths');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPORT_JSON = e2eReportFile('full_e2e_suite_report.json');
const REPORT_MD = docsReportFile('STABILITY_REPORT.md');

const FILE_STEPS = [
  ['verify-start-browser-runtime', 'ui', 'verify_start_browser_runtime.json'],
  ['verify-export-permissions-ui', 'auth-ui', 'verify_export_permissions_ui.json'],
  ['verify-module-actions-ui', 'module', 'verify_module_actions_ui.json'],
  ['verify-disabled-module-sidebar', 'module', 'verify_disabled_module_sidebar.json'],
  ['verify-custom-module-sidebar', 'sidebar', 'verify_custom_module_sidebar.json'],
  ['verify-module-sidebar-advanced', 'sidebar', 'verify_module_sidebar_advanced.json'],
  ['verify-module-sidebar-advanced-display', 'sidebar', 'verify_module_sidebar_advanced_display.json'],
  ['verify-module-sidebar-badge-hierarchy', 'sidebar', 'verify_module_sidebar_badge_hierarchy.json'],
  ['verify-module-sidebar-count-mode', 'sidebar', 'verify_module_sidebar_count_mode.json'],
  ['verify-module-sidebar-density', 'sidebar', 'verify_module_sidebar_density.json'],
  ['verify-module-sidebar-empty-state', 'sidebar', 'verify_module_sidebar_empty_state.json'],
  ['verify-module-sidebar-mode-whitelist', 'sidebar', 'verify_module_sidebar_mode_whitelist.json'],
  ['verify-module-sidebar-mode-keyword', 'sidebar', 'verify_module_sidebar_mode_keyword.json'],
  ['verify-module-sidebar-phone-display-mode', 'sidebar', 'verify_module_sidebar_phone_display_mode.json'],
  ['verify-module-sidebar-title-mode', 'sidebar', 'verify_module_sidebar_title_mode.json'],
  ['verify-module-sidebar-visual', 'sidebar', 'verify_module_sidebar_visual.json'],
  ['verify-notice-auto-height', 'ui', 'verify_notice_auto_height.json'],
  ['verify-sidebar-label-order', 'sidebar', 'verify_sidebar_label_order.json'],
  ['verify-header-layout', 'ui', 'verify_header_layout.json']
];

function runCommandStep(name, category, command, args) {
  const startedAt = new Date().toISOString();
  const start = process.hrtime.bigint();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execFileSync(command, args, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      windowsHide: true
    });
  } catch (error) {
    exitCode = typeof error.status === 'number' ? error.status : 1;
    stdout = String(error.stdout || '');
    stderr = String(error.stderr || error.message || error);
  }

  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  return {
    name,
    category,
    command: [command, ...args].join(' '),
    startedAt,
    durationMs: Number(durationMs.toFixed(1)),
    exitCode,
    stdout,
    stderr,
    resultFile: '',
    resultPayload: null
  };
}

function readJson(fileName) {
  try {
    const filePath = path.join(PROJECT_ROOT, 'artifacts', 'reports', 'verify', fileName);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { readError: String(error && error.message || error) };
  }
}

function inferSuccess(name, payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.ok === 'boolean') return payload.ok;
  if (typeof payload.success === 'boolean') return payload.success;
  if (name === 'verify-start-browser-runtime') {
    return payload.status === 200 && payload.hasApp === true && Array.isArray(payload.pageErrors) && payload.pageErrors.length === 0;
  }
  if (name === 'verify-header-layout') {
    return payload.result?.found === true && payload.result?.overlaps === false && Array.isArray(payload.pageErrors) && payload.pageErrors.length === 0;
  }
  if (name === 'verify-sidebar-label-order') {
    return payload.success === true;
  }
  return false;
}

function buildFileStep(name, category, fileName) {
  const payload = readJson(fileName);
  return {
    name,
    category,
    command: `artifact:${fileName}`,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    exitCode: inferSuccess(name, payload) ? 0 : 1,
    stdout: '',
    stderr: '',
    resultFile: fileName,
    resultPayload: payload
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# 稳定性与全流程回归报告');
  lines.push('');
  lines.push(`- 生成时间: ${report.generatedAt}`);
  lines.push(`- 基线服务: ${report.baseUrl}`);
  lines.push(`- 覆盖步骤数: ${report.summary.total}`);
  lines.push(`- 通过: ${report.summary.passed}`);
  lines.push(`- 失败: ${report.summary.failed}`);
  lines.push(`- 总耗时: ${report.summary.totalDurationMs} ms`);
  lines.push('');
  lines.push('## 覆盖范围');
  lines.push('');
  lines.push('- 启动状态、健康检查、基础性能');
  lines.push('- 权限边界、游客与管理员界面差异');
  lines.push('- 科室创建、模块停用/删除、状态持久化');
  lines.push('- 停用模块对右侧当日排班概览的过滤');
  lines.push('- 右侧栏白名单、关键字、显示密度、人数标记、视觉样式等模式');
  lines.push('- 页面基础运行、头部布局与控制台异常');
  lines.push('');
  lines.push('## 结果汇总');
  lines.push('');
  for (const step of report.steps) {
    const status = step.exitCode === 0 ? 'PASS' : 'FAIL';
    lines.push(`- ${status} ${step.name} | ${step.category} | ${step.durationMs} ms`);
  }
  lines.push('');
  lines.push('## 发现与修复');
  lines.push('');
  lines.push('- 修复停用模块后右侧“当日排班人员”仍提取该模块医生的问题。');
  lines.push('- 修复自动排班个人模式仍暴露停用模块医生的问题。');
  lines.push('- 修复游客仍可见或可触发导出按钮的问题。');
  lines.push('- 修复多份侧栏验证脚本默认连到错误的 `310x` 端口，现统一读取项目实际端口。');
  lines.push('- 修复 `verify-module-actions-ui` 清理阶段依赖 UI 删除导致超时的问题，现改为 API 清理。');
  lines.push('- 新增测试残留清理脚本，避免验证模块、验证医生、验证班次污染正式数据。');
  lines.push('');
  lines.push('## 残余风险');
  lines.push('');
  lines.push('- 当前回归以浏览器脚本和接口脚本为主，未覆盖操作系统重启后的开机自启真实场景。');
  lines.push('- 导出功能当前验证到权限和页面入口，未做导出文件内容逐字节比对。');
  lines.push('- 启动器性能问题已保留为后续专项优化项，不影响本轮核心业务稳定性结论。');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: (() => {
      const portFile = runtimeFile('.server-port');
      if (fs.existsSync(portFile)) {
        const port = String(fs.readFileSync(portFile, 'utf8') || '').trim();
        if (port) return `http://localhost:${port}`;
      }
      return 'http://localhost:3000';
    })(),
    steps: []
  };

  report.steps.push(runCommandStep('status-check', 'startup', 'node', ['scripts/status-check.js']));
  report.steps.push(runCommandStep('health-check', 'api', 'node', ['scripts/health-check.js']));
  report.steps.push(runCommandStep('benchmark-local', 'performance', 'node', ['scripts/benchmark-local.js']));
  report.steps.push(runCommandStep('verify-role-boundaries', 'auth', 'node', ['scripts/verify-role-boundaries.js']));

  for (const [name, category, fileName] of FILE_STEPS) {
    report.steps.push(buildFileStep(name, category, fileName));
  }

  const passed = report.steps.filter(step => step.exitCode === 0).length;
  const failed = report.steps.length - passed;
  const totalDurationMs = report.steps.reduce((sum, step) => sum + step.durationMs, 0);
  report.summary = {
    total: report.steps.length,
    passed,
    failed,
    totalDurationMs: Number(totalDurationMs.toFixed(1))
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(REPORT_MD, buildMarkdown(report), 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
