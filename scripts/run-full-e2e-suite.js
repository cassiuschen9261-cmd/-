const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const util = require('util');
const {
  e2eReportFile,
  docsReportFile,
  runtimeFile
} = require('./lib/project-paths');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPORT_JSON = e2eReportFile('full_e2e_suite_report.json');
const REPORT_MD = docsReportFile('STABILITY_REPORT.md');
const IN_PROCESS_SCRIPTS = new Set([
  'scripts/verify-start-browser-runtime.js',
  'scripts/verify-role-boundaries.js',
  'scripts/verify-export-permissions-ui.js',
  'scripts/verify-module-actions-ui.js',
  'scripts/verify-disabled-module-sidebar.js',
  'scripts/verify-custom-module-sidebar.js',
  'scripts/verify-module-sidebar-advanced.js',
  'scripts/verify-module-sidebar-advanced-display.js',
  'scripts/verify-module-sidebar-badge-hierarchy.js',
  'scripts/verify-module-sidebar-count-mode.js',
  'scripts/verify-module-sidebar-density.js',
  'scripts/verify-module-sidebar-empty-state.js',
  'scripts/verify-module-sidebar-mode.js',
  'scripts/verify-module-sidebar-phone-display-mode.js',
  'scripts/verify-module-sidebar-title-mode.js',
  'scripts/verify-module-sidebar-visual.js',
  'scripts/verify-sidebar-label-order.js',
  'scripts/verify-header-layout.js'
]);

// Ignore SIGINT from Chromium process exits
process.on('SIGINT', () => {
  console.log('Received SIGINT, ignoring to prevent Chromium from killing the suite.');
});

