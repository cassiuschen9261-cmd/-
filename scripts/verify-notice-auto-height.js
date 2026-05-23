const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const RESULT_FILE = verifyReportFile('verify_notice_auto_height.json');

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

function buildLongNoticeHtml(prefix, paragraphCount = 40) {
  return Array.from({ length: paragraphCount }, (_, index) => (
    `<p>${prefix} 第${index + 1}段：用于验证右侧公告模块在超长内容下的自动扩展、最大高度限制和内部滚动行为。</p>`
  )).join('');
}

async function setNoticeHtml(page, field, html, markerText) {
  await page.evaluate(({ fieldName, nextHtml }) => {
    const container = document.getElementById(`${fieldName}-editor`);
    const quill = container && container.__quill;
    if (!container || !quill) {
      throw new Error(`Quill editor not found for field: ${fieldName}`);
    }
    quill.clipboard.dangerouslyPasteHTML(nextHtml);
  }, { fieldName: field, nextHtml: html });

  await page.waitForFunction(expectedText => {
    const editor = document.querySelector(`#${expectedText.field} .ql-editor`);
    return !!editor && editor.innerText.includes(expectedText.marker);
  }, {}, {
    field: `${field}-editor`,
    marker: markerText
  });
  await page.waitForTimeout(180);
}

async function collectNoticeMetrics(page) {
  return page.evaluate(() => {
    function readField(field) {
      const container = document.getElementById(`${field}-editor`);
      const editor = container ? container.querySelector('.ql-editor') : null;
      const containerStyle = container ? window.getComputedStyle(container) : null;
      const editorStyle = editor ? window.getComputedStyle(editor) : null;
      if (!container || !editor || !containerStyle || !editorStyle) {
        return { found: false };
      }

      const containerHeight = container.getBoundingClientRect().height;
      const panel = container.closest('.notice-panel');
      const panelTop = panel ? panel.getBoundingClientRect().top : null;

      return {
        found: true,
        field,
        textLength: editor.innerText.trim().length,
        containerHeight,
        containerClientHeight: container.clientHeight,
        containerScrollHeight: container.scrollHeight,
        editorClientHeight: editor.clientHeight,
        editorScrollHeight: editor.scrollHeight,
        minHeightStyle: Number.parseFloat(containerStyle.minHeight) || 0,
        maxHeightStyle: Number.parseFloat(containerStyle.maxHeight) || 0,
        overflowY: containerStyle.overflowY,
        hasScrollbar: container.scrollHeight > container.clientHeight + 1,
        contentFitsWithoutScroll: container.scrollHeight <= container.clientHeight + 1,
        panelTop
      };
    }

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      teaching: readField('teaching'),
      special: readField('special')
    };
  });
}

function isWithinMaxHeight(metrics) {
  return metrics.containerHeight <= metrics.maxHeightStyle + 2;
}

async function run() {
  const baseUrl = resolveCliBaseUrl();
  const token = await login(baseUrl);
  const headers = { Authorization: `Bearer ${token}` };
  const originalData = await fetchData(baseUrl, headers);
  const backup = JSON.parse(JSON.stringify(originalData));

  const shortTeachingHtml = '<p>短公告验证：仅一行内容。</p>';
  const shortSpecialHtml = '<p>短备注验证：内容缩短后应自动回落高度。</p>';
  const longTeachingHtml = buildLongNoticeHtml('超长公告动态增长验证', 42);
  const longSpecialHtml = buildLongNoticeHtml('超长备注初始加载验证', 46);

  const nextData = JSON.parse(JSON.stringify(originalData));
  nextData.notices = {
    ...nextData.notices,
    teaching: shortTeachingHtml,
    special: longSpecialHtml
  };

  let browser = null;
  try {
    await saveData(baseUrl, headers, nextData);

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
    await page.waitForTimeout(250);

    const initialMetrics = await collectNoticeMetrics(page);

    await setNoticeHtml(page, 'teaching', longTeachingHtml, '超长公告动态增长验证');
    await setNoticeHtml(page, 'special', shortSpecialHtml, '短备注验证');
    const afterDynamicUpdate = await collectNoticeMetrics(page);

    await setNoticeHtml(page, 'teaching', shortTeachingHtml, '短公告验证');
    const afterDynamicShrink = await collectNoticeMetrics(page);

    await setNoticeHtml(page, 'teaching', longTeachingHtml, '超长公告动态增长验证');

    await page.setViewport({ width: 960, height: 720 });
    await page.waitForTimeout(250);
    const afterTabletResize = await collectNoticeMetrics(page);

    const initialShortNoticeOk = initialMetrics.teaching.found
      && initialMetrics.teaching.hasScrollbar === false
      && initialMetrics.teaching.contentFitsWithoutScroll
      && isWithinMaxHeight(initialMetrics.teaching);

    const initialLongNoticeOk = initialMetrics.special.found
      && initialMetrics.special.hasScrollbar
      && isWithinMaxHeight(initialMetrics.special);

    const dynamicGrowOk = afterDynamicUpdate.teaching.found
      && afterDynamicUpdate.teaching.containerHeight > initialMetrics.teaching.containerHeight + 20
      && afterDynamicUpdate.teaching.hasScrollbar
      && isWithinMaxHeight(afterDynamicUpdate.teaching);

    const dynamicShrinkOk = afterDynamicShrink.teaching.found
      && afterDynamicShrink.teaching.containerHeight < afterDynamicUpdate.teaching.containerHeight - 20
      && afterDynamicShrink.teaching.hasScrollbar === false
      && afterDynamicShrink.teaching.contentFitsWithoutScroll;

    const specialShortNoticeOk = afterDynamicUpdate.special.found
      && afterDynamicUpdate.special.hasScrollbar === false
      && afterDynamicUpdate.special.contentFitsWithoutScroll;

    const responsiveResizeOk = afterTabletResize.teaching.found
      && afterTabletResize.teaching.containerHeight < afterDynamicUpdate.teaching.containerHeight
      && afterTabletResize.teaching.maxHeightStyle < afterDynamicUpdate.teaching.maxHeightStyle
      && afterTabletResize.teaching.hasScrollbar
      && isWithinMaxHeight(afterTabletResize.teaching);

    const result = {
      success: initialShortNoticeOk
        && initialLongNoticeOk
        && dynamicGrowOk
        && dynamicShrinkOk
        && specialShortNoticeOk
        && responsiveResizeOk
        && pageErrors.length === 0,
      baseUrl,
      checks: {
        initialShortNoticeOk,
        initialLongNoticeOk,
        dynamicGrowOk,
        dynamicShrinkOk,
        specialShortNoticeOk,
        responsiveResizeOk
      },
      metrics: {
        initialMetrics,
        afterDynamicUpdate,
        afterDynamicShrink,
        afterTabletResize
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
