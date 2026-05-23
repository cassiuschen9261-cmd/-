const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');
const { URL } = require('url');
const puppeteer = require('puppeteer');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_custom_module_sidebar.json');

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
        if (body) {
            req.write(body);
        }
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
    const payload = JSON.stringify({
        username: '2203408',
        password: 'zyyfy666'
    });
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
    const moduleId = `custom_sidebar_verify_${suffix}`;
    const doctorId = `sidebar_verify_doctor_${suffix}`;
    const clinicShiftId = `sidebar_verify_clinic_shift_${suffix}`;
    const dutyShiftId = `sidebar_verify_duty_shift_${suffix}`;
    const moduleDoctorLabel = `验证人员${suffix}`;
    const moduleGroupName = `验证模块展示${suffix}`;
    const doctorName = `验证医生${suffix}`;
    const clinicShiftName = `验证门诊${suffix}`;
    const dutyShiftName = `验证夜班${suffix}`;
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
            order: (Array.isArray(nextData.modules) ? nextData.modules.length : 0) + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: 'module_clinic_only'
        });
        nextData.doctors.push({
            id: doctorId,
            name: doctorName,
            title: '主治医师',
            category: moduleId,
            phone: '13800000000'
        });
        nextData.shiftTypes.push({
            id: clinicShiftId,
            name: clinicShiftName,
            short: '验门',
            color: 'purple',
            categories: [moduleId]
        });
        nextData.shiftTypes.push({
            id: dutyShiftId,
            name: dutyShiftName,
            short: '验夜',
            color: 'red',
            categories: [moduleId]
        });
        if (!nextData.scheduleData[today]) {
            nextData.scheduleData[today] = {};
        }
        nextData.scheduleData[today][doctorId] = [clinicShiftId, dutyShiftId];

        writeResult({ stage: 'injecting_test_data', baseUrl, today, moduleGroupName, doctorName, clinicShiftName, dutyShiftName });
        await saveDepartmentData(headers, nextData);
        const savedData = await fetchDepartmentData(headers);
        const savedModule = Array.isArray(savedData.modules)
            ? savedData.modules.find(module => module.id === moduleId)
            : null;

        const browser = await puppeteer.launch(PUPPETEER_OPTIONS);

        try {
            const page = await browser.newPage();
            page.setDefaultTimeout(20000);

            page.on('console', message => {
                consoleMessages.push({
                    type: message.type(),
                    text: message.text()
                });
            });
            page.on('pageerror', error => {
                pageErrors.push(String(error?.stack || error?.message || error));
            });

            await page.evaluateOnNewDocument(authToken => {
                localStorage.setItem('paiban_auth_token', authToken);
            }, token);

            writeResult({ stage: 'opening_page', baseUrl, today, moduleGroupName, doctorName, clinicShiftName, dutyShiftName });
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.body.innerText.includes('当日排班人员'));
            await page.waitForTimeout(2000);

            const readSidebarRows = async () => page.evaluate(() => {
                return Array.from(document.querySelectorAll('.duty-summary-row')).map(node => {
                    return (node.textContent || '').replace(/\s+/g, ' ').trim();
                });
            });
            const sidebarRows = await readSidebarRows();

            const matchedRow = sidebarRows.find(text => {
                return text.includes(moduleGroupName) && text.includes(clinicShiftName) && text.includes(doctorName);
            }) || '';
            const dutyShiftVisible = sidebarRows.some(text => text.includes(dutyShiftName));

            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.body.innerText.includes('当日排班人员'));
            await page.waitForTimeout(2000);
            const sidebarRowsAfterReload = await readSidebarRows();
            const matchedAfterReload = sidebarRowsAfterReload.find(text => {
                return text.includes(moduleGroupName) && text.includes(clinicShiftName) && text.includes(doctorName);
            }) || '';
            const dutyShiftVisibleAfterReload = sidebarRowsAfterReload.some(text => text.includes(dutyShiftName));

            const result = {
                success: Boolean(matchedRow)
                    && Boolean(matchedAfterReload)
                    && savedModule?.sidebarMode === 'module_clinic_only'
                    && !dutyShiftVisible
                    && !dutyShiftVisibleAfterReload
                    && pageErrors.length === 0,
                baseUrl,
                today,
                moduleGroupName,
                doctorName,
                clinicShiftName,
                dutyShiftName,
                sidebarMode: savedModule?.sidebarMode || '',
                matchedRow,
                matchedAfterReload,
                dutyShiftVisible,
                dutyShiftVisibleAfterReload,
                sidebarRows,
                sidebarRowsAfterReload,
                consoleMessages,
                pageErrors
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
