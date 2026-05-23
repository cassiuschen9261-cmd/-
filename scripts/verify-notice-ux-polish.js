const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const RESULT_FILE = verifyReportFile('verify_notice_ux_polish.json');

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
}

async function fetchNoticeHistory(baseUrl, headers, departmentId, field) {
  const response = await requestJson(`${baseUrl}/api/notices/history?departmentId=${encodeURIComponent(departmentId)}&field=${encodeURIComponent(field)}`, {
    headers
  });
  if (!response.ok) throw new Error(response.data?.message || '读取公告历史失败');
  return Array.isArray(response.data?.history) ? response.data.history : [];
}

async function clearNoticeHistory(baseUrl, headers, departmentId, field) {
  const response = await requestJson(`${baseUrl}/api/notices/history/${encodeURIComponent(field)}/clear?departmentId=${encodeURIComponent(departmentId)}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) throw new Error(response.data?.message || '清空公告历史失败');
}

async function importNoticeHistory(baseUrl, headers, departmentId, field, history) {
  const payload = JSON.stringify({ departmentId, field, history });
  const response = await requestJson(`${baseUrl}/api/notices/history/import`, {
    method: 'POST',
    headers: {
      Authorization: headers.Authorization,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  if (!response.ok) throw new Error(response.data?.message || '导入公告历史失败');
  return Array.isArray(response.data?.history) ? response.data.history : [];
}

function buildText(length, seed = 'A') {
  return Array.from({ length }, () => seed).join('');
}

async function setNoticeText(page, field, text) {
  await page.evaluate(({ fieldName, nextText }) => {
    const container = document.getElementById(`${fieldName}-editor`);
    const quill = container && container.__quill;
    if (!container || !quill) {
      throw new Error(`Quill editor not found for field: ${fieldName}`);
    }
    quill.setText(nextText);
  }, { fieldName: field, nextText: text });
}

async function readUxState(page) {
  return page.evaluate(() => {
    const teachingEmptyState = document.querySelector('.notice-editor-empty-state--teaching');
    const specialEmptyState = document.querySelector('.notice-editor-empty-state--special');
    const teachingCount = document.querySelector('.notice-footer-info--teaching .notice-footer-info__count');
    const teachingUpdated = document.querySelector('.notice-footer-info--teaching .notice-footer-info__updated');
    const modal = document.querySelector('.notice-history-modal');
    const preview = modal ? modal.querySelector('.notice-history-preview__content') : null;
    const entries = modal ? modal.querySelectorAll('.notice-history-entry') : [];
    const activeEditor = document.activeElement;
    return {
      teachingEmptyVisible: !!teachingEmptyState,
      specialEmptyVisible: !!specialEmptyState,
      activeElementClass: activeEditor ? activeEditor.className : '',
      teachingCountText: teachingCount ? teachingCount.textContent.trim() : '',
      teachingCountClass: teachingCount ? teachingCount.className : '',
      teachingUpdatedText: teachingUpdated ? teachingUpdated.textContent.trim() : '',
      historyModalVisible: !!modal,
      historyEntryCount: entries.length,
      historyPreviewText: preview ? preview.textContent.trim() : '',
      historyModalTitle: modal ? modal.querySelector('.notice-history-modal__title')?.textContent.trim() || '' : ''
    };
  });
}

async function run() {
  const baseUrl = resolveCliBaseUrl();
  const token = await login(baseUrl);
  const headers = { Authorization: `Bearer ${token}` };
  const originalData = await fetchData(baseUrl, headers);
  const backup = JSON.parse(JSON.stringify(originalData));
  const departmentId = originalData.currentDepartmentId;
  const originalTeachingHistory = await fetchNoticeHistory(baseUrl, headers, departmentId, 'teaching');

  const importedHistory = [
    {
      id: 'verify-ux-history-1',
      createdAt: '2026-05-21T08:30:00.000Z',
      content: '<p>晨会演练记录：这是用于验证历史弹窗新版卡片布局的测试文本。</p>'
    },
    {
      id: 'verify-ux-history-2',
      createdAt: '2026-05-20T05:15:00.000Z',
      content: '<p>临时提醒演练记录：用于验证历史记录列表切换与预览区渲染。</p>'
    }
  ];

  const nextData = JSON.parse(JSON.stringify(originalData));
  nextData.notices = {
    ...nextData.notices,
    teaching: '',
    special: ''
  };

  let browser = null;
  try {
    await saveData(baseUrl, headers, nextData);
    await clearNoticeHistory(baseUrl, headers, departmentId, 'teaching');
    await importNoticeHistory(baseUrl, headers, departmentId, 'teaching', importedHistory);

    browser = await puppeteer.launch(PUPPETEER_OPTIONS);
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.evaluate(tokenValue => {
      localStorage.setItem('paiban_auth_token', tokenValue);
    }, token);
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForSelector('#teaching-editor .ql-editor', { timeout: 20000 });
    await page.waitForTimeout(150);

    const initialState = await readUxState(page);

    await page.click('.notice-editor-empty-state--teaching');
    await page.waitForTimeout(100);
    const afterFocusState = await readUxState(page);

    await page.click('.notice-panel--teaching .notice-panel__action-btn', { delay: 10 });
    await page.waitForSelector('.notice-history-modal', { timeout: 8000 });
    await page.waitForFunction(() => {
      const entries = document.querySelectorAll('.notice-history-entry');
      return entries.length >= 2;
    }, { timeout: 8000 });
    const historyState = await readUxState(page);
    await page.click('.notice-history-modal__footer .win7-btn');
    await page.waitForTimeout(80);

    const warningText = buildText(1705, '警');
    await setNoticeText(page, 'teaching', warningText);
    await page.waitForFunction(() => {
      const count = document.querySelector('.notice-footer-info--teaching .notice-footer-info__count');
      return !!count && count.classList.contains('notice-footer-info__count--warning');
    }, { timeout: 3000 });
    const warningState = await readUxState(page);

    const dangerText = buildText(2055, '超');
    await setNoticeText(page, 'teaching', dangerText);
    await page.waitForFunction(() => {
      const count = document.querySelector('.notice-footer-info--teaching .notice-footer-info__count');
      const updated = document.querySelector('.notice-footer-info--teaching .notice-footer-info__updated');
      return !!count
        && count.classList.contains('notice-footer-info__count--danger')
        && !!updated
        && updated.textContent.includes('最近更新');
    }, { timeout: 3000 });
    const dangerState = await readUxState(page);

    const checks = {
      teachingEmptyStateVisible: initialState.teachingEmptyVisible,
      specialEmptyStateVisible: initialState.specialEmptyVisible,
      emptyStateFocusWorks: String(afterFocusState.activeElementClass || '').includes('ql-editor'),
      historyModalVisible: historyState.historyModalVisible,
      historyModalHasEntries: historyState.historyEntryCount >= 2,
      historyPreviewMatchesImportedContent: historyState.historyPreviewText.includes('晨会演练记录'),
      historyModalTitleOk: historyState.historyModalTitle === '历史版本预览',
      warningThresholdStyleWorks: warningState.teachingCountClass.includes('notice-footer-info__count--warning'),
      dangerThresholdStyleWorks: dangerState.teachingCountClass.includes('notice-footer-info__count--danger'),
      updatedLabelWorks: dangerState.teachingUpdatedText.includes('最近更新'),
      pageErrorsFree: pageErrors.length === 0
    };

    const result = {
      success: Object.values(checks).every(Boolean),
      baseUrl,
      checks,
      snapshots: {
        initialState,
        afterFocusState,
        historyState,
        warningState,
        dangerState
      },
      pageErrors
    };

    writeResult(result);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
    await saveData(baseUrl, headers, backup);
    await clearNoticeHistory(baseUrl, headers, departmentId, 'teaching');
    if (originalTeachingHistory.length > 0) {
      await importNoticeHistory(baseUrl, headers, departmentId, 'teaching', originalTeachingHistory);
    }
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
