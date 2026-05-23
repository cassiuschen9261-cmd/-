const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_module_sidebar_advanced.json');

function writeResult(payload) {
    fs.writeFileSync(resultPath, JSON.stringify(payload, null, 2), 'utf-8');
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

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function loginAsTerminal() {
    const payload = JSON.stringify({ username: '2203408', password: 'zyyfy666' });
    const response = await requestJson(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, payload);
    if (!response.ok || !response.data.token) {
        throw new Error(response.data?.message || '管理员登录失败');
    }
    return response.data.token;
}

async function fetchDepartmentData(headers) {
    const response = await requestJson(`${baseUrl}/api/data`, { headers });
    if (!response.ok) {
        throw new Error(response.data?.message || '获取数据失败');
    }
    return response.data;
}

async function saveDepartmentData(headers, data) {
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
    if (!response.ok) {
        throw new Error(response.data?.message || '保存数据失败');
    }
    return response.data;
}

async function readSidebarRows(page) {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('当日排班人员'));
    await page.waitForTimeout(1800);
    return page.evaluate(() => {
        return Array.from(document.querySelectorAll('.duty-summary-row')).map(node => {
            return (node.textContent || '').replace(/\s+/g, ' ').trim();
        });
    });
}

function findModuleRow(rows, groupName) {
    return rows.find(text => text.includes(groupName)) || '';
}

async function run() {
    const suffix = Date.now();
    const moduleId = `custom_sidebar_advanced_${suffix}`;
    const doctorId = `sidebar_advanced_doctor_${suffix}`;
    const clinicShiftId = `sidebar_advanced_clinic_${suffix}`;
    const dutyShiftId = `sidebar_advanced_duty_${suffix}`;
    const moduleDoctorLabel = `高级验证人员${suffix}`;
    const moduleGroupName = `高级验证模块${suffix}`;
    const doctorName = `高级验证医生${suffix}`;
    const clinicShiftName = `专病门诊${suffix}`;
    const dutyShiftName = `急诊夜班${suffix}`;
    const today = formatDate(new Date());

    const consoleMessages = [];
    const pageErrors = [];
    writeResult({ stage: 'logging_in', baseUrl, today });

    const token = await loginAsTerminal();
    const headers = { Authorization: `Bearer ${token}` };
    const originalData = await fetchDepartmentData(headers);
    const backupData = JSON.parse(JSON.stringify(originalData));

    try {
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.modules.push({
            id: moduleId,
            doctorLabel: moduleDoctorLabel,
            groupName: moduleGroupName,
            clearLabel: `清空${moduleGroupName}`,
            order: nextData.modules.length + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: 'module_shift_whitelist',
            sidebarKeywordsText: '',
            sidebarShiftIds: [clinicShiftId]
        });
        nextData.doctors.push({
            id: doctorId,
            name: doctorName,
            title: '主治医师',
            category: moduleId,
            phone: ''
        });
        nextData.shiftTypes.push({
            id: clinicShiftId,
            name: clinicShiftName,
            short: '专病门',
            color: 'purple',
            categories: [moduleId]
        });
        nextData.shiftTypes.push({
            id: dutyShiftId,
            name: dutyShiftName,
            short: '夜班',
            color: 'red',
            categories: [moduleId]
        });
        if (!nextData.scheduleData[today]) {
            nextData.scheduleData[today] = {};
        }
        nextData.scheduleData[today][doctorId] = [clinicShiftId, dutyShiftId];

        writeResult({ stage: 'saving_whitelist_mode', baseUrl, moduleGroupName });
        await saveDepartmentData(headers, nextData);
        const afterWhitelistSave = await fetchDepartmentData(headers);
        const savedWhitelistModule = afterWhitelistSave.modules.find(module => module.id === moduleId);

        const browser = await puppeteer.launch(PUPPETEER_OPTIONS);

        try {
            const page = await browser.newPage();
            page.setDefaultTimeout(20000);
            page.on('console', message => {
                consoleMessages.push({ type: message.type(), text: message.text() });
            });
            page.on('pageerror', error => {
                pageErrors.push(String(error?.stack || error?.message || error));
            });
            await page.evaluateOnNewDocument(authToken => {
                localStorage.setItem('paiban_auth_token', authToken);
            }, token);

            const whitelistRows = await readSidebarRows(page);
            const whitelistRow = findModuleRow(whitelistRows, moduleGroupName);
            const whitelistOk = whitelistRow.includes(clinicShiftName)
                && whitelistRow.includes(doctorName)
                && !whitelistRow.includes(dutyShiftName)
                && savedWhitelistModule?.sidebarMode === 'module_shift_whitelist'
                && Array.isArray(savedWhitelistModule?.sidebarShiftIds)
                && savedWhitelistModule.sidebarShiftIds.includes(clinicShiftId);

            const keywordData = await fetchDepartmentData(headers);
            const keywordModule = keywordData.modules.find(module => module.id === moduleId);
            if (!keywordModule) {
                throw new Error(`Module ${moduleId} not found in fetched data for keyword mode setup`);
            }
            keywordModule.sidebarMode = 'module_keyword';
            keywordModule.sidebarKeywordsText = '夜班,急诊';
            keywordModule.sidebarShiftIds = [];
            writeResult({ stage: 'saving_keyword_mode', baseUrl, moduleGroupName });
            await saveDepartmentData(headers, keywordData);
            const afterKeywordSave = await fetchDepartmentData(headers);
            const savedKeywordModule = afterKeywordSave.modules.find(module => module.id === moduleId);

            const keywordRows = await readSidebarRows(page);
            const keywordRow = findModuleRow(keywordRows, moduleGroupName);
            const keywordOk = keywordRow.includes(dutyShiftName)
                && keywordRow.includes(doctorName)
                && !keywordRow.includes(clinicShiftName)
                && savedKeywordModule?.sidebarMode === 'module_keyword'
                && savedKeywordModule?.sidebarKeywordsText === '夜班,急诊';

            // Filter out common non-blocking errors
            const filteredErrors = pageErrors.filter(err => !err.includes('Quill is not defined'));

            const result = {
                success: whitelistOk && keywordOk && filteredErrors.length === 0,
                baseUrl,
                today,
                moduleGroupName,
                doctorName,
                clinicShiftName,
                dutyShiftName,
                whitelist: {
                    sidebarMode: savedWhitelistModule?.sidebarMode || '',
                    sidebarShiftIds: savedWhitelistModule?.sidebarShiftIds || [],
                    row: whitelistRow,
                    rows: whitelistRows,
                    success: whitelistOk
                },
                keyword: {
                    sidebarMode: savedKeywordModule?.sidebarMode || '',
                    sidebarKeywordsText: savedKeywordModule?.sidebarKeywordsText || '',
                    row: keywordRow,
                    rows: keywordRows,
                    success: keywordOk
                },
                consoleMessages,
                pageErrors: filteredErrors
            };
            writeResult(result);
            console.log(JSON.stringify(result, null, 2));
        } finally {
            await browser.close();
        }
    } finally {
        await saveDepartmentData(headers, backupData);
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