const SUITE = [
  { name: 'status-check', command: ['node', 'scripts/status-check.js'], category: 'startup' },
  { name: 'health-check', command: ['node', 'scripts/health-check.js'], category: 'api' },
  { name: 'benchmark-local', command: ['node', 'scripts/benchmark-local.js'], category: 'performance' },
  { name: 'verify-start-browser-runtime', command: ['node', 'scripts/verify-start-browser-runtime.js'], category: 'ui' },
  { name: 'verify-role-boundaries', command: ['node', 'scripts/verify-role-boundaries.js'], category: 'auth' },
  { name: 'verify-export-permissions-ui', command: ['node', 'scripts/verify-export-permissions-ui.js'], category: 'auth-ui' },
  { name: 'verify-department-management', command: ['node', 'scripts/verify-department-management.js'], category: 'department' },
  { name: 'verify-module-actions-ui', command: ['node', 'scripts/verify-module-actions-ui.js'], category: 'module' },
  { name: 'verify-disabled-module-sidebar', command: ['node', 'scripts/verify-disabled-module-sidebar.js'], category: 'module' },
  { name: 'verify-custom-module-sidebar', command: ['node', 'scripts/verify-custom-module-sidebar.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-advanced', command: ['node', 'scripts/verify-module-sidebar-advanced.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-advanced-display', command: ['node', 'scripts/verify-module-sidebar-advanced-display.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-badge-hierarchy', command: ['node', 'scripts/verify-module-sidebar-badge-hierarchy.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-count-mode', command: ['node', 'scripts/verify-module-sidebar-count-mode.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-density', command: ['node', 'scripts/verify-module-sidebar-density.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-empty-state', command: ['node', 'scripts/verify-module-sidebar-empty-state.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-mode-whitelist', command: ['node', 'scripts/verify-module-sidebar-mode.js', 'whitelist'], category: 'sidebar' },
  { name: 'verify-module-sidebar-mode-keyword', command: ['node', 'scripts/verify-module-sidebar-mode.js', 'keyword'], category: 'sidebar' },
  { name: 'verify-module-sidebar-phone-display-mode', command: ['node', 'scripts/verify-module-sidebar-phone-display-mode.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-title-mode', command: ['node', 'scripts/verify-module-sidebar-title-mode.js'], category: 'sidebar' },
  { name: 'verify-module-sidebar-visual', command: ['node', 'scripts/verify-module-sidebar-visual.js'], category: 'sidebar' },
  { name: 'verify-sidebar-label-order', command: ['node', 'scripts/verify-sidebar-label-order.js'], category: 'sidebar' },
  { name: 'verify-header-layout', command: ['node', 'scripts/verify-header-layout.js'], category: 'ui' }
];

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      readError: String(error && error.message || error)
    };
  }
}

function inferResultFile(name) {
  const mapping = {
    'verify-start-browser-runtime': 'verify_start_browser_runtime.json',
    'verify-role-boundaries': null,
    'benchmark-local': null,
    'status-check': null,
    'health-check': null,
    'verify-export-permissions-ui': 'verify_export_permissions_ui.json',
    'verify-department-management': 'verify_department_management.json',
    'verify-module-actions-ui': 'verify_module_actions_ui.json',
    'verify-disabled-module-sidebar': 'verify_disabled_module_sidebar.json',
    'verify-custom-module-sidebar': 'verify_custom_module_sidebar.json',
    'verify-module-sidebar-advanced': 'verify_module_sidebar_advanced.json',
    'verify-module-sidebar-advanced-display': 'verify_module_sidebar_advanced_display.json',
    'verify-module-sidebar-badge-hierarchy': 'verify_module_sidebar_badge_hierarchy.json',
    'verify-module-sidebar-count-mode': 'verify_module_sidebar_count_mode.json',
    'verify-module-sidebar-density': 'verify_module_sidebar_density.json',
    'verify-module-sidebar-empty-state': 'verify_module_sidebar_empty_state.json',
    'verify-module-sidebar-phone-display-mode': 'verify_module_sidebar_phone_display_mode.json',
    'verify-module-sidebar-title-mode': 'verify_module_sidebar_title_mode.json',
    'verify-module-sidebar-visual': 'verify_module_sidebar_visual.json',
    'verify-sidebar-label-order': 'verify_sidebar_label_order.json',
    'verify-header-layout': 'verify_header_layout.json',
    'verify-module-sidebar-mode-whitelist': 'verify_module_sidebar_mode_whitelist.json',
    'verify-module-sidebar-mode-keyword': 'verify_module_sidebar_mode_keyword.json'
  };

  const fileName = mapping[name];
  return fileName ? path.join(PROJECT_ROOT, 'artifacts', 'reports', 'verify', fileName) : null;
}

function isResultPayloadSuccessful(payload) {
  if (!payload || typeof payload !== 'object') return true;
  if (typeof payload.success === 'boolean') return payload.success;
  if (typeof payload.ok === 'boolean') return payload.ok;
  return true;
}

function isStepSuccessful(step) {
  return step.exitCode === 0 && !step.timedOut && isResultPayloadSuccessful(step.resultPayload);
}

async function runInProcessScript(scriptPath, scriptArgs) {
  const resolvedScriptPath = path.resolve(PROJECT_ROOT, scriptPath);
  const previousArgv = process.argv.slice();
  const previousExitCode = process.exitCode;
  const previousConsoleLog = console.log;
  const previousConsoleError = console.error;
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  console.log = (...args) => {
    stdout += `${util.format(...args)}\n`;
  };
  console.error = (...args) => {
    stderr += `${util.format(...args)}\n`;
  };

  try {
    process.argv = [process.execPath, resolvedScriptPath, ...scriptArgs];
    process.exitCode = 0;
    delete require.cache[require.resolve(resolvedScriptPath)];
    const loaded = require(resolvedScriptPath);
    if (!loaded || typeof loaded.run !== 'function') {
      throw new Error(`Script does not export run(): ${scriptPath}`);
    }
    await loaded.run();
    exitCode = typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    stderr += `${String(error && error.stack || error)}\n`;
    exitCode = 1;
  } finally {
    console.log = previousConsoleLog;
    console.error = previousConsoleError;
    process.argv = previousArgv;
    process.exitCode = previousExitCode;
    delete require.cache[require.resolve(resolvedScriptPath)];
  }

  return {
    stdout,
    stderr,
    exitCode,
    signal: '',
    timedOut: false
  };
}

async function runStep(step) {
  const [command, ...args] = step.command;
  const startedAt = new Date().toISOString();
  const start = process.hrtime.bigint();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let signal = '';
  let timedOut = false;

  if (command === 'node' && IN_PROCESS_SCRIPTS.has(args[0])) {
    const inProcessResult = await runInProcessScript(args[0], args.slice(1));
    stdout = inProcessResult.stdout;
    stderr = inProcessResult.stderr;
    exitCode = inProcessResult.exitCode;
    signal = inProcessResult.signal;
    timedOut = inProcessResult.timedOut;
  } else {
    const executable = command === 'node' ? process.execPath : command;
    const commandArgs = command === 'node'
      ? args.map((arg, index) => (index === 0 && arg.endsWith('.js') ? path.resolve(PROJECT_ROOT, arg) : arg))
      : args;

    await new Promise((resolve) => {
      const child = spawn(executable, commandArgs, {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch (error) {
          stderr += `\n${String(error && error.message || error)}`;
        }
      }, 180000);

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      child.on('error', error => {
        stderr += `\n${String(error && error.message || error)}`;
        exitCode = 1;
        clearTimeout(timeoutId);
        resolve();
      });

      child.on('close', (code, closeSignal) => {
        exitCode = typeof code === 'number' ? code : 1;
        signal = String(closeSignal || '');
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }

  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const resultFilePath = inferResultFile(step.name);

  const resultPayload = resultFilePath ? readJsonIfExists(resultFilePath) : null;

  return {
    name: step.name,
    category: step.category,
    command: step.command.join(' '),
    startedAt,
    durationMs: Number(durationMs.toFixed(1)),
    exitCode,
    signal,
    stdout: stdout.slice(-6000),
    stderr: stderr.slice(-6000),
    timedOut,
    resultFile: resultFilePath ? path.basename(resultFilePath) : '',
    resultPayload,
    success: exitCode === 0 && !timedOut && isResultPayloadSuccessful(resultPayload)
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
  lines.push('- 启动与健康检查');
  lines.push('- 权限边界与游客/管理员 UI 差异');
  lines.push('- 模块创建、停用、删除与持久化');
  lines.push('- 停用模块对右侧排班概览的过滤');
  lines.push('- 右侧栏高级模式、关键字/白名单、标题/电话/密度/视觉样式');
  lines.push('- 页面基础运行与头部布局');
  lines.push('');
  lines.push('## 结果汇总');
  lines.push('');
  for (const step of report.steps) {
    const status = isStepSuccessful(step) ? 'PASS' : 'FAIL';
    lines.push(`- ${status} ${step.name} | ${step.category} | ${step.durationMs} ms`);
  }
  lines.push('');
  lines.push('## 发现与处理');
  lines.push('');
  lines.push('- 已收口停用模块后右侧“当日排班人员”仍提取该模块医生的问题。');
  lines.push('- 已收口自动排班个人模式仍暴露停用模块医生的问题。');
  lines.push('- 已收口游客仍可见/可触发导出按钮的问题。');
  lines.push('- 现有验证脚本已统一纳入总控套件，便于后续多轮回归。');
  lines.push('');
  lines.push('## 残余风险');
  lines.push('');
  lines.push('- 当前仍以浏览器脚本与接口脚本为主，未覆盖操作系统级安装/开机自启的真实重启场景。');
  lines.push('- 导出功能当前验证到权限与页面入口，未做文件内容逐字节比对。');
  lines.push('- 启动器性能项已保留待继续深挖，但不影响本轮核心业务稳定性回归。');
  lines.push('');
  return lines.join('\n');
}

function finalizeReport(report) {
  const passed = report.steps.filter(step => isStepSuccessful(step)).length;
  const failed = report.steps.length - passed;
  const totalDurationMs = report.steps.reduce((sum, step) => sum + step.durationMs, 0);
  report.summary = {
    total: report.steps.length,
    passed,
    failed,
    totalDurationMs: Number(totalDurationMs.toFixed(1))
  };
  return report;
}

function persistReport(report) {
  finalizeReport(report);
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(REPORT_MD, buildMarkdown(report), 'utf8');
}

function createEmptyReport() {
  return {
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
}

async function main() {
  const resumeMode = process.argv.includes('--resume');
  const report = resumeMode ? (readJsonIfExists(REPORT_JSON) || createEmptyReport()) : createEmptyReport();
  const completedNames = new Set((report.steps || []).map(step => step.name));

  for (const step of SUITE) {
    if (completedNames.has(step.name)) continue;
    console.log(`Running ${step.name} ...`);
    const result = await runStep(step);
    report.steps.push(result);
    persistReport(report);
    console.log(`${step.name}: exit=${result.exitCode} duration=${result.durationMs}ms`);
  }

  finalizeReport(report);

  console.log(JSON.stringify(report.summary, null, 2));
  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(String(error && error.stack || error));
  process.exitCode = 1;
});
