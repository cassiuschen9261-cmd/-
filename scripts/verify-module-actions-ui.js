const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS, PROJECT_ROOT } = require('./lib/project-paths');

const RESULT_FILE = verifyReportFile('verify_module_actions_ui.json');
const ADMIN_USERNAME = '2203408';
const ADMIN_PASSWORD = 'zyyfy666';
const DISABLE_TARGET = 'teaching_clinic';
const DELETE_TARGET = 'trainee';

function resolveBaseUrl() {
  return resolveCliBaseUrl();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeResult(result) {
  fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8');
}

function markStep(result, step, extra = {}) {
  result.step = step;
  Object.assign(result, extra);
  writeResult(result);
  console.log(`[verify-module-actions-ui] ${step}`);
}

async function clickButtonByText(page, text) {
  await page.waitForFunction(
    expected => {
      return [...document.querySelectorAll('button')]
        .some(button => button.innerText.trim() === expected && !button.disabled);
    },
    {},
    text
  );

  const buttons = await page.$$('button');
  for (const button of buttons) {
    const info = await button.evaluate(node => ({
      text: node.innerText.trim(),
      disabled: !!node.disabled
    }));
    if (info.text === text && !info.disabled) {
      await button.click();
      return;
    }
  }

  throw new Error(`Button not found: ${text}`);
}

async function clickRowButton(page, rowText, buttonText) {
  await page.waitForFunction(
    ({ expectedRowText, expectedButtonText }) => {
      return [...document.querySelectorAll('tr')].some(row => {
        if (row.offsetParent === null) return false;
        if (!row.innerText.includes(expectedRowText)) return false;
        return [...row.querySelectorAll('button')]
          .some(button => button.innerText.trim() === expectedButtonText && !button.disabled);
      });
    },
    {},
    { expectedRowText: rowText, expectedButtonText: buttonText }
  );

  const rows = await page.$$('tr');
  for (const row of rows) {
    const rowInfo = await row.evaluate(node => ({
      text: node.innerText || '',
      visible: node.offsetParent !== null
    }));
    if (!rowInfo.visible) continue;
    if (!rowInfo.text.includes(rowText)) continue;

    const buttons = await row.$$('button');
    for (const button of buttons) {
      const info = await button.evaluate(node => ({
        text: node.innerText.trim(),
        disabled: !!node.disabled
      }));
      if (info.text === buttonText && !info.disabled) {
        await button.click();
        return;
      }
    }
  }

  throw new Error(`Button "${buttonText}" not found in row "${rowText}"`);
}

async function getModuleRowState(page, moduleName) {
  return page.evaluate(expectedModuleName => {
    const row = [...document.querySelectorAll('tr')]
      .find(item => item.offsetParent !== null
        && item.innerText.includes(expectedModuleName)
        && item.querySelectorAll('button').length > 0);
    if (!row) return null;

    const buttons = [...row.querySelectorAll('button')].map(button => ({
      text: button.innerText.trim(),
      disabled: !!button.disabled
    }));

    return {
      text: row.innerText,
      buttons
    };
  }, moduleName);
}

async function getVisibleActionRows(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('tr')]
      .filter(row => row.offsetParent !== null && row.querySelectorAll('button').length >= 2)
      .map(row => ({
        text: row.innerText,
        buttons: [...row.querySelectorAll('button')].map(button => button.innerText.trim())
      }));
  });
}

async function waitForAlertText(page, text) {
  await page.waitForFunction(
    expected => document.body.innerText.includes(expected),
    { timeout: 15000 },
    text
  );
}

async function waitForModuleText(page, moduleName, expectedText, shouldExist = true) {
  await page.waitForFunction(
    ({ expectedModuleName, expectedRowText, expectedShouldExist }) => {
      const row = [...document.querySelectorAll('tr')]
        .find(item => item.innerText.includes(expectedModuleName));
      if (!expectedShouldExist) return row === undefined;
      return !!row && row.innerText.includes(expectedRowText);
    },
    { timeout: 5000 },
    {
      expectedModuleName: moduleName,
      expectedRowText: expectedText,
      expectedShouldExist: shouldExist
    }
  );
}

async function waitForCurrentDepartment(page, departmentName) {
  await page.waitForFunction(
    expected => {
      const select = document.querySelector('select');
      if (!select) return false;
      const selected = select.options[select.selectedIndex];
      return !!selected && selected.textContent.includes(expected);
    },
    { timeout: 15000 },
    departmentName
  );
}

async function cleanupDepartment(page) {
  await page.evaluate(async () => {
    const token = localStorage.getItem('paiban_auth_token');
    const select = document.querySelector('select');
    const departmentId = select ? String(select.value || '').trim() : '';
    if (!token || !departmentId || departmentId === 'dept-default') return;

    const response = await fetch(`/api/departments/${encodeURIComponent(departmentId)}?departmentId=dept-default`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`Cleanup API failed: ${response.status} ${payload}`);
    }
  });

  await delay(300);
}

