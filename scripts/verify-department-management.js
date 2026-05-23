const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { resolveCliBaseUrl, verifyReportFile } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl();
const resultPath = verifyReportFile('verify_department_management.json');
const ADMIN_USERNAME = '2203408';
const ADMIN_PASSWORD = 'zyyfy666';

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

async function loginAsTerminal() {
    const payload = JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD
    });
    const response = await requestJson(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, payload);
    if (!response.ok || !response.data.token) {
        throw new Error(response.data?.message || '终端管理员登录失败');
    }
    return response.data.token;
}

async function fetchDepartmentData(token, departmentId = '') {
    const url = departmentId
        ? `${baseUrl}/api/data?departmentId=${encodeURIComponent(departmentId)}`
        : `${baseUrl}/api/data`;
    const response = await requestJson(url, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    if (!response.ok) {
        throw new Error(response.data?.message || '获取科室数据失败');
    }
    return response.data;
}

async function createDepartment(token, payload) {
    const body = JSON.stringify(payload);
    const response = await requestJson(`${baseUrl}/api/departments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);
    if (!response.ok) {
        throw new Error(response.data?.message || '创建科室失败');
    }
    return response.data;
}

async function renameDepartment(token, departmentId, name) {
    const body = JSON.stringify({ name });
    const response = await requestJson(`${baseUrl}/api/departments/${encodeURIComponent(departmentId)}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);
    if (!response.ok) {
        throw new Error(response.data?.message || '重命名科室失败');
    }
    return response.data;
}

async function reorderDepartments(token, orderedIds, currentDepartmentId) {
    const body = JSON.stringify({ orderedIds, currentDepartmentId });
    const response = await requestJson(`${baseUrl}/api/departments/reorder`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);
    if (!response.ok) {
        throw new Error(response.data?.message || '科室排序失败');
    }
    return response.data;
}

async function deleteDepartmentById(token, departmentId, currentDepartmentId) {
    const response = await requestJson(
        `${baseUrl}/api/departments/${encodeURIComponent(departmentId)}?departmentId=${encodeURIComponent(currentDepartmentId || '')}`,
        {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
    if (!response.ok) {
        throw new Error(response.data?.message || '清理测试科室失败');
    }
    return response.data;
}

async function waitForCondition(checker, timeoutMs = 15000, intervalMs = 300) {
    const startedAt = Date.now();
    let lastValue = null;
    while (Date.now() - startedAt < timeoutMs) {
        lastValue = await checker();
        if (lastValue) return lastValue;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('等待验证条件超时');
}

async function run() {
    const token = await loginAsTerminal();
    const result = {
        success: false,
        baseUrl,
        step: 'init',
        createdDepartmentName: `科室管理验证_${Date.now()}`,
        renamedDepartmentName: `科室管理验证已重命名_${Date.now()}`,
        originalDepartmentName: '',
        createdDepartmentId: '',
        originalDepartmentOrder: [],
        reorderedDepartmentOrder: [],
        afterDeleteDepartmentOrder: [],
        createResponseCurrentDepartmentId: '',
        renameResponseCurrentDepartmentId: '',
        reorderResponseCurrentDepartmentId: '',
        deleteResponseCurrentDepartmentId: ''
    };
    writeResult(result);

    let createdDepartmentId = '';
    let originalDepartmentId = '';
    const originalData = await fetchDepartmentData(token);
    const originalDepartments = Array.isArray(originalData.departments) ? originalData.departments : [];
    const originalDepartment = originalDepartments.find(item => item.id === originalData.currentDepartmentId) || originalDepartments[0] || null;
    if (!originalDepartment) {
        throw new Error('未找到初始科室，无法验证科室管理');
    }
    originalDepartmentId = originalDepartment.id;
    result.originalDepartmentName = originalDepartment.name;
    result.originalDepartmentOrder = originalDepartments.map(item => item.name);
    writeResult(result);

    try {
        result.step = 'create_department';
        writeResult(result);
        const createResponse = await createDepartment(token, { name: result.createdDepartmentName });
        result.createResponseCurrentDepartmentId = createResponse.currentDepartmentId || '';
        const createdDepartment = await waitForCondition(async () => {
            const latest = await fetchDepartmentData(token);
            const departments = Array.isArray(latest.departments) ? latest.departments : [];
            return departments.find(item => item.name === result.createdDepartmentName && item.id === createResponse.currentDepartmentId) || null;
        });
        createdDepartmentId = createdDepartment.id;
        result.createdDepartmentId = createdDepartmentId;
        writeResult(result);

        result.step = 'rename_department';
        writeResult(result);
        const renameResponse = await renameDepartment(token, createdDepartmentId, result.renamedDepartmentName);
        result.renameResponseCurrentDepartmentId = renameResponse.currentDepartmentId || '';
        const renamedOk = await waitForCondition(async () => {
            const latest = await fetchDepartmentData(token, createdDepartmentId);
            return latest.currentDepartmentId === createdDepartmentId
                && Array.isArray(latest.departments)
                && latest.departments.some(item => item.id === createdDepartmentId && item.name === result.renamedDepartmentName);
        });
        if (!renamedOk) {
            throw new Error('科室重命名结果未生效');
        }

        result.step = 'move_department';
        writeResult(result);
        const latestBeforeMove = await fetchDepartmentData(token);
        const rowNamesBeforeMove = Array.isArray(latestBeforeMove.departments) ? latestBeforeMove.departments.map(item => item.name) : [];
        const movedDepartmentIndexBefore = rowNamesBeforeMove.indexOf(result.renamedDepartmentName);
        if (movedDepartmentIndexBefore <= 0) {
            throw new Error('新建科室未处于可上移位置，无法验证排序');
        }
        const expectedMovedOrder = [...rowNamesBeforeMove];
        [expectedMovedOrder[movedDepartmentIndexBefore - 1], expectedMovedOrder[movedDepartmentIndexBefore]] = [expectedMovedOrder[movedDepartmentIndexBefore], expectedMovedOrder[movedDepartmentIndexBefore - 1]];
        const orderedIds = latestBeforeMove.departments.map(item => item.id);
        [orderedIds[movedDepartmentIndexBefore - 1], orderedIds[movedDepartmentIndexBefore]] = [orderedIds[movedDepartmentIndexBefore], orderedIds[movedDepartmentIndexBefore - 1]];
        const reorderResponse = await reorderDepartments(token, orderedIds, createdDepartmentId);
        result.reorderResponseCurrentDepartmentId = reorderResponse.currentDepartmentId || '';

        const reorderedDepartments = await waitForCondition(async () => {
            const latest = await fetchDepartmentData(token);
            const names = Array.isArray(latest.departments) ? latest.departments.map(item => item.name) : [];
            return JSON.stringify(names) === JSON.stringify(expectedMovedOrder) ? latest.departments : null;
        });
        result.reorderedDepartmentOrder = reorderedDepartments.map(item => item.name);
        writeResult(result);

        result.step = 'delete_department';
        writeResult(result);
        const deleteResponse = await deleteDepartmentById(token, createdDepartmentId, originalDepartmentId);
        result.deleteResponseCurrentDepartmentId = deleteResponse.currentDepartmentId || '';
        const afterDeleteDepartments = await waitForCondition(async () => {
            const latest = await fetchDepartmentData(token, originalDepartmentId);
            const departments = Array.isArray(latest.departments) ? latest.departments : [];
            return latest.currentDepartmentId === originalDepartmentId
                && !departments.some(item => item.id === createdDepartmentId)
                ? departments
                : null;
        });
        result.afterDeleteDepartmentOrder = afterDeleteDepartments.map(item => item.name);

        result.success = result.afterDeleteDepartmentOrder.length === result.originalDepartmentOrder.length
            && JSON.stringify(result.afterDeleteDepartmentOrder) === JSON.stringify(result.originalDepartmentOrder)
            && result.createResponseCurrentDepartmentId === createdDepartmentId
            && result.renameResponseCurrentDepartmentId === createdDepartmentId
            && result.reorderResponseCurrentDepartmentId === createdDepartmentId
            && result.deleteResponseCurrentDepartmentId === originalDepartmentId;
        result.step = 'done';
        writeResult(result);
        if (!result.success) {
            throw new Error('科室管理验证未达到成功条件');
        }
        console.log(JSON.stringify(result, null, 2));
    } finally {
        if (createdDepartmentId) {
            try {
                const latest = await fetchDepartmentData(token, originalDepartmentId);
                const departments = Array.isArray(latest.departments) ? latest.departments : [];
                if (departments.some(item => item.id === createdDepartmentId)) {
                    await deleteDepartmentById(token, createdDepartmentId, latest.currentDepartmentId || originalDepartmentId);
                }
            } catch (cleanupError) {
                console.error(`清理测试科室失败: ${String(cleanupError?.message || cleanupError)}`);
            }
        }
    }
}

module.exports = { run };

if (require.main === module) {
    run().catch(error => {
        const result = {
            success: false,
            baseUrl,
            error: String(error?.stack || error?.message || error)
        };
        writeResult(result);
        console.error(JSON.stringify(result, null, 2));
        process.exitCode = 1;
    });
}
