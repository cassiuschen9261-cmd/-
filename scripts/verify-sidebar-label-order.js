const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const { resolveCliBaseUrl, verifyReportFile } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_sidebar_label_order.json');

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
    const testId = `verify_sidebar_label_order_${suffix}`;

    try {
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.modules.push({
            id: testId,
            doctorLabel: `右侧名称排序验证${suffix}`,
            groupName: `右侧名称排序班${suffix}`,
            clearLabel: `清空右侧名称排序班${suffix}`,
            order: nextData.modules.length + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: 'module_all_valid',
            sidebarLabel: '右侧自定义标题',
            sidebarOrder: 15,
            sidebarKeywordsText: '',
            sidebarShiftIds: []
        });

        await saveData(headers, nextData);
        const afterSave = await fetchData(headers);
        const savedModule = Array.isArray(afterSave.modules)
            ? afterSave.modules.find(module => module.id === testId)
            : null;

        const result = {
            success: Boolean(savedModule)
                && savedModule.sidebarLabel === '右侧自定义标题'
                && Number(savedModule.sidebarOrder) === 15,
            baseUrl,
            savedModule: savedModule || null
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