async function run() {
  const baseUrl = resolveBaseUrl();
  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  const page = await browser.newPage();
  const dialogs = [];
  const consoleMessages = [];
  const pageErrors = [];
  const result = {
    ok: false,
    baseUrl,
    tempDepartmentName: `UI验证空白科室_${Date.now()}`,
    step: 'init',
    dialogs,
    consoleMessages,
    pageErrors
  };
  writeResult(result);

  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String((err && err.stack) || err)));
  await page.evaluateOnNewDocument(() => {
    const recordedMessages = [];
    window.__paibanConfirmMessages = recordedMessages;
    window.confirm = message => {
      recordedMessages.push(String(message || ''));
      return true;
    };
  });
  page.on('dialog', async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });

  try {
    markStep(result, 'open_home');
    console.log(`Navigating to ${baseUrl}...`);
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Page loaded, waiting for login button...');
    await page.waitForFunction(() => document.body.innerText.includes('管理员登录') || document.body.innerText.includes('切换账号'), { timeout: 15000 });
    console.log('Login button found.');

    markStep(result, 'open_login');
    await clickButtonByText(page, '管理员登录');
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
    await page.type('input[autocomplete="username"]', ADMIN_USERNAME);
    await page.type('input[autocomplete="current-password"]', ADMIN_PASSWORD);

    markStep(result, 'submit_login');
    await Promise.all([
      page.waitForResponse(
        response => response.url().includes('/api/auth/login') && response.request().method() === 'POST' && response.status() === 200,
        { timeout: 15000 }
      ),
      clickButtonByText(page, '登录')
    ]);

    await page.waitForFunction(() => document.body.innerText.includes('终端管理员'));

    markStep(result, 'open_department_manager');
    await clickButtonByText(page, '科室');
    await page.waitForFunction(() => document.body.innerText.includes('科室表单管理'));
    await page.type('input[placeholder="例如：心内科二病区"]', result.tempDepartmentName);

    markStep(result, 'create_blank_department');
    await Promise.all([
      page.waitForResponse(
        response => response.url().includes('/api/departments') && response.request().method() === 'POST' && response.status() === 200,
        { timeout: 15000 }
      ),
      clickButtonByText(page, '创建空白科室')
    ]);

    await waitForAlertText(page, '新科室创建成功');
    await waitForCurrentDepartment(page, result.tempDepartmentName);

    markStep(result, 'open_module_manager');
    await clickButtonByText(page, '模块设计');
    await page.waitForFunction(() => document.body.innerText.includes('当前启用中'));

    result.initialModuleCount = await page.evaluate(() => {
      return [...document.querySelectorAll('tr')]
        .filter(row => row.offsetParent !== null && row.querySelectorAll('button').length >= 2).length;
    });
    result.visibleActionRows = await getVisibleActionRows(page);
    writeResult(result);

    result.disableStateBeforeClick = await getModuleRowState(page, DISABLE_TARGET);
    markStep(result, 'disable_module');
    await clickRowButton(page, DISABLE_TARGET, '停用');
    result.disableStateAfterClick = await getModuleRowState(page, DISABLE_TARGET);
    result.confirmMessagesAfterDisableClick = await page.evaluate(() => window.__paibanConfirmMessages || []);
    markStep(result, 'disable_clicked');
    await delay(500);
    await waitForModuleText(page, DISABLE_TARGET, '当前已停用');

    const disabledState = await getModuleRowState(page, DISABLE_TARGET);
    if (!disabledState || !disabledState.text.includes('当前已停用')) {
      throw new Error(`Disable action did not update UI for module: ${DISABLE_TARGET}`);
    }
    markStep(result, 'disable_verified');

    result.deleteStateBeforeClick = await getModuleRowState(page, DELETE_TARGET);
    markStep(result, 'delete_module');
    await clickRowButton(page, DELETE_TARGET, '删除');
    result.deleteStateAfterClick = await getModuleRowState(page, DELETE_TARGET);
    result.confirmMessagesAfterDeleteClick = await page.evaluate(() => window.__paibanConfirmMessages || []);
    markStep(result, 'delete_clicked');
    await delay(500);
    await waitForModuleText(page, DELETE_TARGET, '', false);

    const deletedState = await getModuleRowState(page, DELETE_TARGET);
    if (deletedState) {
      throw new Error(`Delete action did not remove module row: ${DELETE_TARGET}`);
    }
    markStep(result, 'delete_verified');

    markStep(result, 'reload_page');
    await delay(1800);
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes('终端管理员'));
    await waitForCurrentDepartment(page, result.tempDepartmentName);

    markStep(result, 'reopen_module_manager');
    await clickButtonByText(page, '模块设计');
    await page.waitForFunction(() => document.body.innerText.includes('模块设计'));

    const persistedDisabledState = await getModuleRowState(page, DISABLE_TARGET);
    const persistedDeletedState = await getModuleRowState(page, DELETE_TARGET);

    result.disablePersisted = !!persistedDisabledState
      && persistedDisabledState.text.includes('当前已停用')
      && persistedDisabledState.buttons.some(button => button.text === '启用');
    result.deletePersisted = persistedDeletedState === null;
    result.remainingModuleCount = await page.evaluate(() => {
      return [...document.querySelectorAll('tr')]
        .filter(row => row.offsetParent !== null && row.querySelectorAll('button').length >= 2).length;
    });
    result.confirmMessages = await page.evaluate(() => window.__paibanConfirmMessages || []);

    if (!result.disablePersisted) {
      throw new Error(`Disabled module was not persisted after reload: ${DISABLE_TARGET}`);
    }
    if (!result.deletePersisted) {
      throw new Error(`Deleted module reappeared after reload: ${DELETE_TARGET}`);
    }

    markStep(result, 'cleanup_department');
    await cleanupDepartment(page);
    result.ok = true;
    markStep(result, 'done');
  } catch (error) {
    result.error = String((error && error.stack) || error);
    markStep(result, 'failed');
    try {
      await fs.promises.writeFile(path.join(PROJECT_ROOT, 'verify_module_actions_ui_error.html'), await page.content(), 'utf8');
    } catch (writeError) {
      result.errorSnapshotWriteFailed = String(writeError);
    }
    throw error;
  } finally {
    writeResult(result);
    await browser.close();
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
