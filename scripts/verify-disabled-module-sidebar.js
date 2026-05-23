const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const RESULT_FILE = verifyReportFile('verify_disabled_module_sidebar.json');
const AUTH_TOKEN_KEY = 'paiban_auth_token';
const ACTIVE_DEPARTMENT_KEY = 'paiban_active_department_id';
const ADMIN_USERNAME = '2203408';
const ADMIN_PASSWORD = 'zyyfy666';
const TARGET_MODULE_ID = 'teaching_clinic';
const VERIFY_DOCTOR_ID = 'verify-disabled-module-doctor';
const VERIFY_DOCTOR_NAME = '验证停用模块医生';
const VERIFY_SHIFT_ID = 'sh5';

function resolveBaseUrl() {
  return resolveCliBaseUrl();
}

function writeResult(result) {
  fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8');
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function clickButtonByText(page, text) {
  await page.waitForFunction(
    expected => [...document.querySelectorAll('button')]
      .some(button => button.innerText.trim() === expected && !button.disabled),
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

async function run() {
  const baseUrl = resolveBaseUrl();
  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  const page = await browser.newPage();
  const todayStr = formatDate(new Date());
  const result = {
    ok: false,
    baseUrl,
    todayStr,
    tempDepartmentName: `停用模块侧栏验证_${Date.now()}`,
    targetModuleId: TARGET_MODULE_ID,
    verifyDoctorName: VERIFY_DOCTOR_NAME,
    verifyShiftId: VERIFY_SHIFT_ID,
    consoleMessages: [],
    pageErrors: [],
    step: 'init'
  };
  writeResult(result);

  page.on('console', msg => result.consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => result.pageErrors.push(String((err && err.stack) || err)));

  try {
    result.step = 'open_home';
    writeResult(result);
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });

    result.step = 'login';
    writeResult(result);
    await clickButtonByText(page, '管理员登录');
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
    await page.type('input[autocomplete="username"]', ADMIN_USERNAME);
    await page.type('input[autocomplete="current-password"]', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForResponse(
        response => response.url().includes('/api/auth/login') && response.request().method() === 'POST' && response.status() === 200,
        { timeout: 15000 }
      ),
      clickButtonByText(page, '登录')
    ]);
    await page.waitForFunction(() => document.body.innerText.includes('终端管理员'));

    result.step = 'prepare_temp_department';
    writeResult(result);
    const prep = await page.evaluate(async ({ tempDepartmentName, todayStr, targetModuleId, verifyDoctorId, verifyDoctorName, verifyShiftId }) => {
      const token = localStorage.getItem('paiban_auth_token');
      if (!token) {
        throw new Error('Missing auth token in localStorage');
      }

      const authHeaders = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      async function requestJson(url, options = {}) {
        const response = await fetch(url, options);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message || `${response.status} ${response.statusText}`);
        }
        return payload;
      }

      const created = await requestJson('/api/departments', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: tempDepartmentName })
      });

      const departmentId = String(created.currentDepartmentId || '').trim();
      if (!departmentId) {
        throw new Error('Department ID missing after creation');
      }

      const departmentData = await requestJson(`/api/data?departmentId=${encodeURIComponent(departmentId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const modules = (departmentData.modules || []).map(module => (
        module.id === targetModuleId ? { ...module, enabled: false } : module
      ));
      const doctors = [
        ...(departmentData.doctors || []),
        {
          id: verifyDoctorId,
          name: verifyDoctorName,
          title: '主治医师',
          category: targetModuleId,
          phone: '12345678'
        }
      ];
      const scheduleData = {
        ...(departmentData.scheduleData || {}),
        [todayStr]: {
          [verifyDoctorId]: [verifyShiftId]
        }
      };

      await requestJson('/api/data', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          departmentId,
          modules,
          doctors,
          scheduleData,
          shiftTypes: departmentData.shiftTypes || [],
          notices: departmentData.notices || {},
          uiSettings: departmentData.uiSettings || {},
          skipAutoHistorySnapshot: true
        })
      });

      localStorage.setItem('paiban_active_department_id', departmentId);
      return { departmentId };
    }, {
      tempDepartmentName: result.tempDepartmentName,
      todayStr,
      targetModuleId: TARGET_MODULE_ID,
      verifyDoctorId: VERIFY_DOCTOR_ID,
      verifyDoctorName: VERIFY_DOCTOR_NAME,
      verifyShiftId: VERIFY_SHIFT_ID
    });
    result.departmentId = prep.departmentId;
    writeResult(result);

    result.step = 'reload_department';
    writeResult(result);
    await page.evaluate(({ departmentId, activeDepartmentKey }) => {
      localStorage.setItem(activeDepartmentKey, departmentId);
    }, {
      departmentId: result.departmentId,
      activeDepartmentKey: ACTIVE_DEPARTMENT_KEY
    });
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForFunction(expectedDepartmentId => {
      const select = document.querySelector('select');
      return !!select && select.value === expectedDepartmentId;
    }, { timeout: 15000 }, result.departmentId);

    result.step = 'verify_sidebar';
    writeResult(result);
    await page.$eval('input[type="date"]', (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, todayStr);

    const sidebarState = await page.evaluate((verifyDoctorName) => {
      const panels = [...document.querySelectorAll('.win7-subpanel')];
      const sidebarPanel = panels.find(panel => panel.innerText.includes('当日排班人员'));
      if (!sidebarPanel) {
        return {
          foundPanel: false,
          text: ''
        };
      }
      return {
        foundPanel: true,
        text: sidebarPanel.innerText,
        hasVerifyDoctor: sidebarPanel.innerText.includes(verifyDoctorName),
        emptyStateShown: sidebarPanel.innerText.includes('当日暂无排班人员')
      };
    }, VERIFY_DOCTOR_NAME);

    result.sidebarState = sidebarState;
    result.ok = sidebarState.foundPanel && !sidebarState.hasVerifyDoctor;
    writeResult(result);

    if (!result.ok) {
      throw new Error('Disabled module doctor still appears in sidebar');
    }
  } catch (error) {
    result.error = String((error && error.stack) || error);
    result.step = 'failed';
    writeResult(result);
    throw error;
  } finally {
    try {
      if (result.departmentId) {
        await page.evaluate(async ({ departmentId, authTokenKey }) => {
          const token = localStorage.getItem(authTokenKey);
          if (!token) return;
          await fetch(`/api/departments/${encodeURIComponent(departmentId)}?departmentId=dept-default`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          localStorage.setItem('paiban_active_department_id', 'dept-default');
        }, {
          departmentId: result.departmentId,
          authTokenKey: AUTH_TOKEN_KEY
        });
      }
    } catch (cleanupError) {
      result.cleanupError = String(cleanupError);
      writeResult(result);
    }
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
