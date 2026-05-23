const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const RESULT_FILE = verifyReportFile('verify_export_permissions_ui.json');
const ADMIN_USERNAME = '2203408';
const ADMIN_PASSWORD = 'zyyfy666';

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

async function run() {
  const baseUrl = resolveCliBaseUrl();
  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  const page = await browser.newPage();
  const result = {
    ok: false,
    baseUrl,
    consoleMessages: [],
    pageErrors: [],
    guest: null,
    admin: null
  };
  writeResult(result);

  page.on('console', msg => result.consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => result.pageErrors.push(String((err && err.stack) || err)));

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.body.innerText.includes('管理员登录'));

    result.guest = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('button')].map(button => button.innerText.trim());
      return {
        hasExcel: labels.includes('导出 Excel'),
        hasWord: labels.includes('导出 Word'),
        hasPdf: labels.includes('导出 PDF')
      };
    });
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
    result.admin = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('button')].map(button => button.innerText.trim());
      return {
        hasExcel: labels.includes('导出 Excel'),
        hasWord: labels.includes('导出 Word'),
        hasPdf: labels.includes('导出 PDF')
      };
    });

    result.ok = result.guest
      && !result.guest.hasExcel
      && !result.guest.hasWord
      && !result.guest.hasPdf
      && result.admin
      && result.admin.hasExcel
      && result.admin.hasWord
      && result.admin.hasPdf
      && result.pageErrors.length === 0;

    writeResult(result);

    if (!result.ok) {
      throw new Error('Export permission UI verification failed');
    }
  } catch (error) {
    result.error = String((error && error.stack) || error);
    writeResult(result);
    throw error;
  } finally {
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
