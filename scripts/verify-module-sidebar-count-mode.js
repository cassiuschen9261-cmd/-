const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_module_sidebar_count_mode.json');

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
        const countNode = row.querySelector('.duty-summary-count');
        const names = row.querySelector('.duty-summary-names');
        return {
            found: true,
            rowText: row.innerText.trim(),
            countText: countNode ? countNode.innerText.trim() : '',
            hasCountBadge: !!countNode,
            namesText: names ? names.innerText.trim() : ''
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
    const moduleId = `verify_sidebar_count_${suffix}`;
    const shiftId = `verify_sidebar_count_shift_${suffix}`;
    const doctorIds = [`verify_sidebar_count_doc_a_${suffix}`, `verify_sidebar_count_doc_b_${suffix}`];
    const sidebarLabel = `人数标记模块${suffix}`;

    try {
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.modules.push({
            id: moduleId,
            doctorLabel: `人数标记模块${suffix}`,
            groupName: `人数标记班${suffix}`,
            clearLabel: `清空人数标记班${suffix}`,
            order: nextData.modules.length + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: 'module_all_valid',
            sidebarLabel,
            sidebarOrder: 15,
            sidebarShowLabel: true,
            sidebarShowPhone: false,
            sidebarPhoneMode: 'separate_line',
            sidebarShowTitle: false,
            sidebarShowShiftName: true,
            sidebarGroupMode: 'merge_by_shift',
            sidebarDensity: 'standard',
            sidebarShowIfEmpty: false,
            sidebarCountMode: 'hidden',
            sidebarAccentColor: '#2563eb',
            sidebarKeywordsText: '',
            sidebarShiftIds: []
        });
        nextData.doctors.push(
            { id: doctorIds[0], name: '人数验证甲', title: '主治医师', category: moduleId, phone: '' },
            { id: doctorIds[1], name: '人数验证乙', title: '住院医师', category: moduleId, phone: '' }
        );
        nextData.shiftTypes.push({
            id: shiftId,
            name: '人数验证班次',
            short: '人数验',
            color: 'blue',
            categories: [moduleId]
        });
        nextData.scheduleData[today] = nextData.scheduleData[today] || {};
        nextData.scheduleData[today][doctorIds[0]] = [shiftId];
        nextData.scheduleData[today][doctorIds[1]] = [shiftId];

        await saveData(headers, nextData);

        const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
        try {
            const page = await browser.newPage();
            const pageErrors = [];
            page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

            await page.evaluateOnNewDocument(authToken => {
                localStorage.setItem('paiban_auth_token', authToken);
            }, token);

            const hiddenResult = await readTargetRow(page, sidebarLabel);

            const multiOnlyData = await fetchData(headers);
            const multiOnlyModule = multiOnlyData.modules.find(module => module.id === moduleId);
            multiOnlyModule.sidebarCountMode = 'multi_only';
            await saveData(headers, multiOnlyData);
            const multiOnlyResult = await readTargetRow(page, sidebarLabel);

            const alwaysData = await fetchData(headers);
            const alwaysModule = alwaysData.modules.find(module => module.id === moduleId);
            alwaysModule.sidebarCountMode = 'always';
            if (alwaysData.scheduleData[today] && alwaysData.scheduleData[today][doctorIds[1]]) {
                delete alwaysData.scheduleData[today][doctorIds[1]];
            }
            await saveData(headers, alwaysData);
            const alwaysResult = await readTargetRow(page, sidebarLabel);

            const result = {
                success: hiddenResult.found
                    && hiddenResult.hasCountBadge === false
                    && multiOnlyResult.found
                    && multiOnlyResult.hasCountBadge === true
                    && multiOnlyResult.countText === '2人'
                    && alwaysResult.found
                    && alwaysResult.hasCountBadge === true
                    && alwaysResult.countText === '1人'
                    && pageErrors.length === 0,
                baseUrl,
                hiddenResult,
                multiOnlyResult,
                alwaysResult,
                pageErrors
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
