const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_module_sidebar_density.json');

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

async function readTargetRow(page, text) {
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForFunction(
        targetText => document.body.innerText.includes(targetText),
        { timeout: 10000 },
        text
    );
    return page.evaluate(targetText => {
        const rows = Array.from(document.querySelectorAll('.duty-summary-row'));
        const row = rows.find(node => node.innerText.includes(targetText));
        if (!row) return { found: false };
        
        const isCompact = row.classList.contains('duty-summary-row--compact');
        const label = row.querySelector('.duty-summary-label');
        const labelIsCompact = label ? label.classList.contains('duty-summary-label--compact') : false;
        const shift = row.querySelector('.duty-summary-shift');
        const shiftIsCompact = shift ? shift.classList.contains('duty-summary-shift--compact') : false;
        const names = row.querySelector('.duty-summary-names');
        const namesIsCompact = names ? names.classList.contains('duty-summary-names--compact') : false;
        const phone = row.querySelector('.duty-summary-phone');
        const phoneIsCompact = phone ? phone.classList.contains('duty-summary-phone--compact') : false;

        return {
            found: true,
            rowText: row.innerText.trim(),
            isCompact,
            labelIsCompact,
            shiftIsCompact,
            namesIsCompact,
            phoneIsCompact
        };
    }, text);
}

async function run() {
    const token = await login();
    const headers = { Authorization: `Bearer ${token}` };
    const originalData = await fetchData(headers);
    const backup = JSON.parse(JSON.stringify(originalData));
    const suffix = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const moduleId = `verify_sidebar_density_${suffix}`;
    const shiftId = `verify_sidebar_density_shift_${suffix}`;
    const doctorId = `verify_sidebar_density_doc_${suffix}`;
    const sidebarLabel = `密度验证模块${suffix}`;

    try {
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.modules.push({
            id: moduleId,
            doctorLabel: `密度验证模块${suffix}`,
            groupName: `密度验证班${suffix}`,
            clearLabel: `清空密度验证班${suffix}`,
            order: nextData.modules.length + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: 'module_all_valid',
            sidebarLabel,
            sidebarOrder: 15,
            sidebarShowLabel: true,
            sidebarShowPhone: true,
            sidebarPhoneMode: 'separate_line',
            sidebarShowTitle: true,
            sidebarShowShiftName: true,
            sidebarGroupMode: 'merge_by_shift',
            sidebarDensity: 'standard',
            sidebarAccentColor: '#059669',
            sidebarKeywordsText: '',
            sidebarShiftIds: []
        });
        nextData.doctors.push({
            id: doctorId,
            name: '密度验证医生',
            title: '主治医师',
            category: moduleId,
            phone: '13800138000'
        });
        nextData.shiftTypes.push({
            id: shiftId,
            name: '密度验证班次',
            short: '密验',
            color: 'green',
            categories: [moduleId]
        });
        nextData.scheduleData[today] = nextData.scheduleData[today] || {};
        nextData.scheduleData[today][doctorId] = [shiftId];

        await saveData(headers, nextData);

        const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
        let standardResult;
        let compactResult;
        const pageErrors = [];
        try {
            const page = await browser.newPage();
            page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
            await page.evaluateOnNewDocument(authToken => {
                localStorage.setItem('paiban_auth_token', authToken);
            }, token);

            standardResult = await readTargetRow(page, sidebarLabel);

            const compactData = await fetchData(headers);
            const compactModule = compactData.modules.find(module => module.id === moduleId);
            if (!compactModule) {
                throw new Error(`Module ${moduleId} not found in fetched data for compact mode setup`);
            }
            compactModule.sidebarDensity = 'compact';
            await saveData(headers, compactData);

            compactResult = await readTargetRow(page, sidebarLabel);
        } finally {
            await browser.close();
        }

        // Filter out common non-blocking errors
        const filteredErrors = pageErrors.filter(err => !err.includes('Quill is not defined'));

        const result = {
            success: standardResult.found
                && standardResult.isCompact === false
                && standardResult.labelIsCompact === false
                && standardResult.shiftIsCompact === false
                && standardResult.namesIsCompact === false
                && standardResult.phoneIsCompact === false
                && compactResult.found
                && compactResult.isCompact === true
                && compactResult.labelIsCompact === true
                && compactResult.shiftIsCompact === true
                && compactResult.namesIsCompact === true
                && compactResult.phoneIsCompact === true
                && filteredErrors.length === 0,
            baseUrl,
            standardResult,
            compactResult,
            pageErrors: filteredErrors
        };
        writeResult(result);
        console.log(JSON.stringify(result, null, 2));
        if (!result.success) {
            process.exitCode = 1;
        }
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
