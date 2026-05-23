const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const RESULT_FILE = verifyReportFile('verify_export_content.json');
const ADMIN_USERNAME = '2203408';
const ADMIN_PASSWORD = 'zyyfy666';
const ACTIVE_DEPARTMENT_KEY = 'paiban_active_department_id';
const VERIFY_DOCTOR_ID = `verify-export-doctor-${Date.now()}`;
const VERIFY_DOCTOR_NAME = '导出验证医生';
const VERIFY_DOCTOR_TITLE = '主治医师';
const VERIFY_SHIFT_ID = `verify-export-shift-${Date.now()}`;
const VERIFY_SHIFT_NAME = '导出验证班次';

function resolveBaseUrl() {
  return resolveCliBaseUrl();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeResult(result) {
  fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8');
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

async function apiFetch(page, requestPath, { method = 'GET', body } = {}) {
  return page.evaluate(async ({ requestPath, method, body }) => {
    const token = localStorage.getItem('paiban_auth_token');
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(requestPath, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (error) {
      data = { raw };
    }

    return { status: response.status, data };
  }, { requestPath, method, body });
}

function getTargetDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

async function installExportHooks(page) {
  await page.evaluate(() => {
    window.__paibanExportCapture = {
      excel: null,
      word: null,
      pdf: null
    };

    if (window.XLSX && !window.__paibanExportCaptureExcelHooked) {
      const originalWriteFile = window.XLSX.writeFile.bind(window.XLSX);
      window.__paibanExportCaptureExcelHooked = true;
      window.XLSX.writeFile = function patchedWriteFile(workbook, filename) {
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          blankrows: false,
          raw: false
        });
        window.__paibanExportCapture.excel = {
          filename,
          sheetName,
          rows
        };
        return { intercepted: true, originalWriteFileExists: !!originalWriteFile };
      };
    }

    if (!window.__paibanExportCaptureBlobHooked) {
      window.__paibanExportCaptureBlobHooked = true;
      const blobMap = new Map();
      let blobCounter = 0;
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
      const originalClick = HTMLAnchorElement.prototype.click;

      URL.createObjectURL = function patchedCreateObjectURL(blob) {
        const url = `blob:paiban-export-${++blobCounter}`;
        blobMap.set(url, blob);
        return url;
      };

      URL.revokeObjectURL = function patchedRevokeObjectURL(url) {
        blobMap.delete(url);
        try {
          return originalRevokeObjectURL(url);
        } catch (error) {
          return undefined;
        }
      };

      HTMLAnchorElement.prototype.click = function patchedClick() {
        const href = this.getAttribute('href') || this.href || '';
        const filename = this.getAttribute('download') || this.download || '';
        if (filename && blobMap.has(href)) {
          const blob = blobMap.get(href);
          blob.text().then(text => {
            window.__paibanExportCapture.word = {
              filename,
              text,
              type: blob.type,
              size: blob.size
            };
          });
          return;
        }
        return originalClick.apply(this, arguments);
      };

      window.__paibanExportOriginalCreateObjectURL = originalCreateObjectURL;
    }

    window.html2pdf = function patchedHtml2Pdf() {
      const captured = {
        options: null,
        html: '',
        text: ''
      };
      return {
        set(options) {
          captured.options = options;
          return this;
        },
        from(node) {
          captured.html = node.innerHTML || '';
          captured.text = node.innerText || '';
          window.__paibanExportCapture.pdf = {
            filename: captured.options?.filename || '',
            options: captured.options,
            html: captured.html,
            text: captured.text
          };
          return this;
        },
        save() {
          return Promise.resolve();
        }
      };
    };
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(async () => {
  const baseUrl = resolveBaseUrl();
  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  const page = await browser.newPage();
  const result = {
    ok: false,
    baseUrl,
    tempDepartmentName: `导出验证空白科室_${Date.now()}`,
    tempDepartmentId: '',
    targetDate: getTargetDate(),
    verifyDoctorName: VERIFY_DOCTOR_NAME,
    verifyShiftName: VERIFY_SHIFT_NAME,
    step: 'init',
    consoleMessages: [],
    pageErrors: [],
    captures: {}
  };
  writeResult(result);

  page.on('console', msg => result.consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => result.pageErrors.push(String((err && err.stack) || err)));

  try {
    result.step = 'open_home';
    writeResult(result);
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes('管理员登录'));

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

    result.step = 'create_temp_department';
    writeResult(result);
    const createResponse = await apiFetch(page, '/api/departments', {
      method: 'POST',
      body: { name: result.tempDepartmentName }
    });
    assert(createResponse.status === 200, `Create department failed: ${createResponse.status}`);
    result.tempDepartmentId = String(createResponse.data.currentDepartmentId || createResponse.data.department?.id || '').trim();
    assert(result.tempDepartmentId, 'Missing temporary department id');

    const detailResponse = await apiFetch(page, `/api/data?departmentId=${encodeURIComponent(result.tempDepartmentId)}`);
    assert(detailResponse.status === 200, `Read temp department failed: ${detailResponse.status}`);

    const detail = detailResponse.data;
    const targetModule = (detail.modules || []).find(module => module && module.enabled !== false) || (detail.modules || [])[0];
    assert(targetModule && targetModule.id, 'No available module found for export verification');

    const verifyShift = {
      id: VERIFY_SHIFT_ID,
      name: VERIFY_SHIFT_NAME,
      short: '验',
      color: 'blue',
      categories: [targetModule.id],
      order: ((detail.shiftTypes || []).length + 1),
      systemKey: 'verify_export'
    };
    const verifyDoctor = {
      id: VERIFY_DOCTOR_ID,
      name: VERIFY_DOCTOR_NAME,
      title: VERIFY_DOCTOR_TITLE,
      category: targetModule.id,
      order: 1
    };

    const saveResponse = await apiFetch(page, '/api/data', {
      method: 'POST',
      body: {
        departmentId: result.tempDepartmentId,
        modules: detail.modules || [],
        doctors: [verifyDoctor],
        scheduleData: {
          [result.targetDate]: {
            [VERIFY_DOCTOR_ID]: [VERIFY_SHIFT_ID]
          }
        },
        shiftTypes: [...(detail.shiftTypes || []), verifyShift],
        notices: detail.notices || {},
        uiSettings: detail.uiSettings || {},
        skipAutoHistorySnapshot: true
      }
    });
    assert(saveResponse.status === 200, `Save export fixture failed: ${saveResponse.status}`);

    result.step = 'reload_temp_department';
    writeResult(result);
    await page.evaluate(departmentId => {
      localStorage.setItem('paiban_active_department_id', departmentId);
    }, result.tempDepartmentId);
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForFunction(
      expected => {
        const select = document.querySelector('select');
        return !!select && String(select.value || '').trim() === expected && document.body.innerText.includes('终端管理员');
      },
      { timeout: 15000 },
      result.tempDepartmentId
    );

    result.step = 'install_hooks';
    writeResult(result);
    await installExportHooks(page);

    result.step = 'export_excel';
    writeResult(result);
    await clickButtonByText(page, '导出 Excel');
    await page.waitForFunction(() => !!window.__paibanExportCapture?.excel, { timeout: 10000 });

    result.step = 'export_word';
    writeResult(result);
    await clickButtonByText(page, '导出 Word');
    await page.waitForFunction(() => !!window.__paibanExportCapture?.word?.text, { timeout: 10000 });

    result.step = 'export_pdf';
    writeResult(result);
    await clickButtonByText(page, '导出 PDF');
    await page.waitForFunction(() => !!window.__paibanExportCapture?.pdf?.filename, { timeout: 10000 });
    await delay(200);

    result.captures = await page.evaluate(() => window.__paibanExportCapture);

    const excel = result.captures.excel || {};
    const word = result.captures.word || {};
    const pdf = result.captures.pdf || {};
    const excelRows = Array.isArray(excel.rows) ? excel.rows : [];
    const headerRow = excelRows[0] || [];
    const doctorRow = excelRows.find(row => Array.isArray(row) && row.includes('导出验证医生')) || [];
    const doctorRowText = doctorRow.join(' | ');

    assert(String(excel.filename || '').endsWith('.xlsx'), 'Excel filename is invalid');
    assert(String(excel.sheetName || '') === '排班表', 'Excel sheet name is invalid');
    assert(headerRow[0] === '人员类别' && headerRow[1] === '姓名' && headerRow[2] === '职称', 'Excel headers are invalid');
    assert(doctorRow.includes('导出验证医生'), 'Excel missing verify doctor row');
    assert(doctorRow.includes('主治医师'), 'Excel missing verify doctor title');
    assert(doctorRowText.includes('导出验证班次'), 'Excel missing verify shift text');

    assert(String(word.filename || '').endsWith('.doc'), 'Word filename is invalid');
    assert(String(word.text || '').includes('临床医生排班表'), 'Word missing export title');
    assert(String(word.text || '').includes('导出验证医生'), 'Word missing verify doctor');
    assert(String(word.text || '').includes('导出验证班次'), 'Word missing verify shift');

    assert(String(pdf.filename || '').endsWith('.pdf'), 'PDF filename is invalid');
    assert(String(pdf.html || '').includes('export-title'), 'PDF missing export markup');
    assert(String(pdf.text || '').includes('导出验证医生'), 'PDF missing verify doctor');
    assert(String(pdf.text || '').includes('导出验证班次'), 'PDF missing verify shift');

    result.ok = result.pageErrors.length === 0;
    result.step = 'done';
    writeResult(result);
  } catch (error) {
    result.error = String((error && error.stack) || error);
    writeResult(result);
    throw error;
  } finally {
    try {
      if (result.tempDepartmentId) {
        await apiFetch(page, `/api/departments/${encodeURIComponent(result.tempDepartmentId)}?departmentId=dept-default`, {
          method: 'DELETE'
        });
      }
    } catch (cleanupError) {
      result.cleanupError = String((cleanupError && cleanupError.stack) || cleanupError);
      writeResult(result);
    }

    try {
      await page.evaluate(() => {
        localStorage.setItem('paiban_active_department_id', 'dept-default');
      });
    } catch (error) {
    }
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
