const http = require('http');
const { URL } = require('url');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';

function request(path, { method = 'GET', token = '', body } = {}) {
    return new Promise((resolve, reject) => {
        const target = new URL(path, baseUrl);
        const headers = {};
        let payload = null;

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        if (body !== undefined) {
            payload = Buffer.from(JSON.stringify(body));
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = payload.length;
        }

        const req = http.request(target, { method, headers }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let data = raw;
                try {
                    data = raw ? JSON.parse(raw) : {};
                } catch (error) {
                    // Keep raw text if response is not JSON.
                }
                resolve({ status: res.statusCode, data });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function expectStatus(step, response, expectedStatus) {
    if (response.status !== expectedStatus) {
        throw new Error(`${step} 失败，期望状态 ${expectedStatus}，实际 ${response.status}，响应：${JSON.stringify(response.data)}`);
    }
}

async function main() {
    const tempUsername = `admin_${Date.now()}`;
    const tempPassword = 'Temp#123456';
    let terminalToken = '';
    let tempAdminId = '';
    let originalData = null;
    let targetHistoryId = '';

    try {
        const guestLogin = await request('/api/auth/guest', { method: 'POST' });
        await expectStatus('游客登录', guestLogin, 200);
        const guestToken = guestLogin.data.token;

        const guestRead = await request('/api/data', { token: guestToken });
        await expectStatus('游客读取排班数据', guestRead, 200);

        const guestWrite = await request('/api/data', {
            method: 'POST',
            token: guestToken,
            body: guestRead.data
        });
        await expectStatus('游客写入拦截', guestWrite, 403);

        const terminalLogin = await request('/api/auth/login', {
            method: 'POST',
            body: {
                username: '2203408',
                password: 'zyyfy666'
            }
        });
        await expectStatus('终端管理员登录', terminalLogin, 200);
        terminalToken = terminalLogin.data.token;

        const adminList = await request('/api/admins', { token: terminalToken });
        await expectStatus('终端管理员读取管理员列表', adminList, 200);

        const createAdmin = await request('/api/admins', {
            method: 'POST',
            token: terminalToken,
            body: {
                username: tempUsername,
                password: tempPassword,
                role: 'admin',
                displayName: '测试普通管理员',
                departmentIds: [guestRead.data.currentDepartmentId]
            }
        });
        await expectStatus('终端管理员创建普通管理员', createAdmin, 200);
        tempAdminId = createAdmin.data.admin.id;

        const adminLogin = await request('/api/auth/login', {
            method: 'POST',
            body: {
                username: tempUsername,
                password: tempPassword
            }
        });
        await expectStatus('普通管理员登录', adminLogin, 200);
        const adminToken = adminLogin.data.token;

        const adminRead = await request('/api/data', { token: adminToken });
        await expectStatus('普通管理员读取排班数据', adminRead, 200);
        originalData = JSON.parse(JSON.stringify(adminRead.data));

        if (!Array.isArray(originalData.doctors) || originalData.doctors.length === 0) {
            throw new Error('排班数据中没有医生记录，无法验证联系电话联调');
        }

        const originalPhone = originalData.doctors[0].phone || '';
        const testPhone = `1380000${String(Date.now()).slice(-4)}`;
        const nextData = JSON.parse(JSON.stringify(originalData));
        nextData.doctors[0].phone = testPhone;

        const adminWrite = await request('/api/data', {
            method: 'POST',
            token: adminToken,
            body: nextData
        });
        await expectStatus('普通管理员写入业务数据', adminWrite, 200);

        const verifyPhone = await request('/api/data', { token: adminToken });
        await expectStatus('普通管理员回读联系电话', verifyPhone, 200);
        if (verifyPhone.data.doctors[0].phone !== testPhone) {
            throw new Error('联系电话联调失败，写入后的电话号码未正确回读');
        }

        const historyList = await request('/api/history', { token: adminToken });
        await expectStatus('普通管理员读取历史快照', historyList, 200);
        if (!Array.isArray(historyList.data.history) || historyList.data.history.length === 0) {
            throw new Error('历史快照未生成，无法执行恢复验证');
        }
        targetHistoryId = historyList.data.history[0].id;

        const restoreHistory = await request(`/api/history/${targetHistoryId}/restore`, {
            method: 'POST',
            token: adminToken
        });
        await expectStatus('普通管理员恢复历史快照', restoreHistory, 200);

        const verifyRestore = await request('/api/data', { token: adminToken });
        await expectStatus('普通管理员回读恢复后的数据', verifyRestore, 200);
        if (verifyRestore.data.doctors[0].phone !== originalPhone) {
            throw new Error('历史恢复失败，恢复后的联系电话未回到原始值');
        }

        const adminListByNormal = await request('/api/admins', { token: adminToken });
        await expectStatus('普通管理员访问管理员接口拦截', adminListByNormal, 403);

        const deleteAdmin = await request(`/api/admins/${tempAdminId}`, {
            method: 'DELETE',
            token: terminalToken
        });
        await expectStatus('终端管理员删除普通管理员', deleteAdmin, 200);

        console.log('权限边界、联系电话联调与历史恢复验证通过');
    } catch (error) {
        if (terminalToken && originalData) {
            try {
                await request('/api/data', {
                    method: 'POST',
                    token: terminalToken,
                    body: originalData
                });
            } catch (restoreError) {
                console.error('恢复原始数据失败:', restoreError.message);
            }
        }

        if (terminalToken && tempAdminId) {
            try {
                await request(`/api/admins/${tempAdminId}`, {
                    method: 'DELETE',
                    token: terminalToken
                });
            } catch (deleteError) {
                console.error('清理测试管理员失败:', deleteError.message);
            }
        }

        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { run: main };

if (require.main === module) {
    main();
}
