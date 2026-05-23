const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const { resolveCliBaseUrl, verifyReportFile, PUPPETEER_OPTIONS } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_module_sidebar_badge_hierarchy.json');

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
    const moduleId = `verify_sidebar_badges_${suffix}`;
    const shiftId = `verify_sidebar_badges_shift_${suffix}`;
    const doctorIds = [`verify_sidebar_badges_doc_a_${suffix}`, `verify_sidebar_badges_doc_b_${suffix}`];

    try {
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.modules.push({
            id: moduleId,
            doctorLabel: `标记层级模块${suffix}`,
            groupName: `标记层级班${suffix}`,
            clearLabel: `清空标记层级班${suffix}`,
            order: nextData.modules.length + 1,
            enabled: true,
            allowFixedWeekdays: false,
            allowMultiAssign: true,
            sidebarMode: 'module_all_valid',
            sidebarLabel: '标记层级模块',
            sidebarOrder: 15,
            sidebarShowLabel: true,
            sidebarShowPhone: true,
            sidebarPhoneMode: 'badge_after_name',
            sidebarShowTitle: true,
            sidebarTitleMode: 'badge',
            sidebarShowShiftName: true,
            sidebarGroupMode: 'merge_by_shift',
            sidebarDensity: 'standard',
            sidebarShowIfEmpty: false,
            sidebarCountMode: 'always',
            sidebarAccentColor: '#2563eb',
            sidebarKeywordsText: '',
            sidebarShiftIds: []
        });
        nextData.doctors.push(
            { id: doctorIds[0], name: '层级验证甲', title: '主治医师', category: moduleId, phone: '13800138000' },
            { id: doctorIds[1], name: '层级验证乙', title: '住院医师', category: moduleId, phone: '13900139000' }
        );
        nextData.shiftTypes.push({
            id: shiftId,
            name: '层级验证班次',
            short: '层验',
            color: 'blue',
            categories: [moduleId]
        });
        nextData.scheduleData[today] = nextData.scheduleData[today] || {};
        nextData.scheduleData[today][doctorIds[0]] = [shiftId];
        nextData.scheduleData[today][doctorIds[1]] = [shiftId];

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
                const row = rows.find(node => node.innerText.includes('标记层级模块') && node.innerText.includes('层级验证甲') && node.innerText.includes('层级验证乙'));
                if (!row) return { found: false };

                const shift = row.querySelector('.duty-summary-shift');
                const count = row.querySelector('.duty-summary-count');
                const title = row.querySelector('.duty-summary-title-badge');
                const phone = row.querySelector('.duty-summary-phone-badge');
                const phoneLine = row.querySelector('.duty-summary-phone');

                function styleOf(node) {
                    if (!node) return null;
                    const style = window.getComputedStyle(node);
                    return {
                        backgroundColor: style.backgroundColor,
                        color: style.color,
                        borderColor: style.borderColor,
                        fontWeight: style.fontWeight
                    };
                }

                return {
                    found: true,
                    rowText: row.innerText.trim(),
                    hasShift: !!shift,
                    hasCount: !!count,
                    hasTitleBadge: !!title,
                    hasPhoneBadge: !!phone,
                    hasPhoneLine: !!phoneLine,
                    shiftText: shift ? shift.innerText.trim() : '',
                    countText: count ? count.innerText.trim() : '',
                    titleText: title ? title.innerText.trim() : '',
                    phoneText: phone ? phone.innerText.trim() : '',
                    shiftStyle: styleOf(shift),
                    countStyle: styleOf(count),
                    titleStyle: styleOf(title),
                    phoneStyle: styleOf(phone)
                };
            });
        } finally {
            await browser.close();
        }

        const result = {
            success: browserResult.found
                && browserResult.hasShift === true
                && browserResult.hasCount === true
                && browserResult.hasTitleBadge === true
                && browserResult.hasPhoneBadge === true
                && browserResult.hasPhoneLine === false
                && browserResult.countText === '2人'
                && browserResult.titleText.length > 0
                && browserResult.phoneText === '13800138000'
                && browserResult.shiftStyle?.backgroundColor !== browserResult.countStyle?.backgroundColor
                && browserResult.countStyle?.backgroundColor !== browserResult.titleStyle?.backgroundColor
                && browserResult.titleStyle?.backgroundColor !== browserResult.phoneStyle?.backgroundColor
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
