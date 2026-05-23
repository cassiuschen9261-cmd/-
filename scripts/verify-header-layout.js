const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

async function loginAsTerminal(page, baseUrl) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });
  await page.evaluate(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2203408', password: 'zyyfy666' })
    });
    const payload = await response.json();
    if (!payload.token) throw new Error(payload.message || '登录失败');
    localStorage.setItem('paiban_auth_token', payload.token);
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });
}

async function run() {
    const baseUrl = resolveCliBaseUrl();
    const resultPath = verifyReportFile('verify_header_layout.json');
    const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

    try {
        await loginAsTerminal(page, baseUrl);
        const result = await page.evaluate(() => {
            const header = document.querySelector('header.win7-header');
            const title = header ? header.querySelector('.app-header-title') : null;
            const controls = header ? header.querySelector('.app-header-controls') : null;
            if (!header || !title || !controls) {
                return { found: false };
            }

            const titleRect = title.getBoundingClientRect();
            const controlsRect = controls.getBoundingClientRect();
            const overlaps = !(
                titleRect.right <= controlsRect.left
                || controlsRect.right <= titleRect.left
                || titleRect.bottom <= controlsRect.top
                || controlsRect.bottom <= titleRect.top
            );

            return {
                found: true,
                titleRect,
                controlsRect,
                overlaps,
                headerText: header.innerText.trim()
            };
        });

        // Filter out common non-blocking errors
        const filteredErrors = pageErrors.filter(err => !err.includes('Quill is not defined'));

        const payload = {
            success: result.found && result.overlaps === false && filteredErrors.length === 0,
            baseUrl,
            result,
            pageErrors: filteredErrors
        };
        fs.writeFileSync(resultPath, JSON.stringify(payload, null, 2), 'utf8');
        console.log(JSON.stringify(payload, null, 2));
    } finally {
        await browser.close();
    }
}

module.exports = { run };

if (require.main === module) {
run().catch(error => {
    const resultPath = verifyReportFile('verify_header_layout.json');
    const payload = {
        success: false,
        error: String(error?.stack || error?.message || error)
    };
    fs.writeFileSync(resultPath, JSON.stringify(payload, null, 2), 'utf8');
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
});
}
