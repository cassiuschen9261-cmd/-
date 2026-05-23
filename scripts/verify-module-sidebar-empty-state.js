const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_module_sidebar_empty_state.json');

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
    const moduleId = `verify_sidebar_empty_${suffix}`;

    try {
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.modules.push({
            id: moduleId,
            doctorLabel: `空状态模块${suffix}`,
            groupName: `空状态班${suffix}`,
            clearLabel: `清空空状态班${suffix}`,
            order: nextData.modules.length + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: 'module_all_valid',
            sidebarLabel: '空状态模块',
            sidebarOrder: 16,
            sidebarShowLabel: true,
            sidebarShowPhone: false,
            sidebarPhoneMode: 'separate_line',
            sidebarShowTitle: false,
            sidebarTitleMode: 'inline',
            sidebarShowShiftName: true,
            sidebarGroupMode: 'merge_by_shift',
            sidebarDensity: 'standard',
            sidebarShowIfEmpty: true,
            sidebarCountMode: 'hidden',
            sidebarAccentColor: '',
            sidebarKeywordsText: '',
            sidebarShiftIds: []
        });

        await saveData(headers, nextData);

        const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
        await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 20000 });

        const browserResult = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.duty-summary-row'));
            const row = rows.find(node => node.innerText.includes('空状态模块'));
            if (!row) return { found: false };

            const empty = row.querySelector('.duty-summary-empty');
            const emptyBadge = row.querySelector('.duty-summary-empty-badge');
            const emptyText = row.querySelector('.duty-summary-empty-text');
            const style = window.getComputedStyle(row);
            return {
                found: true,
                rowText: row.innerText.trim(),
                hasEmpty: !!empty,
                hasEmptyBadge: !!emptyBadge,
                emptyBadgeText: emptyBadge ? emptyBadge.innerText.trim() : '',
                emptyText: emptyText ? emptyText.innerText.trim() : '',
                borderStyle: style.borderTopStyle,
                backgroundColor: style.backgroundColor,
                opacity: style.opacity
            };
        });

        await browser.close();

        const result = {
            success: browserResult.found
                && browserResult.hasEmpty === true
                && browserResult.hasEmptyBadge === true
                && browserResult.emptyBadgeText === '空安排'
                && browserResult.emptyText === '今日暂无安排'
                && browserResult.borderStyle === 'dashed'
                && browserResult.opacity !== '1'
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
