const fs = require('fs');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

async function run() {
  const baseUrl = resolveCliBaseUrl();
  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  const page = await browser.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String(err && err.stack || err)));
  const response = await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });
  const result = {
    baseUrl,
    status: response && response.status(),
    title: await page.title(),
    hasApp: await page.$('#app') !== null,
    loginTextFound: await page.evaluate(() => document.body.innerText.includes('登录') || document.body.innerText.includes('管理员')),
    bodyTextSample: await page.evaluate(() => document.body.innerText.slice(0, 400)),
    consoleMessages,
    pageErrors
  };
  fs.writeFileSync(verifyReportFile('verify_start_browser_runtime.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error(err); process.exit(1); });
}
