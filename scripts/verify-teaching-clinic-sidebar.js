const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const RESULT_FILE = verifyReportFile('verify_teaching_clinic_sidebar.json');
const TARGET_DATE = '2026-05-18';

function resolveBaseUrl() {
  return resolveCliBaseUrl();
}

function writeResult(payload) {
  fs.writeFileSync(RESULT_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

async function run() {
  const baseUrl = resolveBaseUrl();
  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  const page = await browser.newPage();
  const pageErrors = [];

  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });

    const browserResult = await page.evaluate(async targetDate => {
      const input = document.querySelector('input[type="date"]');
      if (!input) {
        return { foundDateInput: false };
      }

      input.value = targetDate;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const rows = Array.from(document.querySelectorAll('.duty-summary-row')).map(node => node.innerText.trim());
      const teachingRow = rows.find(text => text.includes('教学门诊安排')) || '';

      return {
        foundDateInput: true,
        currentDate: input.value,
        rows,
        teachingRow,
        hasOuyanmian: teachingRow.includes('欧艳勉（主任医师）'),
        hasPbl: teachingRow.includes('PBL教学'),
        hasXieZhipeng: teachingRow.includes('谢志鹏（轮转医生）'),
        hasClinicRoom: teachingRow.includes('心内3诊室')
      };
    }, TARGET_DATE);

    const result = {
      success: browserResult.foundDateInput
        && browserResult.currentDate === TARGET_DATE
        && browserResult.hasOuyanmian
        && browserResult.hasPbl,
      baseUrl,
      targetDate: TARGET_DATE,
      browserResult,
      pageErrors
    };

    writeResult(result);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
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
