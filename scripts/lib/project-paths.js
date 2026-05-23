const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(PROJECT_ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache');
const RUNTIME_DIR = process.env.RUNTIME_DIR ? path.resolve(process.env.RUNTIME_DIR) : path.join(CACHE_DIR, 'runtime');
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, 'artifacts');
const REPORTS_DIR = path.join(ARTIFACTS_DIR, 'reports');
const VERIFY_REPORT_DIR = path.join(REPORTS_DIR, 'verify');
const VERIFY_HTML_DIR = path.join(VERIFY_REPORT_DIR, 'html');
const E2E_REPORT_DIR = path.join(REPORTS_DIR, 'e2e');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');
const DOCS_REPORT_DIR = path.join(DOCS_DIR, 'reports');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function ensureProjectDirs() {
  [
    PUBLIC_DIR,
    DATA_DIR,
    BACKUP_DIR,
    CACHE_DIR,
    RUNTIME_DIR,
    ARTIFACTS_DIR,
    REPORTS_DIR,
    VERIFY_REPORT_DIR,
    VERIFY_HTML_DIR,
    E2E_REPORT_DIR,
    DOCS_DIR,
    DOCS_REPORT_DIR
  ].forEach(ensureDir);
}

function runtimeFile(name) {
  ensureDir(RUNTIME_DIR);
  return path.join(RUNTIME_DIR, name);
}

function verifyReportFile(name) {
  ensureDir(VERIFY_REPORT_DIR);
  return path.join(VERIFY_REPORT_DIR, name);
}

function verifyHtmlFile(name) {
  ensureDir(VERIFY_HTML_DIR);
  return path.join(VERIFY_HTML_DIR, name);
}

function e2eReportFile(name) {
  ensureDir(E2E_REPORT_DIR);
  return path.join(E2E_REPORT_DIR, name);
}

function docsReportFile(name) {
  ensureDir(DOCS_REPORT_DIR);
  return path.join(DOCS_REPORT_DIR, name);
}

function readRuntimePort() {
  try {
    const raw = fs.readFileSync(runtimeFile('.server-port'), 'utf8').trim();
    const port = Number(raw);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch (error) {
    return null;
  }
}

function resolveBaseUrl(fallbackPort = 3000) {
  const port = readRuntimePort();
  return `http://localhost:${port || fallbackPort}`;
}

function normalizeBaseUrl(value) {
  const input = String(value || '').trim();
  return input ? input.replace(/\/+$/, '') : '';
}

function resolveCliBaseUrl(argIndex = 2, fallbackPort = 3000) {
  return normalizeBaseUrl(process.argv[argIndex]) || resolveBaseUrl(fallbackPort);
}

const PUPPETEER_OPTIONS = {
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
};

module.exports = {
  PROJECT_ROOT,
  PUBLIC_DIR,
  DATA_DIR,
  BACKUP_DIR,
  CACHE_DIR,
  RUNTIME_DIR,
  ARTIFACTS_DIR,
  REPORTS_DIR,
  VERIFY_REPORT_DIR,
  VERIFY_HTML_DIR,
  E2E_REPORT_DIR,
  DOCS_DIR,
  DOCS_REPORT_DIR,
  ensureDir,
  ensureProjectDirs,
  runtimeFile,
  verifyReportFile,
  verifyHtmlFile,
  e2eReportFile,
  docsReportFile,
  readRuntimePort,
  resolveBaseUrl,
  normalizeBaseUrl,
  resolveCliBaseUrl,
  PUPPETEER_OPTIONS
};
