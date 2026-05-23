const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const os = require('os');
const crypto = require('crypto');
const http = require('http');

const app = express();
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DEFAULT_RUNTIME_ROOT = path.join(PROJECT_ROOT, '.cache', 'runtime');

function resolveConfiguredPath(configValue, fallbackPath) {
    const rawValue = String(configValue || '').trim();
    if (!rawValue) return fallbackPath;
    return path.isAbsolute(rawValue)
        ? path.normalize(rawValue)
        : path.resolve(PROJECT_ROOT, rawValue);
}

function sanitizeInstanceName(name = '') {
    return String(name || '')
        .trim()
        .replace(/[<>:"/\\|?*\s]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function buildDefaultRuntimeDir(dataDir, instanceName) {
    if (!instanceName && dataDir === DEFAULT_DATA_DIR) {
        return DEFAULT_RUNTIME_ROOT;
    }

    const safeName = sanitizeInstanceName(instanceName)
        || `instance-${crypto.createHash('sha1').update(dataDir).digest('hex').slice(0, 8)}`;
    return path.join(DEFAULT_RUNTIME_ROOT, safeName);
}

const INSTANCE_NAME = String(process.env.INSTANCE_NAME || '').trim();
const DATA_DIR = resolveConfiguredPath(process.env.DATA_DIR, DEFAULT_DATA_DIR);
const RUNTIME_DIR = resolveConfiguredPath(
    process.env.RUNTIME_DIR,
    buildDefaultRuntimeDir(DATA_DIR, INSTANCE_NAME)
);
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const DRAFT_FILE = path.join(DATA_DIR, 'drafts.json');
const PORT_FILE = path.join(RUNTIME_DIR, '.server-port');
const PID_FILE = path.join(RUNTIME_DIR, '.server-pid');
const LOG_FILE = path.join(RUNTIME_DIR, 'server_launcher.log');
const PACKAGE_FILE = path.join(PROJECT_ROOT, 'package.json');
const INSTANCE_LABEL = INSTANCE_NAME || path.basename(DATA_DIR) || 'default';
const ROLE_TERMINAL = 'terminal';
const ROLE_ADMIN = 'admin';
const ROLE_GUEST = 'guest';
const HISTORY_LIMIT = 30;
const NOTICE_HISTORY_LIMIT = 30;
const NOTICE_HISTORY_FIELDS = new Set(['teaching', 'special']);
const sessions = new Map();
const DEFAULT_UI_SETTINGS = {
    scheduleFontSize: 13,
    sidebarWidth: 620
};
const DEFAULT_WEEKDAY_NOTES = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 0: '' };
const DEFAULT_DEPARTMENT_NAME = '默认科室';
const DEFAULT_SIDEBAR_MODE = 'default';
const DEFAULT_CUSTOM_SIDEBAR_MODE = 'module_all_valid';
const SIDEBAR_MODE_OPTIONS = new Set(['default', 'module_all_valid', 'module_duty_only', 'module_clinic_only', 'module_keyword', 'module_shift_whitelist', 'hidden']);
const SIDEBAR_ACCENT_OPTIONS = new Set(['', '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0f766e']);
const SIDEBAR_GROUP_MODE_OPTIONS = new Set(['merge_by_shift', 'split_by_doctor']);
const SIDEBAR_PHONE_MODE_OPTIONS = new Set(['separate_line', 'inline_after_name', 'badge_after_name']);
const SIDEBAR_TITLE_MODE_OPTIONS = new Set(['inline', 'badge']);
const SIDEBAR_DENSITY_OPTIONS = new Set(['standard', 'compact']);
const SIDEBAR_COUNT_MODE_OPTIONS = new Set(['hidden', 'multi_only', 'always']);
const DEFAULT_SCHEDULE_MODULES = [
    { id: 'first', doctorLabel: '一线医生', groupName: '一线班', clearLabel: '清空一线班排班', order: 1, enabled: true, allowFixedWeekdays: false, allowMultiAssign: true, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 10, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] },
    { id: 'second', doctorLabel: '二线医生', groupName: '二线班', clearLabel: '清空二线班排班', order: 2, enabled: true, allowFixedWeekdays: true, allowMultiAssign: true, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 20, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] },
    { id: 'third', doctorLabel: '三线医生', groupName: '三线班', clearLabel: '清空三线班排班', order: 3, enabled: true, allowFixedWeekdays: true, allowMultiAssign: true, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 30, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] },
    { id: 'trainee', doctorLabel: '轮转/规培/进修', groupName: '轮转/规培/进修班', clearLabel: '清空轮转班排班', order: 4, enabled: true, allowFixedWeekdays: false, allowMultiAssign: false, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 40, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] },
    { id: 'teaching_clinic', doctorLabel: '教学门诊安排', groupName: '教学门诊安排', clearLabel: '清空教学门诊安排', order: 5, enabled: true, allowFixedWeekdays: true, allowMultiAssign: true, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 50, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] }
];
const TEACHING_CLINIC_ENABLED_SHIFT_KEYS = new Set(['morning', 'afternoon', 'fullday', 'teaching', 'general_secondary', 'outside']);
const LEGACY_SHIFT_CATEGORY_MAP = {
    morning: ['second', 'third'],
    afternoon: ['second', 'third'],
    fullday: ['second', 'third'],
    teaching: ['second', 'third'],
    general_secondary: ['second', 'third'],
    outside: ['third']
};
let cachedData = null;
let cachedSummaries = null;
let persistQueue = Promise.resolve();

function invalidateCache() {
    cachedSummaries = null;
}

function readPackageVersion() {
    try {
        return JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf-8')).version || '0.0.0';
    } catch (error) {
        return '0.0.0';
    }
}

function readServerBuildInfo() {
    try {
        const source = fs.readFileSync(__filename, 'utf-8');
        const stats = fs.statSync(__filename);
        const shortHash = crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
        return {
            version: readPackageVersion(),
            shortHash,
            modifiedAt: stats.mtime.toISOString(),
            label: `v${readPackageVersion()}-${shortHash}`
        };
    } catch (error) {
        return {
            version: readPackageVersion(),
            shortHash: 'unknown',
            modifiedAt: 'unknown',
            label: `v${readPackageVersion()}-unknown`
        };
    }
}

const SERVER_BUILD_INFO = readServerBuildInfo();
const CRITICAL_ROUTE_DEFINITIONS = [
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/data' },
    { method: 'POST', path: '/api/departments' },
    { method: 'DELETE', path: '/api/departments/:id' }
];

function hashPassword(password) {
    return crypto.createHash('sha256').update(String(password)).digest('hex');
}

const defaultTerminalAdmin = {
    id: 'admin-terminal-default',
    username: 'admin',
    passwordHash: hashPassword('admin'),
    role: ROLE_TERMINAL,
    displayName: '超级管理员'
};

// 获取本机局域网 IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const devName in interfaces) {
        // 排除常见的虚拟网卡名称
        if (devName.toLowerCase().includes('vbox') || 
            devName.toLowerCase().includes('virtual') || 
            devName.toLowerCase().includes('vmware') || 
            devName.toLowerCase().includes('clash') ||
            devName.toLowerCase().includes('tailscale') ||
            devName.toLowerCase().includes('docker') ||
            devName.toLowerCase().includes('hyper-v')) {
            continue;
        }

        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                // 优先考虑 192.168.x.x, 10.x.x.x, 172.16-31.x.x
                const addr = alias.address;
                if (addr.startsWith('192.168.') || addr.startsWith('10.')) {
                    return addr;
                }
                if (addr.startsWith('172.')) {
                    const secondOctet = parseInt(addr.split('.')[1], 10);
                    if (secondOctet >= 16 && secondOctet <= 31) {
                        return addr;
                    }
                }
                candidates.push(addr);
            }
        }
    }
    
    // 如果没有找到典型的局域网 IP，但有其他非本地 IP，返回第一个
    if (candidates.length > 0) {
        return candidates[0];
    }

    return 'localhost';
}

const localIP = getLocalIP();

function hasRegisteredRoute(method, routePath) {
    const stack = app?._router?.stack || [];
    const targetMethod = String(method || '').toLowerCase();
    return stack.some(layer => layer.route
        && layer.route.path === routePath
        && layer.route.methods
        && layer.route.methods[targetMethod]);
}

function getCriticalRouteChecks() {
    return CRITICAL_ROUTE_DEFINITIONS.map(route => ({
        ...route,
        registered: hasRegisteredRoute(route.method, route.path)
    }));
}

