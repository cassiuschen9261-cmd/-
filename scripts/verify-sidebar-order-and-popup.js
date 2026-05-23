const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const RESULT_FILE = verifyReportFile('verify_sidebar_order_and_popup.json');

function resolveBaseUrl() {
  return resolveCliBaseUrl();
}

function writeResult(payload) {
  fs.writeFileSync(RESULT_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function requestJson(urlString, options = {}, body) {
  const url = new URL(urlString);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        raw += chunk;
      });
      res.on('end', () => {
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (error) {
          return reject(error);
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login(baseUrl) {
  const payload = JSON.stringify({ username: '2203408', password: 'zyyfy666' });
  const response = await requestJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  if (!response.ok || !response.data.token) {
    throw new Error(response.data?.message || '登录失败');
  }
  return response.data.token;
}

async function fetchData(baseUrl, headers) {
  const response = await requestJson(`${baseUrl}/api/data`, { headers });
  if (!response.ok) throw new Error(response.data?.message || '读取数据失败');
  return response.data;
}

async function saveData(baseUrl, headers, data) {
  const payload = JSON.stringify({
    departmentId: data.currentDepartmentId,
    modules: data.modules,
    doctors: data.doctors,
    scheduleData: data.scheduleData,
    shiftTypes: data.shiftTypes,
    notices: data.notices,
    uiSettings: data.uiSettings
  });
  const response = await requestJson(`${baseUrl}/api/data`, {
    method: 'POST',
    headers: {
      Authorization: headers.Authorization,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  if (!response.ok) throw new Error(response.data?.message || '保存数据失败');
  return response.data;
}

async function run() {
  const baseUrl = resolveBaseUrl();
  const token = await login(baseUrl);
  const headers = { Authorization: `Bearer ${token}` };
  const originalData = await fetchData(baseUrl, headers);
  const backup = JSON.parse(JSON.stringify(originalData));
  const targetDate = new Date().toISOString().slice(0, 10);
  const nextData = JSON.parse(JSON.stringify(originalData));

  nextData.scheduleData[targetDate] = nextData.scheduleData[targetDate] || {};
  nextData.scheduleData[targetDate].f5 = ['sh2'];
  nextData.scheduleData[targetDate].t4 = ['sh2'];
  nextData.scheduleData[targetDate].f6 = ['sh1'];
  nextData.scheduleData[targetDate].t1 = ['sh1'];

  await saveData(baseUrl, headers, nextData);

  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.evaluate(tokenValue => {
      localStorage.setItem('paiban_auth_token', tokenValue);
    }, token);
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 20000 });

    const browserResult = await page.evaluate(async dateStr => {
      const dateInput = document.querySelector('input[type="date"]');
      if (dateInput) {
        dateInput.value = dateStr;
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const rows = Array.from(document.querySelectorAll('.duty-summary-row')).map(node => node.innerText.trim());
      const assistantRow = rows.find(text => text.includes('副班')) || '';
      const dayRow = rows.find(text => text.includes('白班')) || '';

      const scheduleCell = document.querySelector('table tbody tr td:nth-child(2)');
      if (scheduleCell) {
        scheduleCell.click();
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      const popup = document.querySelector('.shift-popup');
      const saveButton = popup
        ? Array.from(popup.querySelectorAll('button')).find(button => button.innerText.includes('保存'))
        : null;
      const clearButton = popup
        ? Array.from(popup.querySelectorAll('button')).find(button => button.innerText.includes('清空当天'))
        : null;
      const buttonOrderOk = !!(saveButton && clearButton && (saveButton.compareDocumentPosition(clearButton) & Node.DOCUMENT_POSITION_FOLLOWING));

      if (saveButton) {
        saveButton.click();
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      return {
        assistantRow,
        dayRow,
        assistantOrderOk: assistantRow.indexOf('赖文盈') !== -1
          && assistantRow.indexOf('唐亚、韦晓敏') !== -1
          && assistantRow.indexOf('赖文盈') < assistantRow.indexOf('唐亚、韦晓敏'),
        dayOrderOk: dayRow.indexOf('林沄才') !== -1
          && dayRow.indexOf('吴惠玲、蔡雪梅') !== -1
          && dayRow.indexOf('林沄才') < dayRow.indexOf('吴惠玲、蔡雪梅'),
        popupOpened: !!popup,
        saveButtonFound: !!saveButton,
        clearButtonFound: !!clearButton,
        buttonOrderOk,
        popupClosedAfterSave: !document.querySelector('.shift-popup')
      };
    }, targetDate);

    const result = {
      success: browserResult.assistantOrderOk
        && browserResult.dayOrderOk
        && browserResult.popupOpened
        && browserResult.saveButtonFound
        && browserResult.clearButtonFound
        && browserResult.buttonOrderOk
        && browserResult.popupClosedAfterSave
        && pageErrors.length === 0,
      baseUrl,
      targetDate,
      browserResult,
      pageErrors
    };
    writeResult(result);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
    await saveData(baseUrl, headers, backup);
  }
}

module.exports = { run };

if (require.main === module) {
run().catch(error => {
  const result = {
    success: false,
    error: String(error?.stack || error?.message || error)
  };
  writeResult(result);
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
});
}
