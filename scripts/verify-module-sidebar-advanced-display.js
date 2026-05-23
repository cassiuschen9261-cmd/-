const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_module_sidebar_advanced_display.json');

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

async function login() {
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

async function fetchData(headers) {
    const response = await requestJson(`${baseUrl}/api/data`, { headers });
    if (!response.ok) throw new Error(response.data?.message || '读取数据失败');
    return response.data;
}

async function saveData(headers, data) {
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

async function run() {
    const token = await login();
    const headers = { Authorization: `Bearer ${token}` };
    const originalData = await fetchData(headers);
    const backup = JSON.parse(JSON.stringify(originalData));
    const suffix = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const moduleId = `verify_sidebar_advanced_${suffix}`;
    const shiftId = `verify_sidebar_shift_${suffix}`;
    const doctorAId = `verify_sidebar_doc_a_${suffix}`;
    const doctorBId = `verify_sidebar_doc_b_${suffix}`;

    try {
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.modules.push({
            id: moduleId,
            doctorLabel: `高级显示模块${suffix}`,
            groupName: `高级显示班${suffix}`,
            clearLabel: `清空高级显示班${suffix}`,
            order: nextData.modules.length + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: 'module_all_valid',
            sidebarLabel: '高级显示模块',
            sidebarOrder: 15,
            sidebarShowLabel: false,
            sidebarShowPhone: false,
            sidebarShowTitle: true,
            sidebarShowShiftName: false,
            sidebarGroupMode: 'split_by_doctor',
            sidebarAccentColor: '#2563eb',
            sidebarKeywordsText: '',
            sidebarShiftIds: []
        });
        nextData.doctors.push(
            { id: doctorAId, name: '医生甲', title: '主治医师', category: moduleId, phone: '' },
            { id: doctorBId, name: '医生乙', title: '住院医师', category: moduleId, phone: '' }
        );
        nextData.shiftTypes.push({
            id: shiftId,
            name: '高级验证班次',
            short: '高',
            color: 'blue',
            categories: [moduleId]
        });
        nextData.scheduleData[today] = nextData.scheduleData[today] || {};
        nextData.scheduleData[today][doctorAId] = [shiftId];
        nextData.scheduleData[today][doctorBId] = [shiftId];

        await saveData(headers, nextData);

        const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
        let browserResult;
        const pageErrors = [];
        try {
            const page = await browser.newPage();
            page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
            await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });

            browserResult = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('.duty-summary-row'));
                const targetRow = rows.find(row => row.innerText.includes('医生甲（主治医师）') && row.innerText.includes('医生乙（住院医师）'));
                if (!targetRow) return { found: false };
                const groups = Array.from(targetRow.querySelectorAll('.duty-summary-group')).map(node => node.innerText.trim());
                return {
                    found: true,
                    rowText: targetRow.innerText,
                    groupCount: groups.length,
                    groups,
                    labelVisible: !!targetRow.querySelector('.duty-summary-label'),
                    shiftVisible: !!targetRow.querySelector('.duty-summary-shift')
                };
            });
        } finally {
            await browser.close();
        }

        const result = {
            success: browserResult.found
                && browserResult.groupCount === 2
                && browserResult.rowText.includes('医生甲（主治医师）')
                && browserResult.rowText.includes('医生乙（住院医师）')
                && !browserResult.rowText.includes('高级显示模块')
                && !browserResult.rowText.includes('高级验证班次')
                && browserResult.labelVisible === false
                && browserResult.shiftVisible === false
                && pageErrors.length === 0,
            baseUrl,
            browserResult,
            pageErrors
        };
        writeResult(result);
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await saveData(headers, backup);
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