function formatRouteChecks(routeChecks = []) {
    return routeChecks
        .map(route => `${route.registered ? 'OK' : 'MISS'} ${route.method} ${route.path}`)
        .join(' | ');
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});
app.use((req, res, next) => {
    const startTime = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (durationMs >= 150) {
            console.log(`[slow-request] ${req.method} ${req.originalUrl} ${durationMs.toFixed(1)}ms`);
        }
    });
    next();
});
app.use(express.static(PUBLIC_DIR, {
    etag: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            // 禁止缓存 HTML 文件，确保每次获取最新结构
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (path.endsWith('.js') || path.endsWith('.css')) {
            // 对 js/css 文件使用协商缓存
            res.setHeader('Cache-Control', 'no-cache');
        } else {
            // 对其他静态资源（如字体、图片）可以使用强缓存
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

const INITIAL_DEPARTMENT_DOCTORS = [
        // 一线 6人
        { id: 'f1', name: '张医生', title: '主治医师', category: 'first', phone: '' },
        { id: 'f2', name: '李医生', title: '住院医师', category: 'first', phone: '' },
        { id: 'f3', name: '王医生', title: '主治医师', category: 'first', phone: '' },
        { id: 'f4', name: '赵医生', title: '住院医师', category: 'first', phone: '' },
        { id: 'f5', name: '孙医生', title: '主治医师', category: 'first', phone: '' },
        { id: 'f6', name: '周医生', title: '住院医师', category: 'first', phone: '' },
        // 二线 5人
        { id: 's1', name: '陈教授', title: '主任医师', category: 'second', phone: '' },
        { id: 's2', name: '吴教授', title: '副主任医师', category: 'second', phone: '' },
        { id: 's3', name: '郑教授', title: '主任医师', category: 'second', phone: '' },
        { id: 's4', name: '冯教授', title: '副主任医师', category: 'second', phone: '' },
        { id: 's5', name: '褚教授', title: '主任医师', category: 'second', phone: '' },
        // 三线 5人
        { id: 'th1', name: '何教授', title: '主任医师', category: 'third', phone: '' },
        { id: 'th2', name: '吕教授', title: '副主任医师', category: 'third', phone: '' },
        { id: 'th3', name: '施教授', title: '主任医师', category: 'third', phone: '' },
        { id: 'th4', name: '孔教授', title: '副主任医师', category: 'third', phone: '' },
        { id: 'th5', name: '曹教授', title: '主任医师', category: 'third', phone: '' },
        // 轮转 5人
        { id: 't1', name: '刘医生', title: '规培生', category: 'trainee', phone: '' },
        { id: 't2', name: '马医生', title: '进修生', category: 'trainee', phone: '' },
        { id: 't3', name: '朱医生', title: '轮转医生', category: 'trainee', phone: '' },
        { id: 't4', name: '秦医生', title: '规培生', category: 'trainee', phone: '' },
        { id: 't5', name: '许医生', title: '进修生', category: 'trainee', phone: '' }
];
const INITIAL_DEPARTMENT_SHIFT_TYPES = [
        { id: 'sh1', name: '白班', short: '白', color: 'blue', categories: ['first', 'trainee'], systemKey: 'day' },
        { id: 'sh2', name: '副班', short: '副', color: 'teal', categories: ['first', 'trainee'], systemKey: 'assistant' },
        { id: 'sh3', name: '一线值班', short: '一值', color: 'red', categories: ['first', 'trainee'], systemKey: 'first_oncall' },
        { id: 'sh4', name: '普通班', short: '普', color: 'gray', categories: ['first', 'trainee'], systemKey: 'general' },
        { id: 'sh5', name: '上午门诊', short: '上门', color: 'orange', categories: ['second', 'third', 'teaching_clinic'], systemKey: 'morning' },
        { id: 'sh6', name: '下午门诊', short: '下门', color: 'purple', categories: ['second', 'third', 'teaching_clinic'], systemKey: 'afternoon' },
        { id: 'sh7', name: '全天门诊', short: '全门', color: 'indigo', categories: ['second', 'third', 'teaching_clinic'], systemKey: 'fullday' },
        { id: 'sh8', name: '二线值班', short: '二值', color: 'red', categories: ['second'], systemKey: 'second_oncall' },
        { id: 'sh9', name: '跟值班', short: '跟值', color: 'green', categories: ['trainee'], systemKey: 'trainee_follow' },
        { id: 'sh10', name: '教学', short: '教', color: 'teal', categories: ['second', 'third', 'teaching_clinic'], systemKey: 'teaching' },
        { id: 'sh11', name: '普通班', short: '普', color: 'gray', categories: ['second', 'third', 'teaching_clinic'], systemKey: 'general_secondary' },
        { id: 'sh12', name: '外出', short: '外', color: 'gray', categories: ['third', 'teaching_clinic'], systemKey: 'outside' },
        { id: 'sh_blank', name: '空白班', short: '', color: 'blank', categories: ['first', 'trainee', 'second', 'third'], systemKey: 'blank_fill' }
];

function createDefaultDepartmentSeed() {
    return {
        name: DEFAULT_DEPARTMENT_NAME,
        modules: cloneJson(DEFAULT_SCHEDULE_MODULES),
        doctors: cloneJson(INITIAL_DEPARTMENT_DOCTORS),
        shiftTypes: cloneJson(INITIAL_DEPARTMENT_SHIFT_TYPES),
        scheduleData: {},
        notices: {
            teaching: '暂无公告',
            special: '暂无特别备注',
            teachingClinicWeekdays: { ...DEFAULT_WEEKDAY_NOTES },
            teachingClinicMembers: []
        },
        noticeHistory: {
            teaching: [],
            special: []
        },
        uiSettings: { ...DEFAULT_UI_SETTINGS },
        scheduleHistory: []
    };
}

// 初始化数据
const initialData = {
    admins: [defaultTerminalAdmin],
    departments: [
        {
            id: 'dept-default',
            order: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...createDefaultDepartmentSeed()
        }
    ]
};

function saveRawData(data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function writeDataFileAtomic(data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tempPath = `${DATA_FILE}.tmp`;
    const serialized = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(tempPath, serialized, 'utf-8');
    await fs.promises.rename(tempPath, DATA_FILE);
}

function normalizeDoctor(doctor = {}, index = 0) {
    return {
        id: doctor.id || `doctor-${Date.now()}-${index}`,
        name: doctor.name || `未命名医生${index + 1}`,
        title: doctor.title || '未填写',
        category: doctor.category || 'first',
        phone: doctor.phone || ''
    };
}

function normalizeDepartmentIds(departmentIds) {
    if (!Array.isArray(departmentIds)) return [];
    return Array.from(new Set(
        departmentIds
            .map(item => String(item || '').trim())
            .filter(Boolean)
    ));
}

function normalizeAdmin(admin = {}, index = 0) {
    const role = [ROLE_TERMINAL, ROLE_ADMIN].includes(admin.role) ? admin.role : ROLE_ADMIN;
    const passwordHash = admin.passwordHash || (admin.password ? hashPassword(admin.password) : '');
    const departmentIds = role === ROLE_ADMIN ? normalizeDepartmentIds(admin.departmentIds) : [];
    return {
        id: admin.id || `admin-${Date.now()}-${index}`,
        username: String(admin.username || '').trim(),
        passwordHash,
        role,
        displayName: admin.displayName || (role === ROLE_TERMINAL ? '终端管理员' : '普通管理员'),
        departmentIds
    };
}

function normalizeHistoryEntry(entry = {}, index = 0) {
    const snapshot = entry.data || {};
    return {
        id: entry.id || `history-${Date.now()}-${index}`,
        createdAt: entry.createdAt || new Date().toISOString(),
        actor: {
            id: entry.actor?.id || 'system',
            username: entry.actor?.username || 'system',
            role: entry.actor?.role || ROLE_ADMIN,
            displayName: entry.actor?.displayName || '系统'
        },
        summary: entry.summary || '历史排班快照',
        data: {
            modules: Array.isArray(snapshot.modules) ? snapshot.modules : [],
            doctors: Array.isArray(snapshot.doctors) ? snapshot.doctors : [],
            scheduleData: snapshot.scheduleData && typeof snapshot.scheduleData === 'object' ? snapshot.scheduleData : {},
            shiftTypes: Array.isArray(snapshot.shiftTypes) ? snapshot.shiftTypes : [],
            notices: normalizeNotices(snapshot.notices),
            uiSettings: normalizeUiSettings(snapshot.uiSettings)
        }
    };
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
}

function normalizeSidebarAccentColor(value, fallback = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return fallback;
    return SIDEBAR_ACCENT_OPTIONS.has(normalized) ? normalized : fallback;
}

function normalizeUiSettings(settings = {}) {
    return {
        scheduleFontSize: clampNumber(settings.scheduleFontSize, 11, 22, DEFAULT_UI_SETTINGS.scheduleFontSize),
        sidebarWidth: clampNumber(settings.sidebarWidth, 420, 920, DEFAULT_UI_SETTINGS.sidebarWidth)
    };
}

function shouldAutoAddTeachingClinicCategory(shift, categories) {
    if (!TEACHING_CLINIC_ENABLED_SHIFT_KEYS.has(shift?.systemKey)) return false;
    if (categories.includes('teaching_clinic')) return false;

    const legacyCategories = LEGACY_SHIFT_CATEGORY_MAP[shift.systemKey];
    if (!legacyCategories) return false;
    if (categories.length !== legacyCategories.length) return false;

    return legacyCategories.every(category => categories.includes(category));
}

function normalizeWeekdayNotes(weekdayNotes = {}) {
    return {
        1: String(weekdayNotes?.[1] ?? weekdayNotes?.['1'] ?? '').trim(),
        2: String(weekdayNotes?.[2] ?? weekdayNotes?.['2'] ?? '').trim(),
        3: String(weekdayNotes?.[3] ?? weekdayNotes?.['3'] ?? '').trim(),
        4: String(weekdayNotes?.[4] ?? weekdayNotes?.['4'] ?? '').trim(),
        5: String(weekdayNotes?.[5] ?? weekdayNotes?.['5'] ?? '').trim(),
        6: String(weekdayNotes?.[6] ?? weekdayNotes?.['6'] ?? '').trim(),
        0: String(weekdayNotes?.[0] ?? weekdayNotes?.['0'] ?? '').trim()
    };
}

function normalizeNotices(notices = {}) {
    return {
        teaching: String(notices?.teaching || ''),
        special: String(notices?.special || ''),
        teachingClinicWeekdays: normalizeWeekdayNotes(notices?.teachingClinicWeekdays || DEFAULT_WEEKDAY_NOTES),
        teachingClinicMembers: Array.isArray(notices?.teachingClinicMembers) ? notices.teachingClinicMembers : []
    };
}

function normalizeNoticeHistoryEntry(entry = {}, index = 0) {
    const rawCreatedAt = entry.createdAt || entry.timestamp || new Date().toISOString();
    const parsedDate = new Date(rawCreatedAt);
    return {
        id: String(entry.id || `notice-history-${Date.now()}-${index}`).trim(),
        createdAt: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
        actor: entry.actor ? {
            id: entry.actor.id || 'system',
            username: entry.actor.username || 'system',
            role: entry.actor.role || ROLE_ADMIN,
            displayName: entry.actor.displayName || '系统'
        } : null,
        content: String(entry.content || '').trim()
    };
}

function normalizeNoticeHistoryMap(history = {}) {
    const normalized = {};
    NOTICE_HISTORY_FIELDS.forEach(field => {
        const rawEntries = Array.isArray(history?.[field]) ? history[field] : [];
        normalized[field] = rawEntries
            .map((entry, index) => normalizeNoticeHistoryEntry(entry, index))
            .filter(entry => entry.content)
            .slice(0, NOTICE_HISTORY_LIMIT);
    });
    return normalized;
}

function getSchedulablePayload(data = {}) {
    return {
        modules: Array.isArray(data.modules) ? data.modules : [],
        doctors: Array.isArray(data.doctors) ? data.doctors : [],
        scheduleData: data.scheduleData && typeof data.scheduleData === 'object' ? data.scheduleData : {},
        shiftTypes: Array.isArray(data.shiftTypes) ? data.shiftTypes : [],
        notices: normalizeNotices(data.notices),
        uiSettings: normalizeUiSettings(data.uiSettings)
    };
}

function cloneJson(data) {
    return JSON.parse(JSON.stringify(data));
}

function createDepartmentId() {
    return `dept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeScheduleModule(module = {}, index = 0) {
    const fallback = DEFAULT_SCHEDULE_MODULES.find(item => item.id === module.id) || {};
    const defaultSidebarMode = fallback.sidebarMode || (fallback.id ? DEFAULT_SIDEBAR_MODE : DEFAULT_CUSTOM_SIDEBAR_MODE);
    const defaultSidebarOrder = Number.isFinite(Number(module.sidebarOrder))
        ? clampNumber(module.sidebarOrder, 1, 999, 100 + ((fallback.order || index + 1) * 10))
        : clampNumber(fallback.sidebarOrder, 1, 999, 100 + ((fallback.order || index + 1) * 10));
    const normalized = {
        id: String(module.id || fallback.id || `module-${index + 1}`).trim(),
        doctorLabel: String(module.doctorLabel || fallback.doctorLabel || `模块${index + 1}`).trim() || `模块${index + 1}`,
        groupName: String(module.groupName || fallback.groupName || module.doctorLabel || fallback.doctorLabel || `模块${index + 1}`).trim() || `模块${index + 1}`,
        clearLabel: String(module.clearLabel || fallback.clearLabel || `清空${module.groupName || fallback.groupName || module.doctorLabel || fallback.doctorLabel || `模块${index + 1}`}`).trim(),
        order: clampNumber(module.order, 1, 9999, fallback.order || index + 1),
        enabled: module.enabled !== false,
        allowFixedWeekdays: module.allowFixedWeekdays ?? fallback.allowFixedWeekdays ?? false,
        allowMultiAssign: module.allowMultiAssign ?? fallback.allowMultiAssign ?? true,
        sidebarMode: SIDEBAR_MODE_OPTIONS.has(module.sidebarMode) ? module.sidebarMode : defaultSidebarMode,
        sidebarLabel: String(module.sidebarLabel ?? fallback.sidebarLabel ?? '').trim(),
        sidebarOrder: defaultSidebarOrder,
        sidebarShowLabel: module.sidebarShowLabel ?? fallback.sidebarShowLabel ?? true,
        sidebarShowPhone: module.sidebarShowPhone ?? fallback.sidebarShowPhone ?? false,
        sidebarPhoneMode: SIDEBAR_PHONE_MODE_OPTIONS.has(module.sidebarPhoneMode) ? module.sidebarPhoneMode : (fallback.sidebarPhoneMode || 'separate_line'),
        sidebarShowTitle: module.sidebarShowTitle ?? fallback.sidebarShowTitle ?? false,
        sidebarTitleMode: SIDEBAR_TITLE_MODE_OPTIONS.has(module.sidebarTitleMode) ? module.sidebarTitleMode : (fallback.sidebarTitleMode || 'inline'),
        sidebarShowShiftName: module.sidebarShowShiftName ?? fallback.sidebarShowShiftName ?? true,
        sidebarGroupMode: SIDEBAR_GROUP_MODE_OPTIONS.has(module.sidebarGroupMode) ? module.sidebarGroupMode : (fallback.sidebarGroupMode || 'merge_by_shift'),
        sidebarDensity: SIDEBAR_DENSITY_OPTIONS.has(module.sidebarDensity) ? module.sidebarDensity : (fallback.sidebarDensity || 'standard'),
        sidebarShowIfEmpty: !!(module.sidebarShowIfEmpty ?? fallback.sidebarShowIfEmpty),
        sidebarCountMode: SIDEBAR_COUNT_MODE_OPTIONS.has(module.sidebarCountMode) ? module.sidebarCountMode : (fallback.sidebarCountMode || 'hidden'),
        sidebarAccentColor: normalizeSidebarAccentColor(module.sidebarAccentColor, normalizeSidebarAccentColor(fallback.sidebarAccentColor)),
        sidebarKeywordsText: String(module.sidebarKeywordsText ?? fallback.sidebarKeywordsText ?? '').trim(),
        sidebarShiftIds: Array.isArray(module.sidebarShiftIds)
            ? Array.from(new Set(module.sidebarShiftIds.map(item => String(item || '').trim()).filter(Boolean)))
            : Array.isArray(fallback.sidebarShiftIds) ? [...fallback.sidebarShiftIds] : []
    };
    return normalized;
}

function normalizeScheduleModules(modules = []) {
    let changed = false;
    const normalizedModules = Array.isArray(modules)
        ? modules.map((module, index) => {
            const normalized = normalizeScheduleModule(module, index);
            if (JSON.stringify(normalized) !== JSON.stringify(module)) changed = true;
            return normalized;
        })
        : [];

    normalizedModules.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.groupName.localeCompare(b.groupName, 'zh-CN');
    });

    normalizedModules.forEach((module, idx) => {
        module.order = idx + 1;
    });

    return { modules: normalizedModules, changed };
}

function normalizeDepartment(department = {}, index = 0) {
    let changed = false;
    const seed = createDefaultDepartmentSeed();
    const archived = !!department.archived;
    if (department.archived !== archived) changed = true;

    const rawModules = Array.isArray(department.modules) ? department.modules : seed.modules;
    const normalizedModulesResult = normalizeScheduleModules(rawModules);
    const modules = normalizedModulesResult.modules;
    if (normalizedModulesResult.changed) changed = true;

    const rawDoctors = Array.isArray(department.doctors) ? department.doctors : seed.doctors;
    const doctors = rawDoctors.map((doctor, doctorIndex) => {
        const normalized = normalizeDoctor(doctor, doctorIndex);
        if (JSON.stringify(normalized) !== JSON.stringify(doctor)) changed = true;
        return normalized;
    });

    let shiftTypes;
    if (!Array.isArray(department.shiftTypes)) {
        shiftTypes = cloneJson(seed.shiftTypes);
        changed = true;
    } else {
        shiftTypes = department.shiftTypes.map(shift => {
            const categories = Array.isArray(shift.categories) ? [...shift.categories] : [];
            if (!shouldAutoAddTeachingClinicCategory(shift, categories)) {
                return shift;
            }

            changed = true;
            categories.push('teaching_clinic');
            return { ...shift, categories };
        });
    }

    let scheduleData = department.scheduleData;
    if (!scheduleData || typeof scheduleData !== 'object' || Array.isArray(scheduleData)) {
        scheduleData = {};
        changed = true;
    }

    const notices = normalizeNotices(department.notices || seed.notices);
    if (JSON.stringify(notices) !== JSON.stringify(department.notices || {})) {
        changed = true;
    }

    const noticeHistory = normalizeNoticeHistoryMap(department.noticeHistory || seed.noticeHistory);
    if (JSON.stringify(noticeHistory) !== JSON.stringify(department.noticeHistory || {})) {
        changed = true;
    }

    const uiSettings = normalizeUiSettings(department.uiSettings || seed.uiSettings);
    if (JSON.stringify(uiSettings) !== JSON.stringify(department.uiSettings || {})) {
        changed = true;
    }

    const rawHistory = Array.isArray(department.scheduleHistory) ? department.scheduleHistory : [];
    const scheduleHistory = rawHistory
        .map((entry, historyIndex) => normalizeHistoryEntry(entry, historyIndex))
        .slice(0, HISTORY_LIMIT);
    if (rawHistory.length !== scheduleHistory.length) changed = true;

    const createdAt = department.createdAt || new Date().toISOString();
    const updatedAt = department.updatedAt || createdAt;
    if (!department.createdAt || !department.updatedAt) changed = true;

    const normalized = {
        id: String(department.id || createDepartmentId()).trim(),
        name: String(department.name || `${DEFAULT_DEPARTMENT_NAME}${index > 0 ? index + 1 : ''}`).trim() || `${DEFAULT_DEPARTMENT_NAME}${index > 0 ? index + 1 : ''}`,
        order: clampNumber(department.order, 1, 9999, index + 1),
        archived,
        createdAt,
        updatedAt,
        modules,
        doctors,
        shiftTypes,
        scheduleData,
        notices,
        noticeHistory,
        uiSettings,
        scheduleHistory
    };

    if (JSON.stringify(normalized) !== JSON.stringify(department)) {
        changed = true;
    }

    return { department: normalized, changed };
}

function getDepartmentList(data = {}) {
    return Array.isArray(data.departments) ? data.departments : [];
}

function getDepartmentById(data = {}, departmentId = '') {
    const departments = getDepartmentList(data);
    if (!departments.length) return null;
    return departments.find(item => item.id === departmentId) || departments[0];
}

function isDepartmentScopedAdmin(user) {
    return user?.role === ROLE_ADMIN;
}

function getAccessibleDepartments(data = {}, user = null) {
    const departments = getDepartmentList(data);
    if (!isDepartmentScopedAdmin(user)) {
        return departments;
    }

    const allowedDepartmentIds = normalizeDepartmentIds(user.departmentIds);
    if (!allowedDepartmentIds.length) {
        return [];
    }

    const allowedIds = new Set(allowedDepartmentIds);
    return departments.filter(department => allowedIds.has(department.id));
}

function getAccessibleDepartmentById(data = {}, user = null, departmentId = '') {
    const departments = getAccessibleDepartments(data, user);
    if (!departments.length) return null;
    if (departmentId) {
        return departments.find(item => item.id === departmentId) || null;
    }
    return departments[0];
}

function getDepartmentAccessErrorMessage(data = {}, user = null) {
    if (isDepartmentScopedAdmin(user) && normalizeDepartmentIds(user.departmentIds).length === 0) {
        return '当前账号未分配可访问科室';
    }
    return getAccessibleDepartments(data, user).length > 0
        ? '当前账号无权访问该科室'
        : '当前账号未分配可访问科室';
}

function getDepartmentSummary(department = {}) {
    return {
        id: department.id,
        name: department.name,
        order: department.order,
        archived: !!department.archived,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt,
        doctorCount: Array.isArray(department.doctors) ? department.doctors.length : 0,
        shiftCount: Array.isArray(department.shiftTypes) ? department.shiftTypes.length : 0,
        scheduledDayCount: Object.keys(department.scheduleData || {}).length
    };
}

function summarizeDepartmentList(departments = []) {
    return departments
        .map(getDepartmentSummary)
        .sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.name.localeCompare(b.name, 'zh-CN');
        });
}

function getDepartmentSummaries(data = {}, user = null) {
    if (!isDepartmentScopedAdmin(user)) {
        if (cachedSummaries) return cachedSummaries;
        cachedSummaries = summarizeDepartmentList(getDepartmentList(data));
        return cachedSummaries;
    }

    return summarizeDepartmentList(getAccessibleDepartments(data, user));
}

function normalizeData(rawData = {}) {
    let changed = false;
    const data = { ...rawData };

    const legacyDepartmentPayload = {
        id: 'dept-default',
        name: DEFAULT_DEPARTMENT_NAME,
        order: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        doctors: data.doctors,
        shiftTypes: data.shiftTypes,
        scheduleData: data.scheduleData,
        notices: data.notices,
        uiSettings: data.uiSettings,
        scheduleHistory: data.scheduleHistory
    };

    const rawDepartments = Array.isArray(data.departments) && data.departments.length
        ? data.departments
        : [legacyDepartmentPayload];
    if (!Array.isArray(data.departments)) changed = true;

    const seenDepartmentIds = new Set();
    data.departments = rawDepartments.map((department, index) => {
        const { department: normalizedDepartment, changed: departmentChanged } = normalizeDepartment(department, index);
        if (departmentChanged) changed = true;

        if (seenDepartmentIds.has(normalizedDepartment.id)) {
            normalizedDepartment.id = createDepartmentId();
            changed = true;
        }
        seenDepartmentIds.add(normalizedDepartment.id);
        return normalizedDepartment;
    });

    if (!data.departments.length) {
        data.departments = [{
            id: 'dept-default',
            order: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...createDefaultDepartmentSeed()
        }];
        changed = true;
    }

    const rawAdmins = Array.isArray(data.admins) ? data.admins : [];
    const normalizedAdmins = rawAdmins
        .map((admin, index) => normalizeAdmin(admin, index))
        .filter(admin => admin.username && admin.passwordHash);

    if (normalizedAdmins.length !== rawAdmins.length) changed = true;

    const hasDefaultTerminal = normalizedAdmins.some(admin => admin.username === defaultTerminalAdmin.username);
    if (!hasDefaultTerminal) {
        normalizedAdmins.unshift({ ...defaultTerminalAdmin });
        changed = true;
    }

    data.admins = normalizedAdmins.map(admin => {
        if (admin.username === defaultTerminalAdmin.username) {
            if (admin.role !== defaultTerminalAdmin.role) changed = true;
            return { ...admin, role: defaultTerminalAdmin.role };
        }
        return admin;
    });

    if (!data.admins.length) {
        data.admins = [{ ...defaultTerminalAdmin }];
        changed = true;
    }

    if (!Array.isArray(data.admins)) {
        data.admins = [{ ...defaultTerminalAdmin }];
        changed = true;
    }

    delete data.doctors;
    delete data.shiftTypes;
    delete data.scheduleData;
    delete data.notices;
    delete data.noticeHistory;
    delete data.uiSettings;
    delete data.scheduleHistory;

    return { data, changed };
}

function ensureDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        saveRawData(initialData);
    }
}

function loadData() {
    if (cachedData) {
        return cachedData;
    }
    ensureDataFile();
    const rawData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const { data, changed } = normalizeData(rawData);
    cachedData = data;
    invalidateCache();
    if (changed) {
        queuePersist(cachedData, 'Error normalizing cached data to disk:');
    }
    return cachedData;
}

function queuePersist(data, errorPrefix = 'Error persisting data:') {
    const startTime = process.hrtime.bigint();
    const snapshot = JSON.parse(JSON.stringify(data)); // Simplified clone
    
    const nextTask = persistQueue
        .catch(() => undefined)
        .then(async () => {
            await writeDataFileAtomic(snapshot);
            const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
            if (durationMs > 100) {
                console.log(`[performance] Persistence took ${durationMs.toFixed(1)}ms`);
            }
        });

    persistQueue = nextTask.catch(error => {
        console.error(errorPrefix, error);
    });

    return nextTask;
}

function persistData(nextData) {
    const { data } = normalizeData(nextData);
    cachedData = data;
    invalidateCache();
    return queuePersist(cachedData).then(() => cachedData);
}

function appendHistorySnapshot(currentData, actor, summary) {
    const snapshotPayload = getSchedulablePayload(currentData);
    const entry = normalizeHistoryEntry({
        id: `history-${Date.now()}`,
        createdAt: new Date().toISOString(),
        actor: buildSafeUser(actor),
        summary,
        data: cloneJson(snapshotPayload)
    });

    const history = Array.isArray(currentData.scheduleHistory) ? currentData.scheduleHistory : [];
    return [entry, ...history].slice(0, HISTORY_LIMIT);
}

function appendNoticeHistoryEntry(currentData, field, content, actor, createdAt = new Date().toISOString()) {
    if (!NOTICE_HISTORY_FIELDS.has(field)) {
        return normalizeNoticeHistoryMap(currentData.noticeHistory);
    }
    const normalizedContent = String(content || '').trim();
    const nextHistory = normalizeNoticeHistoryMap(currentData.noticeHistory);
    if (!normalizedContent) {
        return nextHistory;
    }
    if (nextHistory[field]?.[0]?.content === normalizedContent) {
        return nextHistory;
    }
    const entry = normalizeNoticeHistoryEntry({
        id: `notice-history-${Date.now()}`,
        createdAt,
        actor: actor ? buildSafeUser(actor) : null,
        content: normalizedContent
    });
    nextHistory[field] = [entry, ...(nextHistory[field] || [])].slice(0, NOTICE_HISTORY_LIMIT);
    return nextHistory;
}

function mergeNoticeHistoryEntries(currentData, field, entries = [], actor) {
    const mergedHistory = normalizeNoticeHistoryMap(currentData.noticeHistory);
    if (!NOTICE_HISTORY_FIELDS.has(field) || !Array.isArray(entries) || !entries.length) {
        return mergedHistory;
    }
    const seen = new Set((mergedHistory[field] || []).map(entry => `${entry.content}::${entry.createdAt}`));
    const importedEntries = entries
        .map((entry, index) => normalizeNoticeHistoryEntry({
            ...entry,
            actor: entry.actor || (actor ? buildSafeUser(actor) : null)
        }, index))
        .filter(entry => {
            const key = `${entry.content}::${entry.createdAt}`;
            if (!entry.content || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    mergedHistory[field] = [...importedEntries, ...(mergedHistory[field] || [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, NOTICE_HISTORY_LIMIT);
    return mergedHistory;
}

function buildSafeUser(admin) {
    return {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        displayName: admin.displayName,
        departmentIds: normalizeDepartmentIds(admin.departmentIds)
    };
}

function buildDepartmentResponse(data, departmentId = '', user = null) {
    const department = getAccessibleDepartmentById(data, user, departmentId);
    if (!department) {
        return {
            departments: [],
            currentDepartmentId: '',
            doctors: [],
            scheduleData: {},
            shiftTypes: [],
            notices: normalizeNotices(),
            uiSettings: normalizeUiSettings()
        };
    }

    return {
        departments: getDepartmentSummaries(data, user),
        currentDepartmentId: department.id,
        ...getSchedulablePayload(department)
    };
}

function buildHistorySummary(entry = {}, departmentId = '') {
    const payload = getSchedulablePayload(entry.data || {});
    return {
        id: entry.id,
        createdAt: entry.createdAt,
        actor: entry.actor || null,
        summary: entry.summary,
        doctorCount: payload.doctors.length,
        scheduledDayCount: Object.keys(payload.scheduleData || {}).length,
        departmentId
    };
}

function buildNoticeHistorySummary(entry = {}, departmentId = '', field = '') {
    return {
        id: entry.id,
        createdAt: entry.createdAt,
        actor: entry.actor || null,
        content: entry.content || '',
        field,
        departmentId
    };
}

function buildAuditDepartmentResponse(data, departmentId = '', user = null) {
    const department = getAccessibleDepartmentById(data, user, departmentId);
    if (!department) {
        return {
            departments: [],
            currentDepartmentId: '',
            department: null,
            doctors: [],
            modules: [],
            scheduleData: {},
            shiftTypes: [],
            notices: normalizeNotices(),
            uiSettings: normalizeUiSettings(),
            scheduleHistory: []
        };
    }

    return {
        departments: getDepartmentSummaries(data, user),
        currentDepartmentId: department.id,
        department: getDepartmentSummary(department),
        ...getSchedulablePayload(department),
        scheduleHistory: (department.scheduleHistory || []).map(entry => ({
            ...buildHistorySummary(entry, department.id),
            data: cloneJson(getSchedulablePayload(entry.data || {}))
        }))
    };
}

function replaceDepartment(data, nextDepartment) {
    return {
        ...data,
        departments: getDepartmentList(data).map(department => department.id === nextDepartment.id ? nextDepartment : department)
    };
}

function removeDepartmentFromAdmins(admins = [], departmentId = '') {
    let changed = false;
    const updatedAdmins = [];
    const nextAdmins = admins.map(admin => {
        if (admin.role !== ROLE_ADMIN) {
            return admin;
        }

        const currentDepartmentIds = normalizeDepartmentIds(admin.departmentIds);
        const nextDepartmentIds = currentDepartmentIds.filter(id => id !== departmentId);
        if (nextDepartmentIds.length === currentDepartmentIds.length) {
            return admin;
        }

        changed = true;
        const updatedAdmin = normalizeAdmin({
            ...admin,
            departmentIds: nextDepartmentIds
        });
        updatedAdmins.push(updatedAdmin);
        return updatedAdmin;
    });

    return { admins: nextAdmins, updatedAdmins, changed };
}

function resequenceDepartments(departments = []) {
    return departments.map((department, index) => ({
        ...department,
        order: index + 1
    }));
}

function reorderDepartmentsByIds(departments = [], orderedIds = []) {
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    const sorted = [...departments].sort((a, b) => {
        const aOrder = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bOrder = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.order - b.order;
    });
    return resequenceDepartments(sorted);
}

function createBlankDepartment(name, order) {
    const timestamp = new Date().toISOString();
    return normalizeDepartment({
        id: createDepartmentId(),
        name,
        order,
        createdAt: timestamp,
        updatedAt: timestamp,
        modules: cloneJson(DEFAULT_SCHEDULE_MODULES),
        doctors: [],
        shiftTypes: cloneJson(INITIAL_DEPARTMENT_SHIFT_TYPES),
        scheduleData: {},
        notices: normalizeNotices(),
        uiSettings: normalizeUiSettings(),
        scheduleHistory: []
    }, order - 1).department;
}

function cloneDepartmentForNewName(sourceDepartment, name, order, options = {}) {
    const timestamp = new Date().toISOString();
    const payload = {
        ...cloneJson(sourceDepartment),
        id: createDepartmentId(),
        name,
        order,
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        scheduleHistory: []
    };

    if (!options.copyDoctors) payload.doctors = [];
    if (!options.copySchedule) payload.scheduleData = {};
    if (!options.copyNotices) payload.notices = normalizeNotices();
    if (!options.copyModules) payload.modules = cloneJson(DEFAULT_SCHEDULE_MODULES);
    if (!options.copyShiftTypes) payload.shiftTypes = cloneJson(INITIAL_DEPARTMENT_SHIFT_TYPES);

    return normalizeDepartment(payload, order - 1).department;
}

function issueSession(user) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, buildSafeUser(user));
    return token;
}

function getTokenFromRequest(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    return req.headers['x-auth-token'] || '';
}

function requireAuth(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ message: '请先登录系统' });
    }
    req.authToken = token;
    req.user = sessions.get(token);
    next();
}

function requireRoles(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: '当前账号无权执行此操作' });
        }
        next();
    };
}

app.post('/api/auth/login', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const data = loadData();
    const admin = data.admins.find(item => item.username === username);

    if (!admin || admin.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ message: '账号或密码错误' });
    }

    const token = issueSession(admin);
    res.json({ token, user: buildSafeUser(admin) });
});

app.post('/api/auth/guest', (req, res) => {
    const guestUser = {
        id: 'guest-user',
        username: 'guest',
        role: ROLE_GUEST,
        displayName: '游客'
    };
    const token = issueSession(guestUser);
    res.json({ token, user: guestUser });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
    sessions.delete(req.authToken);
    res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

app.get('/api/health', (req, res) => {
    const data = loadData();
    const memoryUsage = process.memoryUsage();
    const departments = getDepartmentList(data);
    const doctorCount = departments.reduce((sum, department) => sum + (department.doctors?.length || 0), 0);
    const scheduledDayCount = departments.reduce((sum, department) => sum + Object.keys(department.scheduleData || {}).length, 0);
    const historyCount = departments.reduce((sum, department) => sum + (department.scheduleHistory?.length || 0), 0);
    const routeChecks = getCriticalRouteChecks();
    res.json({
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
        sessions: sessions.size,
        departments: departments.length,
        doctors: doctorCount,
        scheduledDays: scheduledDayCount,
        historyEntries: historyCount,
        build: SERVER_BUILD_INFO,
        instance: {
            name: INSTANCE_LABEL,
            dataDir: DATA_DIR,
            runtimeDir: RUNTIME_DIR
        },
        criticalRoutesOk: routeChecks.every(route => route.registered),
        routeChecks,
        memory: {
            rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
            heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        }
    });
});

app.get('/api/data', requireAuth, (req, res) => {
    const data = loadData();
    const departmentId = String(req.query?.departmentId || '').trim();
    res.json(buildDepartmentResponse(data, departmentId, req.user));
});

app.get('/api/audit/department', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), (req, res) => {
    const data = loadData();
    const departmentId = String(req.query?.departmentId || '').trim();
    res.json(buildAuditDepartmentResponse(data, departmentId, req.user));
});

app.post('/api/data', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), async (req, res) => {
    const currentData = loadData();
    const departmentId = String(req.body?.departmentId || '').trim();
    const currentDepartment = getAccessibleDepartmentById(currentData, req.user, departmentId);
    if (!currentDepartment) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(currentData, req.user) });
    }

    const currentPayload = getSchedulablePayload(currentDepartment);
    const nextDepartment = normalizeDepartment({
        ...currentDepartment,
        modules: req.body?.modules,
        doctors: req.body?.doctors,
        scheduleData: req.body?.scheduleData,
        shiftTypes: req.body?.shiftTypes,
        notices: req.body?.notices,
        uiSettings: req.user.role === ROLE_TERMINAL
            ? normalizeUiSettings(req.body?.uiSettings)
            : currentDepartment.uiSettings,
        updatedAt: new Date().toISOString()
    }).department;
    NOTICE_HISTORY_FIELDS.forEach(field => {
        if (currentDepartment.notices?.[field] !== nextDepartment.notices?.[field]) {
            nextDepartment.noticeHistory = appendNoticeHistoryEntry(
                nextDepartment,
                field,
                nextDepartment.notices?.[field],
                req.user,
                new Date().toISOString()
            );
        }
    });
    const nextPayload = getSchedulablePayload(nextDepartment);
    const skipAutoHistorySnapshot = req.body?.skipAutoHistorySnapshot === true;
    if (!skipAutoHistorySnapshot && JSON.stringify(currentPayload) !== JSON.stringify(nextPayload)) {
        nextDepartment.scheduleHistory = appendHistorySnapshot(
            currentDepartment,
            req.user,
            `数据更新前自动留存 - ${req.user.displayName}`
        );
    }
    const nextData = replaceDepartment(currentData, nextDepartment);
    await persistData(nextData);
    res.json({ success: true, departments: getDepartmentSummaries(nextData, req.user), currentDepartmentId: nextDepartment.id });
});

app.get('/api/history', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), (req, res) => {
    const data = loadData();
    const departmentId = String(req.query?.departmentId || '').trim();
    const department = getAccessibleDepartmentById(data, req.user, departmentId);
    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }
    res.json({
        history: ((department?.scheduleHistory) || []).map(entry => buildHistorySummary(entry, department?.id || '')),
        currentDepartmentId: department?.id || ''
    });
});

app.get('/api/notices/history', requireAuth, (req, res) => {
    const data = loadData();
    const departmentId = String(req.query?.departmentId || '').trim();
    const field = String(req.query?.field || '').trim();
    const department = getAccessibleDepartmentById(data, req.user, departmentId);

    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }
    if (!NOTICE_HISTORY_FIELDS.has(field)) {
        return res.status(400).json({ message: '公告历史类型无效' });
    }

    res.json({
        history: (department.noticeHistory?.[field] || []).map(entry => buildNoticeHistorySummary(entry, department.id, field)),
        currentDepartmentId: department.id,
        field
    });
});

app.post('/api/notices/history/import', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), async (req, res) => {
    const data = loadData();
    const departmentId = String(req.body?.departmentId || '').trim();
    const field = String(req.body?.field || '').trim();
    const historyEntries = Array.isArray(req.body?.history) ? req.body.history : [];
    const department = getAccessibleDepartmentById(data, req.user, departmentId);

    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }
    if (!NOTICE_HISTORY_FIELDS.has(field)) {
        return res.status(400).json({ message: '公告历史类型无效' });
    }

    const nextDepartment = normalizeDepartment({
        ...department,
        noticeHistory: mergeNoticeHistoryEntries(department, field, historyEntries, req.user),
        updatedAt: new Date().toISOString()
    }).department;
    const nextData = replaceDepartment(data, nextDepartment);
    await persistData(nextData);

    res.json({
        success: true,
        history: (nextDepartment.noticeHistory?.[field] || []).map(entry => buildNoticeHistorySummary(entry, nextDepartment.id, field)),
        currentDepartmentId: nextDepartment.id,
        field
    });
});

app.delete('/api/notices/history/:field/clear', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), async (req, res) => {
    const data = loadData();
    const departmentId = String(req.query?.departmentId || '').trim();
    const field = String(req.params?.field || '').trim();
    const department = getAccessibleDepartmentById(data, req.user, departmentId);

    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }
    if (!NOTICE_HISTORY_FIELDS.has(field)) {
        return res.status(400).json({ message: '公告历史类型无效' });
    }

    const nextDepartment = normalizeDepartment({
        ...department,
        noticeHistory: {
            ...normalizeNoticeHistoryMap(department.noticeHistory),
            [field]: []
        },
        updatedAt: new Date().toISOString()
    }).department;
    const nextData = replaceDepartment(data, nextDepartment);
    await persistData(nextData);

    res.json({
        success: true,
        history: [],
        currentDepartmentId: nextDepartment.id,
        field
    });
});

app.delete('/api/notices/history/:field/:id', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), async (req, res) => {
    const data = loadData();
    const departmentId = String(req.query?.departmentId || '').trim();
    const field = String(req.params?.field || '').trim();
    const historyId = String(req.params?.id || '').trim();
    const department = getAccessibleDepartmentById(data, req.user, departmentId);

    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }
    if (!NOTICE_HISTORY_FIELDS.has(field)) {
        return res.status(400).json({ message: '公告历史类型无效' });
    }

    const fieldHistory = Array.isArray(department.noticeHistory?.[field]) ? department.noticeHistory[field] : [];
    if (!fieldHistory.some(entry => entry.id === historyId)) {
        return res.status(404).json({ message: '未找到对应的公告历史记录' });
    }

    const nextDepartment = normalizeDepartment({
        ...department,
        noticeHistory: {
            ...normalizeNoticeHistoryMap(department.noticeHistory),
            [field]: fieldHistory.filter(entry => entry.id !== historyId)
        },
        updatedAt: new Date().toISOString()
    }).department;
    const nextData = replaceDepartment(data, nextDepartment);
    await persistData(nextData);

    res.json({
        success: true,
        history: (nextDepartment.noticeHistory?.[field] || []).map(entry => buildNoticeHistorySummary(entry, nextDepartment.id, field)),
        currentDepartmentId: nextDepartment.id,
        field
    });
});

app.post('/api/history/snapshot', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), async (req, res) => {
    const data = loadData();
    const departmentId = String(req.body?.departmentId || req.query?.departmentId || '').trim();
    const summary = String(req.body?.summary || '').trim() || `手动留存 - ${req.user.displayName}`;
    const department = getAccessibleDepartmentById(data, req.user, departmentId);

    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }

    const nextDepartment = normalizeDepartment({
        ...department,
        scheduleHistory: appendHistorySnapshot(department, req.user, summary),
        updatedAt: new Date().toISOString()
    }).department;
    const nextData = replaceDepartment(data, nextDepartment);
    await persistData(nextData);

    const latestEntry = (nextDepartment.scheduleHistory || [])[0] || null;
    res.json({
        success: true,
        historyEntry: latestEntry ? {
            ...buildHistorySummary(latestEntry, nextDepartment.id)
        } : null,
        history: (nextDepartment.scheduleHistory || []).map(entry => buildHistorySummary(entry, nextDepartment.id)),
        currentDepartmentId: nextDepartment.id
    });
});

app.post('/api/history/:id/restore', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), async (req, res) => {
    const historyId = req.params.id;
    const data = loadData();
    const departmentId = String(req.query?.departmentId || req.body?.departmentId || '').trim();
    const department = getAccessibleDepartmentById(data, req.user, departmentId);
    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }
    const targetHistory = (department?.scheduleHistory || []).find(entry => entry.id === historyId);

    if (!targetHistory) {
        return res.status(404).json({ message: '未找到对应的历史排班记录' });
    }

    const currentPayload = getSchedulablePayload(department);
    const restoredPayload = getSchedulablePayload(targetHistory.data);
    const nextDepartment = normalizeDepartment({
        ...department,
        ...cloneJson(restoredPayload),
        updatedAt: new Date().toISOString()
    }).department;
    nextDepartment.scheduleHistory = appendHistorySnapshot(
        { ...department, ...currentPayload },
        req.user,
        `恢复前自动留存 - ${req.user.displayName}`
    );
    const nextData = replaceDepartment(data, nextDepartment);
    await persistData(nextData);
    res.json({ success: true, currentDepartmentId: nextDepartment.id });
});

app.post('/api/departments', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const sourceDepartmentId = String(req.body?.sourceDepartmentId || '').trim();
    const options = {
        copyDoctors: req.body?.options?.copyDoctors !== false,
        copySchedule: !!req.body?.options?.copySchedule,
        copyNotices: req.body?.options?.copyNotices !== false,
        copyModules: req.body?.options?.copyModules !== false,
        copyShiftTypes: req.body?.options?.copyShiftTypes !== false
    };

    if (!name) {
        return res.status(400).json({ message: '请填写科室名称' });
    }

    const data = loadData();
    if (getDepartmentList(data).some(department => department.name === name)) {
        return res.status(400).json({ message: '该科室名称已存在' });
    }

    const order = getDepartmentList(data).length + 1;
    const sourceDepartment = sourceDepartmentId ? getDepartmentById(data, sourceDepartmentId) : null;
    const nextDepartment = sourceDepartment
        ? cloneDepartmentForNewName(sourceDepartment, name, order, options)
        : createBlankDepartment(name, order);

    const nextData = {
        ...data,
        departments: [...getDepartmentList(data), nextDepartment]
    };
    await persistData(nextData);
    res.json({
        success: true,
        department: getDepartmentSummary(nextDepartment),
        departments: getDepartmentSummaries(nextData),
        currentDepartmentId: nextDepartment.id
    });
});

app.patch('/api/departments/:id/archive', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const departmentId = String(req.params.id || '').trim();
    const data = loadData();
    const departments = getDepartmentList(data);
    const targetDepartment = departments.find(department => department.id === departmentId);

    if (!targetDepartment) {
        return res.status(404).json({ message: '科室不存在' });
    }

    if (departments.filter(d => !d.archived).length <= 1 && !targetDepartment.archived) {
        return res.status(400).json({ message: '系统至少需要保留一个处于启用状态的科室' });
    }

    const nextDepartment = normalizeDepartment({
        ...targetDepartment,
        archived: true,
        updatedAt: new Date().toISOString()
    }).department;
    const nextData = replaceDepartment(data, nextDepartment);
    await persistData(nextData);
    res.json({
        success: true,
        department: getDepartmentSummary(nextDepartment),
        departments: getDepartmentSummaries(nextData)
    });
});

app.patch('/api/departments/:id/unarchive', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const departmentId = String(req.params.id || '').trim();
    const data = loadData();
    const targetDepartment = getDepartmentList(data).find(department => department.id === departmentId);

    if (!targetDepartment) {
        return res.status(404).json({ message: '科室不存在' });
    }

    const nextDepartment = normalizeDepartment({
        ...targetDepartment,
        archived: false,
        updatedAt: new Date().toISOString()
    }).department;
    const nextData = replaceDepartment(data, nextDepartment);
    await persistData(nextData);
    res.json({
        success: true,
        department: getDepartmentSummary(nextDepartment),
        departments: getDepartmentSummaries(nextData)
    });
});

app.patch('/api/departments/:id', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const departmentId = String(req.params.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const data = loadData();
    const departments = getDepartmentList(data);
    const targetDepartment = departments.find(department => department.id === departmentId);

    if (!targetDepartment) {
        return res.status(404).json({ message: '科室不存在' });
    }
    if (!name) {
        return res.status(400).json({ message: '请填写科室名称' });
    }
    if (departments.some(department => department.id !== departmentId && department.name === name)) {
        return res.status(400).json({ message: '该科室名称已存在' });
    }

    const nextDepartment = normalizeDepartment({
        ...targetDepartment,
        name,
        updatedAt: new Date().toISOString()
    }).department;
    const nextData = replaceDepartment(data, nextDepartment);
    await persistData(nextData);
    res.json({
        success: true,
        department: getDepartmentSummary(nextDepartment),
        departments: getDepartmentSummaries(nextData),
        currentDepartmentId: nextDepartment.id
    });
});

app.post('/api/departments/reorder', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds)
        ? req.body.orderedIds.map(id => String(id || '').trim()).filter(Boolean)
        : [];
    const currentDepartmentId = String(req.body?.currentDepartmentId || '').trim();
    const data = loadData();
    const departments = getDepartmentList(data);

    if (orderedIds.length !== departments.length) {
        return res.status(400).json({ message: '科室排序参数不完整' });
    }

    const departmentIds = new Set(departments.map(department => department.id));
    if (orderedIds.some(id => !departmentIds.has(id)) || new Set(orderedIds).size !== departments.length) {
        return res.status(400).json({ message: '科室排序参数无效' });
    }

    const reorderedDepartments = reorderDepartmentsByIds(departments, orderedIds);
    const nextData = {
        ...data,
        departments: reorderedDepartments
    };
    await persistData(nextData);
    const fallbackDepartment = reorderedDepartments.find(department => department.id === currentDepartmentId) || reorderedDepartments[0];
    res.json({
        success: true,
        departments: getDepartmentSummaries(nextData),
        currentDepartmentId: fallbackDepartment?.id || ''
    });
});

app.delete('/api/departments/:id', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const departmentId = String(req.params.id || '').trim();
    const currentDepartmentId = String(req.query.departmentId || '').trim();
    const data = loadData();
    const departments = getDepartmentList(data);
    const targetDepartment = departments.find(department => department.id === departmentId);

    if (!targetDepartment) {
        return res.status(404).json({ message: '科室不存在' });
    }

    if (departments.length <= 1) {
        return res.status(400).json({ message: '系统至少需要保留一个科室' });
    }

    const remainingDepartments = resequenceDepartments(
        departments.filter(department => department.id !== departmentId)
    );
    const fallbackDepartment = remainingDepartments.find(department => department.id === currentDepartmentId) || remainingDepartments[0];
    const adminCleanup = removeDepartmentFromAdmins(data.admins, departmentId);
    const nextData = {
        ...data,
        departments: remainingDepartments,
        admins: adminCleanup.admins
    };

    await persistData(nextData);
    adminCleanup.updatedAdmins.forEach(syncSessionUsersByAdmin);
    res.json({
        success: true,
        departments: getDepartmentSummaries(nextData),
        currentDepartmentId: fallbackDepartment?.id || ''
    });
});

app.get('/api/admins', requireAuth, requireRoles([ROLE_TERMINAL]), (req, res) => {
    const data = loadData();
    res.json({
        admins: data.admins
            .map(buildSafeUser)
            .sort((a, b) => {
                if (a.role !== b.role) return a.role === ROLE_TERMINAL ? -1 : 1;
                return a.username.localeCompare(b.username, 'zh-CN');
            })
    });
});

function syncSessionUsersByAdmin(nextAdmin) {
    const safeUser = buildSafeUser(nextAdmin);
    sessions.forEach((user, token) => {
        if (user.id === nextAdmin.id) {
            sessions.set(token, safeUser);
        }
    });
}

function revokeSessionsByUserId(userId) {
    sessions.forEach((user, token) => {
        if (user.id === userId) {
            sessions.delete(token);
        }
    });
}

app.post('/api/admins', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    const role = req.body?.role === ROLE_TERMINAL ? ROLE_TERMINAL : ROLE_ADMIN;
    const displayName = String(req.body?.displayName || '').trim() || (role === ROLE_TERMINAL ? '终端管理员' : '普通管理员');
    const departmentIds = normalizeDepartmentIds(req.body?.departmentIds);

    if (!username || !password) {
        return res.status(400).json({ message: '请完整填写账号和密码' });
    }

    const data = loadData();
    const knownDepartmentIds = new Set(getDepartmentList(data).map(department => department.id));
    if (departmentIds.some(id => !knownDepartmentIds.has(id))) {
        return res.status(400).json({ message: '管理员授权科室无效，请刷新后重试' });
    }
    if (role === ROLE_ADMIN && departmentIds.length === 0) {
        return res.status(400).json({ message: '普通管理员至少需要分配一个科室' });
    }
    if (data.admins.some(admin => admin.username === username)) {
        return res.status(400).json({ message: '该管理员账号已存在' });
    }

    const newAdmin = {
        id: `admin-${Date.now()}`,
        username,
        passwordHash: hashPassword(password),
        role,
        displayName,
        departmentIds: role === ROLE_ADMIN ? departmentIds : []
    };

    data.admins.push(newAdmin);
    await persistData(data);
    res.json({ success: true, admin: buildSafeUser(newAdmin) });
});

app.patch('/api/admins/:id', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const adminId = String(req.params.id || '').trim();
    const data = loadData();
    const targetAdmin = data.admins.find(admin => admin.id === adminId);

    if (!targetAdmin) {
        return res.status(404).json({ message: '管理员账号不存在' });
    }

    const nextRole = req.body?.role === ROLE_TERMINAL ? ROLE_TERMINAL : ROLE_ADMIN;
    const nextPassword = String(req.body?.password || '').trim();
    const nextDisplayName = String(req.body?.displayName || '').trim()
        || (nextRole === ROLE_TERMINAL ? '终端管理员' : '普通管理员');
    const nextDepartmentIds = normalizeDepartmentIds(req.body?.departmentIds);
    const knownDepartmentIds = new Set(getDepartmentList(data).map(department => department.id));

    if (nextDepartmentIds.some(id => !knownDepartmentIds.has(id))) {
        return res.status(400).json({ message: '管理员授权科室无效，请刷新后重试' });
    }
    if (nextRole === ROLE_ADMIN && nextDepartmentIds.length === 0) {
        return res.status(400).json({ message: '普通管理员至少需要分配一个科室' });
    }
    if (targetAdmin.username === defaultTerminalAdmin.username && nextRole !== ROLE_TERMINAL) {
        return res.status(400).json({ message: '预设终端管理员账号不能降级为普通管理员' });
    }

    const terminalCount = data.admins.filter(admin => admin.role === ROLE_TERMINAL).length;
    if (targetAdmin.role === ROLE_TERMINAL && nextRole !== ROLE_TERMINAL && terminalCount <= 1) {
        return res.status(400).json({ message: '系统至少需要保留一个终端管理员账号' });
    }

    const updatedAdmin = normalizeAdmin({
        ...targetAdmin,
        passwordHash: nextPassword ? hashPassword(nextPassword) : targetAdmin.passwordHash,
        role: nextRole,
        displayName: nextDisplayName,
        departmentIds: nextRole === ROLE_ADMIN ? nextDepartmentIds : []
    });

    data.admins = data.admins.map(admin => admin.id === adminId ? updatedAdmin : admin);
    await persistData(data);
    syncSessionUsersByAdmin(updatedAdmin);
    res.json({ success: true, admin: buildSafeUser(updatedAdmin) });
});

app.delete('/api/admins/:id', requireAuth, requireRoles([ROLE_TERMINAL]), async (req, res) => {
    const adminId = req.params.id;
    const data = loadData();
    const targetAdmin = data.admins.find(admin => admin.id === adminId);

    if (!targetAdmin) {
        return res.status(404).json({ message: '管理员账号不存在' });
    }

    if (targetAdmin.id === req.user.id) {
        return res.status(400).json({ message: '不能删除当前登录的管理员账号' });
    }

    if (targetAdmin.username === defaultTerminalAdmin.username) {
        return res.status(400).json({ message: '不能删除预设终端管理员账号' });
    }

    if (targetAdmin.role === ROLE_TERMINAL) {
        const terminalCount = data.admins.filter(admin => admin.role === ROLE_TERMINAL).length;
        if (terminalCount <= 1) {
            return res.status(400).json({ message: '系统至少需要保留一个终端管理员账号' });
        }
    }

    data.admins = data.admins.filter(admin => admin.id !== adminId);
    await persistData(data);
    revokeSessionsByUserId(adminId);
    res.json({ success: true });
});

app.delete('/api/history/:id', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), async (req, res) => {
    const historyId = String(req.params.id || '').trim();
    const departmentId = String(req.query.departmentId || '').trim();
    const data = loadData();
    const department = getAccessibleDepartmentById(data, req.user, departmentId);

    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }

    const history = Array.isArray(department.scheduleHistory) ? department.scheduleHistory : [];
    const targetHistory = history.find(entry => entry.id === historyId);
    if (!targetHistory) {
        return res.status(404).json({ message: '未找到对应的历史排班记录' });
    }

    const nextDepartment = normalizeDepartment({
        ...department,
        scheduleHistory: history.filter(entry => entry.id !== historyId),
        updatedAt: new Date().toISOString()
    }).department;
    const nextData = replaceDepartment(data, nextDepartment);

    await persistData(nextData);
    res.json({
        success: true,
        history: (nextDepartment.scheduleHistory || []).map(entry => buildHistorySummary(entry, nextDepartment.id))
    });
});

// Draft APIs
function loadDrafts() {
    if (!fs.existsSync(DRAFT_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(DRAFT_FILE, 'utf-8'));
    } catch (e) {
        return {};
    }
}

function saveDrafts(drafts) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DRAFT_FILE, JSON.stringify(drafts, null, 2));
}

app.post('/api/notices/draft', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), (req, res) => {
    const { departmentId, field, content } = req.body;
    if (!departmentId || !field) return res.status(400).json({ message: 'Missing parameters' });
    if (!NOTICE_HISTORY_FIELDS.has(field)) {
        return res.status(400).json({ message: 'Invalid draft field' });
    }

    const data = loadData();
    const department = getAccessibleDepartmentById(data, req.user, String(departmentId).trim());
    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }

    const drafts = loadDrafts();
    const key = `${department.id}_${field}`;
    drafts[key] = {
        content,
        timestamp: new Date().toISOString(),
        userId: req.user.id
    };
    saveDrafts(drafts);
    res.json({ success: true });
});

app.get('/api/notices/draft', requireAuth, requireRoles([ROLE_TERMINAL, ROLE_ADMIN]), (req, res) => {
    const { departmentId, field } = req.query;
    if (!departmentId || !field) return res.status(400).json({ message: 'Missing parameters' });

    if (!NOTICE_HISTORY_FIELDS.has(field)) {
        return res.status(400).json({ message: 'Invalid draft field' });
    }

    const data = loadData();
    const department = getAccessibleDepartmentById(data, req.user, String(departmentId).trim());
    if (!department) {
        return res.status(403).json({ message: getDepartmentAccessErrorMessage(data, req.user) });
    }

    const drafts = loadDrafts();
    const key = `${department.id}_${field}`;
    const draft = drafts[key];
    
    if (!draft) return res.status(404).json({ message: 'No draft found' });
    res.json(draft);
});

function writePortFile(port) {
    try {
        fs.mkdirSync(RUNTIME_DIR, { recursive: true });
        fs.writeFileSync(PORT_FILE, String(port), 'utf-8');
    } catch (error) {
        console.warn('写入端口文件失败:', error.message);
    }
}

function removePortFile() {
    try {
        if (fs.existsSync(PORT_FILE)) {
            fs.unlinkSync(PORT_FILE);
        }
    } catch (error) {
        console.warn('清理端口文件失败:', error.message);
    }
}

function writePidFile() {
    try {
        fs.mkdirSync(RUNTIME_DIR, { recursive: true });
        fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
    } catch (error) {
        console.warn('写入进程文件失败:', error.message);
    }
}

function removePidFile() {
    try {
        if (fs.existsSync(PID_FILE)) {
            fs.unlinkSync(PID_FILE);
        }
    } catch (error) {
        console.warn('清理进程文件失败:', error.message);
    }
}

function startServer(preferredPort) {
    const server = http.createServer(app);

    server.on('error', error => {
        if (error.code === 'EADDRINUSE') {
            const nextPort = Number(preferredPort) + 1;
            console.warn(`端口 ${preferredPort} 已被占用，尝试使用 ${nextPort}...`);
            startServer(nextPort);
            return;
        }

        console.error('服务器启动失败:', error);
        process.exit(1);
    });

    server.listen(preferredPort, '0.0.0.0', () => {
        const activePort = server.address().port;
        const routeChecks = getCriticalRouteChecks();
        const routeCheckSummary = formatRouteChecks(routeChecks);
        writePidFile();
        writePortFile(activePort);
        
        const logMsg = `[${new Date().toISOString()}] [INFO] Server started successfully.\n` +
                       `  Build: ${SERVER_BUILD_INFO.label}\n` +
                       `  Modified At: ${SERVER_BUILD_INFO.modifiedAt}\n` +
                       `  Route Checks: ${routeCheckSummary}\n` +
                       `  Resource Root: ${PUBLIC_DIR}\n` +
                       `  Local Access: http://localhost:${activePort}\n` +
                       `  LAN Access: http://${localIP}:${activePort}\n`;
        fs.mkdirSync(RUNTIME_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, logMsg, 'utf-8');

        console.log('=========================================');
        console.log('  临床医生智能排班系统 (局域网版)');
        console.log('=========================================');
        console.log(`  服务版本: ${SERVER_BUILD_INFO.label}`);
        console.log(`  文件时间: ${SERVER_BUILD_INFO.modifiedAt}`);
        console.log(`  路由自检: ${routeCheckSummary}`);
        console.log(`  本地访问: http://localhost:${activePort}`);
        console.log(`  局域网访问: http://${localIP}:${activePort}`);
        console.log('=========================================');
        const missingRoutes = routeChecks.filter(route => !route.registered);
        if (missingRoutes.length) {
            console.warn(`关键路由缺失，请确认是否启动了最新进程: ${missingRoutes.map(route => `${route.method} ${route.path}`).join(', ')}`);
        }
    });

    const cleanup = () => {
        if (process.env.IGNORE_SIGINT === '1') {
            console.log('Received signal, but IGNORE_SIGINT is set. Staying alive.');
            return;
        }
        removePortFile();
        removePidFile();
        server.close(() => process.exit(0));
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

removePortFile();
removePidFile();
startServer(DEFAULT_PORT);
