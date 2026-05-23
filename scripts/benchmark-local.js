const http = require('http');
const { resolveCliBaseUrl } = require('./lib/project-paths');

const baseUrl = resolveCliBaseUrl(2, 3000);
const sampleCount = Number(process.env.SAMPLES || 20);

function requestJson(method, path, token) {
    const url = new URL(path, baseUrl);
    const headers = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return new Promise((resolve, reject) => {
        const req = http.request({
            method,
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            headers
        }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
                body += chunk;
            });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`${method} ${path} failed: ${res.statusCode} ${body}`));
                    return;
                }
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function timedRequest(method, path, token) {
    const start = process.hrtime.bigint();
    const payload = await requestJson(method, path, token);
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    return { payload, durationMs };
}

async function main() {
    const login = await timedRequest('POST', '/api/auth/guest');
    const token = login.payload.token;
    const samples = [];

    for (let i = 0; i < sampleCount; i += 1) {
        const result = await timedRequest('GET', '/api/data', token);
        samples.push(result.durationMs);
    }

    const health = await timedRequest('GET', '/api/health');
    const total = samples.reduce((sum, current) => sum + current, 0);
    const avg = total / samples.length;
    const min = Math.min(...samples);
    const max = Math.max(...samples);

    console.log(JSON.stringify({
        baseUrl,
        sampleCount,
        guestLoginMs: Number(login.durationMs.toFixed(1)),
        dataApi: {
            avgMs: Number(avg.toFixed(1)),
            minMs: Number(min.toFixed(1)),
            maxMs: Number(max.toFixed(1))
        },
        healthApiMs: Number(health.durationMs.toFixed(1)),
        health: health.payload
    }, null, 2));
}

main().catch(error => {
    console.error('Benchmark failed:', error.message);
    process.exitCode = 1;
});
