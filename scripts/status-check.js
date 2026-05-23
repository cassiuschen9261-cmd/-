const fs = require('fs');
const path = require('path');
const http = require('http');
const { runtimeFile, readRuntimePort } = require('./lib/project-paths');

const pidFile = runtimeFile('.server-pid');

function readNumberFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8').trim();
        const value = Number(raw);
        if (Number.isInteger(value) && value > 0) {
            return value;
        }
    } catch (error) {
        // Ignore missing or invalid runtime state files.
    }
    return null;
}

function requestJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, res => {
            let body = '';
            res.setEncoding('utf8');

            res.on('data', chunk => {
                body += chunk;
            });

            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                    return;
                }

                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(new Error(`接口返回不是有效 JSON: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy(new Error('状态检查超时'));
        });
    });
}

function isPidAlive(pid) {
    if (!pid) return false;

    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return false;
    }
}

async function main() {
    const port = readRuntimePort();
    const pid = readNumberFile(pidFile);

    console.log(`port=${port ?? 'missing'}`);
    console.log(`pid=${pid ?? 'missing'}`);
    console.log(`pidAlive=${isPidAlive(pid)}`);

    if (!port) {
        console.error('FAIL 未找到有效的 .server-port，当前无法确认服务端口');
        process.exit(1);
    }

    const healthUrl = `http://localhost:${port}/api/health`;

    try {
        const data = await requestJson(healthUrl);
        console.log(`healthUrl=${healthUrl}`);
        console.log(`status=${data.status}`);
        console.log(`uptimeSeconds=${data.uptimeSeconds}`);
        console.log(`criticalRoutesOk=${data.criticalRoutesOk}`);
        console.log(`build=${data.build?.label || 'unknown'}`);
        process.exit(0);
    } catch (error) {
        console.error(`FAIL ${healthUrl}`);
        console.error(error.message);
        process.exit(1);
    }
}

main();
