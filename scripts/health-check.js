const fs = require('fs');
const path = require('path');
const http = require('http');
const { resolveBaseUrl } = require('./lib/project-paths');

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
            req.destroy(new Error('健康检查超时'));
        });
    });
}

async function main() {
    const baseUrl = resolveBaseUrl();
    const healthUrl = `${baseUrl}/api/health`;

    try {
        const data = await requestJson(healthUrl);
        console.log(`OK ${healthUrl}`);
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
