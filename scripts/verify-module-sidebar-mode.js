const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const mode = process.argv[2] || 'whitelist';
const baseUrl = resolveCliBaseUrl(3);
const resultPath = verifyReportFile(`verify_module_sidebar_mode_${mode}.json`);

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
            res.on('data', chunk => { raw += chunk; });
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

async function run() {
    const suffix = Date.now();
    const moduleId = `custom_sidebar_mode_${mode}_${suffix}`;
    const doctorId = `sidebar_mode_doctor_${mode}_${suffix}`;
    const clinicShiftId = `sidebar_mode_clinic_${mode}_${suffix}`;
    const dutyShiftId = `sidebar_mode_duty_${mode}_${suffix}`;
    const moduleGroupName = `模式验证模块${suffix}`;
    const doctorName = `模式验证医生${suffix}`;
    const clinicShiftName = `专病门诊${suffix}`;
    const dutyShiftName = `急诊夜班${suffix}`;
    const today = formatDate(new Date());
    const consoleMessages = [];
    const pageErrors = [];

    const token = await loginAsTerminal();
    const headers = { Authorization: `Bearer ${token}` };
    const originalData = await fetchDepartmentData(headers);
    const backupData = JSON.parse(JSON.stringify(originalData));

    try {
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.modules.push({
            id: moduleId,
            doctorLabel: `模式验证人员${suffix}`,
            groupName: moduleGroupName,
            clearLabel: `清空${moduleGroupName}`,
            order: nextData.modules.length + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: mode === 'keyword' ? 'module_keyword' : 'module_shift_whitelist',
            sidebarKeywordsText: mode === 'keyword' ? '夜班,急诊' : '',
            sidebarShiftIds: mode === 'whitelist' ? [clinicShiftId] : []
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
        if (!nextData.scheduleData[today]) nextData.scheduleData[today] = {};
        nextData.scheduleData[today][doctorId] = [clinicShiftId, dutyShiftId];

        writeResult({ stage: 'saving', mode, baseUrl });
        await saveDepartmentData(headers, nextData);
        const savedData = await fetchDepartmentData(headers);
        const savedModule = savedData.modules.find(module => module.id === moduleId);

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
            await page.goto(baseUrl, { waitUntil: 'networkidle2' });
            await page.waitForFunction(() => document.body.innerText.includes('当日排班人员'), { timeout: 15000 });
            
            // Wait for specific module row to appear (retry loop)
            let row = '';
            let rows = [];
            for (let i = 0; i < 5; i++) {
                rows = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('.duty-summary-row')).map(node => {
                        return (node.textContent || '').replace(/\s+/g, ' ').trim();
                    });
                });
                row = rows.find(text => text.includes(moduleGroupName)) || '';
                if (row) break;
                await new Promise(r => setTimeout(r, 1000));
            }

            const success = mode === 'whitelist'
                ? savedModule?.sidebarMode === 'module_shift_whitelist'
                    && Array.isArray(savedModule?.sidebarShiftIds)
                    && savedModule.sidebarShiftIds.includes(clinicShiftId)
                    && row.includes(clinicShiftName)
                    && !row.includes(dutyShiftName)
                : savedModule?.sidebarMode === 'module_keyword'
                    && savedModule?.sidebarKeywordsText === '夜班,急诊'
                    && row.includes(dutyShiftName)
                    && !row.includes(clinicShiftName);
            
            // Filter out common non-blocking errors
            const filteredErrors = pageErrors.filter(err => !err.includes('Quill is not defined'));

            const result = {
                success: Boolean(success) && filteredErrors.length === 0,
                mode,
                baseUrl,
                moduleGroupName,
                doctorName,
                clinicShiftName,
                dutyShiftName,
                savedModule: {
                    sidebarMode: savedModule?.sidebarMode || '',
                    sidebarKeywordsText: savedModule?.sidebarKeywordsText || '',
                    sidebarShiftIds: savedModule?.sidebarShiftIds || []
                },
                row,
                rows,
                consoleMessages,
                pageErrors: filteredErrors
            };
            writeResult(result);
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) {
                process.exitCode = 1;
            }
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
        mode,
        error: String(error?.stack || error?.message || error)
    };
    writeResult(result);
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
});
}
