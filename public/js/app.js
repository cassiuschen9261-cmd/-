const { createApp, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } = Vue;

const app = createApp({
    setup() {
        // --- State ---
        const doctors = ref([]);
        const scheduleData = ref({});
        const shiftTypes = ref([]);
        const DEFAULT_WEEKDAY_NOTES = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 0: '' };
        const notices = ref({
            teaching: '',
            special: '',
            teachingClinicWeekdays: { ...DEFAULT_WEEKDAY_NOTES },
            teachingClinicMembers: []
        });
        
        const API_URL = '/api/data';
        const API_BASE = '/api';
        const AUTH_TOKEN_KEY = 'paiban_auth_token';
        const ACTIVE_DEPARTMENT_KEY = 'paiban_active_department_id';
        const ROLE_TERMINAL = 'terminal';
        const ROLE_ADMIN = 'admin';
        const ROLE_GUEST = 'guest';
        const isInitializing = ref(true);
        const isHydratingData = ref(false);
        const showClearMenu = ref(false);
        const authToken = ref(localStorage.getItem(AUTH_TOKEN_KEY) || '');
        const departments = ref([]);
        const currentDepartmentId = ref(localStorage.getItem(ACTIVE_DEPARTMENT_KEY) || '');
        const showDepartmentManager = ref(false);
        const departmentDraftNames = ref({});
        const newDepartmentName = ref('');
        const duplicateDepartmentName = ref('');
        const departmentSearchQuery = ref('');
        const showDepartmentCopyOptions = ref(false);
        const departmentCopyOptions = ref({
            copyDoctors: true,
            copySchedule: false,
            copyNotices: true,
            copyModules: true,
            copyShiftTypes: true
        });
        const isSubmittingDepartment = ref(false);
        const showNewModuleForm = ref(false);
        const moduleManagerSelectedModuleId = ref('all');
        const expandedModuleRules = ref(new Set());

        function toggleModuleRules(moduleId) {
            if (expandedModuleRules.value.has(moduleId)) {
                expandedModuleRules.value.delete(moduleId);
            } else {
                expandedModuleRules.value.add(moduleId);
            }
        }
        const currentUser = ref(null);
        const authReady = ref(false);
        const showLoginPanel = ref(false);
        const loginForm = ref({ username: '', password: '' });
        const showLoginPassword = ref(false);
        const isSubmittingLogin = ref(false);
        const showDisplaySettings = ref(false);
        const showAdminManager = ref(false);
        const showNoticeHistory = ref(false);
        const noticeHistoryField = ref('teaching');
        const noticeHistoryList = ref([]);
        const noticeHistorySearchQuery = ref('');
        const isLoadingNoticeHistory = ref(false);
        const selectedNoticeHistoryRecord = ref(null);
        const noticeUpdatedAt = ref({
            teaching: null,
            special: null
        });
        const adminAccounts = ref([]);
        const editingAdminId = ref('');
        function createEmptyAdminForm() {
            return {
                username: '',
                password: '',
                role: ROLE_ADMIN,
                displayName: '',
                departmentIds: []
            };
        }
        const newAdmin = ref(createEmptyAdminForm());
        const showHistoryManager = ref(false);
        const historyRecords = ref([]);
        const isLoadingHistory = ref(false);
        const recentClearAction = ref(null);
        const DEFAULT_HOLIDAY_DATES_2026 = [
            '2026-01-01', '2026-01-02', '2026-01-03',
            '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
            '2026-04-04', '2026-04-05', '2026-04-06',
            '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
            '2026-06-19', '2026-06-20', '2026-06-21',
            '2026-09-25', '2026-09-26', '2026-09-27',
            '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'
        ];
        const holidays = ref([...DEFAULT_HOLIDAY_DATES_2026]);
        const holidayDateSet = computed(() => new Set(holidays.value));
        const lockedMonths = ref([]);
        const scheduleTemplates = ref([]);
        const showHolidayManager = ref(false);
        const showTemplateManager = ref(false);
        const showStatsModal = ref(false);
        const newHolidayDate = ref('');
        const newTemplateName = ref('');
        const BLANK_SHIFT_ID = 'sh_blank';
        const BLANK_SHIFT_DEFINITION = {
            id: BLANK_SHIFT_ID,
            name: '空白班',
            short: '',
            color: 'blank',
            categories: ['first', 'trainee', 'second', 'third'],
            systemKey: 'blank_fill'
        };
        const DEFAULT_UI_SETTINGS = {
            scheduleFontSize: 13,
            sidebarWidth: 620
        };
        const FIXED_SIDEBAR_ROW_ORDER = {
            duty: 10,
            follow: 20,
            assistant: 30,
            day: 40,
            clinic: 50,
            other: 999
        };
        const DEFAULT_SIDEBAR_MODE = 'default';
        const DEFAULT_CUSTOM_SIDEBAR_MODE = 'module_all_valid';
        const SIDEBAR_MODE_OPTIONS = [
            { value: 'default', label: '沿用系统默认规则' },
            { value: 'module_all_valid', label: '单独成行，提取全部有效班次' },
            { value: 'module_duty_only', label: '单独成行，仅提取值班类班次' },
            { value: 'module_clinic_only', label: '单独成行，仅提取门诊类班次' },
            { value: 'module_keyword', label: '单独成行，按关键字匹配' },
            { value: 'module_shift_whitelist', label: '单独成行，按指定班次匹配' },
            { value: 'hidden', label: '不在右侧展示' }
        ];
        const SIDEBAR_ACCENT_OPTIONS = [
            { value: '', label: '默认样式' },
            { value: '#2563eb', label: '蓝色高亮' },
            { value: '#059669', label: '绿色高亮' },
            { value: '#d97706', label: '橙色高亮' },
            { value: '#dc2626', label: '红色高亮' },
            { value: '#7c3aed', label: '紫色高亮' },
            { value: '#db2777', label: '粉色高亮' },
            { value: '#0f766e', label: '青色高亮' }
        ];
        const SIDEBAR_GROUP_MODE_OPTIONS = [
            { value: 'merge_by_shift', label: '按班次合并显示' },
            { value: 'split_by_doctor', label: '按医生拆分显示' }
        ];
        const SIDEBAR_PHONE_MODE_OPTIONS = [
            { value: 'separate_line', label: '电话单独成一行' },
            { value: 'inline_after_name', label: '电话跟在姓名后' },
            { value: 'badge_after_name', label: '电话弱化标记' }
        ];
        const SIDEBAR_TITLE_MODE_OPTIONS = [
            { value: 'inline', label: '姓名后括号显示' },
            { value: 'badge', label: '姓名前标记显示' }
        ];
        const SIDEBAR_DENSITY_OPTIONS = [
            { value: 'standard', label: '标准密度' },
            { value: 'compact', label: '紧凑密度' }
        ];
        const SIDEBAR_COUNT_MODE_OPTIONS = [
            { value: 'hidden', label: '不显示人数标记' },
            { value: 'multi_only', label: '仅多人时显示' },
            { value: 'always', label: '始终显示人数' }
        ];
        const DEFAULT_SCHEDULE_MODULES = [
            { id: 'first', doctorLabel: '一线医生', groupName: '一线班', clearLabel: '清空一线班排班', order: 1, enabled: true, allowFixedWeekdays: false, allowMultiAssign: true, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 10, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] },
            { id: 'second', doctorLabel: '二线医生', groupName: '二线班', clearLabel: '清空二线班排班', order: 2, enabled: true, allowFixedWeekdays: true, allowMultiAssign: true, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 20, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] },
            { id: 'third', doctorLabel: '三线医生', groupName: '三线班', clearLabel: '清空三线班排班', order: 3, enabled: true, allowFixedWeekdays: true, allowMultiAssign: true, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 30, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] },
            { id: 'trainee', doctorLabel: '轮转/规培/进修', groupName: '轮转/规培/进修班', clearLabel: '清空轮转班排班', order: 4, enabled: true, allowFixedWeekdays: false, allowMultiAssign: false, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 40, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] },
            { id: 'teaching_clinic', doctorLabel: '教学门诊安排', groupName: '教学门诊安排', clearLabel: '清空教学门诊安排', order: 5, enabled: true, allowFixedWeekdays: true, allowMultiAssign: true, sidebarMode: 'default', sidebarLabel: '', sidebarOrder: 50, sidebarShowLabel: true, sidebarShowPhone: false, sidebarPhoneMode: 'separate_line', sidebarShowTitle: false, sidebarTitleMode: 'inline', sidebarShowShiftName: true, sidebarGroupMode: 'merge_by_shift', sidebarDensity: 'standard', sidebarShowIfEmpty: false, sidebarCountMode: 'hidden', sidebarAccentColor: '', sidebarKeywordsText: '', sidebarShiftIds: [] }
        ];
        const DEFAULT_MODULE_ID_SET = new Set(DEFAULT_SCHEDULE_MODULES.map(module => module.id));
        const COMMON_DOCTOR_TITLES = [
            '主任医师',
            '副主任医师',
            '主治医师',
            '住院医师',
            '护士长',
            '主管护师',
            '护师',
            '护士',
            '规培生',
            '进修生',
            '轮转医生',
            '实习生',
            '未填写'
        ];
        const SAVE_DEBOUNCE_MS = 1500;
        const TEACHING_CLINIC_ENABLED_SHIFT_KEYS = new Set(['morning', 'afternoon', 'fullday', 'teaching', 'general_secondary', 'outside']);
        const LEGACY_SHIFT_CATEGORY_MAP = {
            morning: ['second', 'third'],
            afternoon: ['second', 'third'],
            fullday: ['second', 'third'],
            teaching: ['second', 'third'],
            general_secondary: ['second', 'third'],
            outside: ['third']
        };
        const uiSettings = ref({ ...DEFAULT_UI_SETTINGS });
        const modules = ref([]);

        function createDefaultNewModuleState() {
            return {
                doctorLabel: '',
                groupName: '',
                clearLabel: '',
                allowFixedWeekdays: false,
                allowMultiAssign: true,
                enabled: true,
                sidebarMode: DEFAULT_CUSTOM_SIDEBAR_MODE,
                sidebarLabel: '',
                sidebarOrder: 60,
                sidebarShowLabel: true,
                sidebarShowPhone: false,
                sidebarPhoneMode: 'separate_line',
                // 新建模块默认显示医生职称，减少创建后逐项补配的成本。
                sidebarShowTitle: true,
                sidebarTitleMode: 'inline',
                sidebarShowShiftName: true,
                sidebarGroupMode: 'merge_by_shift',
                sidebarDensity: 'standard',
                sidebarShowIfEmpty: false,
                sidebarCountMode: 'hidden',
                sidebarAccentColor: '',
                sidebarKeywordsText: '',
                sidebarShiftIds: []
            };
        }

        const newModule = ref(createDefaultNewModuleState());
        const isSavingData = ref(false);
        let lastSavedFingerprint = '';
        let saveInFlightPromise = null;
        let preserveRecentClearActionOnSave = false;

        // --- Quill Editors ---
        let teachingEditor = null;
        let specialEditor = null;
        const DRAFT_KEY_PREFIX = 'paiban_draft_';
        const NOTICE_HISTORY_KEY_PREFIX = 'paiban_notice_history_';
        const NOTICE_FIELDS = ['teaching', 'special'];
        const migratedNoticeHistoryKeys = new Set();
        const noticeEditorStyles = ref({
            teaching: createDefaultNoticeEditorStyle('teaching'),
            special: createDefaultNoticeEditorStyle('special')
        });
        const noticeMutationObservers = new Map();
        const noticeHeightFrameMap = new Map();

        function createDefaultNoticeEditorStyle(field = 'special') {
            if (field === 'teaching') {
                return {
                    '--notice-editor-height': '170px',
                    '--notice-editor-min-height': '170px',
                    '--notice-editor-max-height': '360px',
                    '--notice-editor-overflow': 'hidden'
                };
            }
            return {
                '--notice-editor-height': '280px',
                '--notice-editor-min-height': '220px',
                '--notice-editor-max-height': '420px',
                '--notice-editor-overflow': 'hidden'
            };
        }

        function debounce(fn, wait = 300) {
            let timer = null;
            return (...args) => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    fn(...args);
                }, wait);
            };
        }

        function initQuillEditors() {
            if (typeof Quill === 'undefined') {
                console.warn('Quill is not defined, skipping editor initialization');
                return;
            }
            const commonConfig = {
                theme: 'snow',
                modules: {
                    toolbar: {
                        container: '#placeholder' // dynamic
                    }
                },
                placeholder: '开始输入内容...'
            };

            teachingEditor = new Quill('#teaching-editor', {
                ...commonConfig,
                modules: { toolbar: '#teaching-toolbar' }
            });
            specialEditor = new Quill('#special-editor', {
                ...commonConfig,
                modules: { toolbar: '#special-toolbar' }
            });

            // Listen for changes
            teachingEditor.on('text-change', () => {
                const html = teachingEditor.root.innerHTML;
                if (notices.value.teaching !== html) {
                    notices.value.teaching = html;
                    setNoticeUpdatedAt('teaching', new Date());
                    saveDraft('teaching', html);
                }
                scheduleNoticeHeightRefresh();
            });
            specialEditor.on('text-change', () => {
                const html = specialEditor.root.innerHTML;
                if (notices.value.special !== html) {
                    notices.value.special = html;
                    setNoticeUpdatedAt('special', new Date());
                    saveDraft('special', html);
                }
                scheduleNoticeHeightRefresh();
            });
            
            setupNoticeAutoHeightObservers();
            // Initial sync
            syncNoticesToEditors();
        }

        function syncNoticesToEditors() {
            if (teachingEditor && notices.value.teaching !== teachingEditor.root.innerHTML) {
                teachingEditor.root.innerHTML = notices.value.teaching || '';
            }
            if (specialEditor && notices.value.special !== specialEditor.root.innerHTML) {
                specialEditor.root.innerHTML = notices.value.special || '';
            }
            scheduleNoticeHeightRefresh();
        }

        function getNoticeResponsiveMetrics() {
            const viewportWidth = window.innerWidth || 1440;
            const viewportHeight = window.innerHeight || 900;
            if (viewportWidth <= 768) {
                return { minHeight: 160, maxViewportRatio: 0.34, bottomGap: 16, viewportHeight };
            }
            if (viewportWidth <= 1024) {
                return { minHeight: 190, maxViewportRatio: 0.38, bottomGap: 20, viewportHeight };
            }
            return { minHeight: 220, maxViewportRatio: 0.42, bottomGap: 24, viewportHeight };
        }

        function getNoticeEditorElements(field) {
            const container = document.getElementById(`${field}-editor`);
            if (!container) return null;
            return {
                container,
                panel: container.closest('.notice-panel'),
                editor: container.querySelector('.ql-editor')
            };
        }

        function updateNoticeEditorStyle(field, style) {
            noticeEditorStyles.value = {
                ...noticeEditorStyles.value,
                [field]: style
            };
        }

        function getNoticeFieldMetrics(field, baseMetrics) {
            if (field !== 'teaching') return baseMetrics;
            return {
                ...baseMetrics,
                minHeight: Math.max(150, baseMetrics.minHeight - 50),
                preferredHeight: Math.max(170, baseMetrics.minHeight - 50),
                maxViewportRatio: Math.max(0.28, baseMetrics.maxViewportRatio - 0.05)
            };
        }

        function measureNoticeEditorHeight(field) {
            const elements = getNoticeEditorElements(field);
            if (!elements?.container) return;

            const metrics = getNoticeFieldMetrics(field, getNoticeResponsiveMetrics());
            const contentHeight = Math.ceil(
                elements.editor?.scrollHeight
                || elements.container.scrollHeight
                || metrics.minHeight
            );
            let maxHeight = Math.floor(metrics.viewportHeight * metrics.maxViewportRatio);

            if (elements.panel) {
                const panelRect = elements.panel.getBoundingClientRect();
                const panelChromeHeight = Math.max(elements.panel.offsetHeight - elements.container.offsetHeight, 0);
                const availableHeight = Math.floor(
                    metrics.viewportHeight - panelRect.top - metrics.bottomGap - panelChromeHeight
                );
                maxHeight = Math.min(maxHeight, availableHeight);
            }

            const preferredHeight = Math.max(metrics.minHeight, metrics.preferredHeight || metrics.minHeight);
            maxHeight = Math.max(preferredHeight, maxHeight);
            const targetHeight = Math.min(Math.max(contentHeight, preferredHeight), maxHeight);

            updateNoticeEditorStyle(field, {
                '--notice-editor-height': `${targetHeight}px`,
                '--notice-editor-min-height': `${metrics.minHeight}px`,
                '--notice-editor-max-height': `${maxHeight}px`,
                '--notice-editor-overflow': contentHeight > maxHeight ? 'auto' : 'hidden'
            });
        }

        function requestNoticeHeightRefresh(field = 'all') {
            if (field === 'all') {
                NOTICE_FIELDS.forEach(singleField => requestNoticeHeightRefresh(singleField));
                return;
            }

            const pendingFrame = noticeHeightFrameMap.get(field);
            if (pendingFrame) {
                cancelAnimationFrame(pendingFrame);
            }

            const frameId = requestAnimationFrame(() => {
                noticeHeightFrameMap.delete(field);
                measureNoticeEditorHeight(field);
            });
            noticeHeightFrameMap.set(field, frameId);
        }

        function scheduleNoticeHeightRefresh(field = 'all') {
            nextTick(() => {
                requestNoticeHeightRefresh(field);
            });
        }

        function handleNoticeViewportResize() {
            scheduleNoticeHeightRefresh();
        }

        function observeNoticeEditor(field, editorInstance) {
            if (typeof MutationObserver === 'undefined' || !editorInstance?.root || noticeMutationObservers.has(field)) {
                return;
            }
            const observer = new MutationObserver(() => {
                scheduleNoticeHeightRefresh();
            });
            observer.observe(editorInstance.root, {
                childList: true,
                subtree: true,
                characterData: true
            });
            noticeMutationObservers.set(field, observer);
        }

        function cleanupNoticeAutoHeightObservers() {
            window.removeEventListener('resize', handleNoticeViewportResize);
            noticeMutationObservers.forEach(observer => observer.disconnect());
            noticeMutationObservers.clear();
            noticeHeightFrameMap.forEach(frameId => cancelAnimationFrame(frameId));
            noticeHeightFrameMap.clear();
        }

        function setupNoticeAutoHeightObservers() {
            cleanupNoticeAutoHeightObservers();
            window.addEventListener('resize', handleNoticeViewportResize);
            observeNoticeEditor('teaching', teachingEditor);
            observeNoticeEditor('special', specialEditor);
            scheduleNoticeHeightRefresh();
        }

        function getNoticeEditorStyle(field) {
            return noticeEditorStyles.value[field] || createDefaultNoticeEditorStyle(field);
        }

        // --- Draft & History Logic ---
        function parseNoticeTimestamp(value) {
            if (!value) return null;
            const date = value instanceof Date ? value : new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        function normalizeNoticeTimestamp(value) {
            const date = parseNoticeTimestamp(value);
            return date ? date.toISOString() : null;
        }

        function setNoticeUpdatedAt(field, value = new Date()) {
            const timestamp = normalizeNoticeTimestamp(value);
            noticeUpdatedAt.value = {
                ...noticeUpdatedAt.value,
                [field]: timestamp
            };
        }

        function getLocalNoticeDraft(field) {
            const raw = localStorage.getItem(DRAFT_KEY_PREFIX + field);
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (error) {
                console.warn('Failed to parse notice draft:', error);
                return null;
            }
        }

        function getDraftTimestampValue(draft) {
            return normalizeNoticeTimestamp(draft?.timestampIso || draft?.timestamp);
        }

        function hydrateNoticeUpdatedAt(field = 'all') {
            const fields = field === 'all' ? NOTICE_FIELDS : [field];
            const nextTimestamps = { ...noticeUpdatedAt.value };
            fields.forEach(targetField => {
                const draft = getLocalNoticeDraft(targetField);
                nextTimestamps[targetField] = getDraftTimestampValue(draft);
            });
            noticeUpdatedAt.value = nextTimestamps;
        }

        function saveDraft(field, html) {
            if (!html || html === '<p><br></p>') {
                localStorage.removeItem(DRAFT_KEY_PREFIX + field);
                return;
            }
            const timestampIso = new Date().toISOString();
            localStorage.setItem(DRAFT_KEY_PREFIX + field, JSON.stringify({
                content: html,
                timestamp: timestampIso,
                timestampIso
            }));

            // Sync draft to server for multi-end support
            debouncedSaveServerDraft(field, html);
        }

        const debouncedSaveServerDraft = debounce(async (field, html) => {
            if (!canEditData.value || !currentDepartmentId.value) return;
            try {
                await apiFetch('/api/notices/draft', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        departmentId: currentDepartmentId.value,
                        field,
                        content: html
                    })
                });
            } catch (error) {
                console.warn('Draft sync failed:', error);
            }
        }, 3000);

        function hasDraft(field) {
            // Check local first, then server
            return !!localStorage.getItem(DRAFT_KEY_PREFIX + field);
        }

        async function restoreDraft(field) {
            // Try to get the latest draft from both local and server
            const localDraft = getLocalNoticeDraft(field);
            
            let serverDraft = null;
            try {
                serverDraft = await apiFetch(`/api/notices/draft?departmentId=${currentDepartmentId.value}&field=${field}`);
            } catch (e) {
                console.warn('Server draft fetch failed');
            }

            // Decide which draft to use (the latest one)
            let draftToUse = null;
            if (localDraft && serverDraft) {
                const localTime = parseNoticeTimestamp(localDraft.timestampIso || localDraft.timestamp)?.getTime() || 0;
                const serverTime = parseNoticeTimestamp(serverDraft.timestampIso || serverDraft.timestamp)?.getTime() || 0;
                draftToUse = localTime >= serverTime ? localDraft : serverDraft;
            } else {
                draftToUse = localDraft || serverDraft;
            }

            if (!draftToUse) {
                showAlert('未找到可用草稿', 'error');
                return;
            }

            const timeStr = parseNoticeTimestamp(draftToUse.timestampIso || draftToUse.timestamp)?.toLocaleString() || '未知时间';
            if (confirm(`检测到于 ${timeStr} 保存的${draftToUse === serverDraft ? '云端' : '本地'}草稿，是否恢复？`)) {
                setNoticeUpdatedAt(field, getDraftTimestampValue(draftToUse) || new Date());
                notices.value[field] = draftToUse.content;
                syncNoticesToEditors();
                showAlert('草稿已恢复');
            }
        }

        async function importLegacyNoticeHistory(field) {
            if (!canEditData.value || !currentDepartmentId.value) return false;
            const migrationKey = `${currentDepartmentId.value}:${field}`;
            if (migratedNoticeHistoryKeys.has(migrationKey)) return false;

            const historyJson = localStorage.getItem(NOTICE_HISTORY_KEY_PREFIX + field);
            if (!historyJson) return false;

            let localHistory = [];
            try {
                localHistory = JSON.parse(historyJson);
            } catch (error) {
                console.warn('Failed to parse legacy notice history:', error);
                return false;
            }
            if (!Array.isArray(localHistory) || localHistory.length === 0) return false;

            const result = await apiFetch('/api/notices/history/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    departmentId: currentDepartmentId.value,
                    field,
                    history: localHistory
                })
            });
            migratedNoticeHistoryKeys.add(migrationKey);
            localStorage.removeItem(NOTICE_HISTORY_KEY_PREFIX + field);
            noticeHistoryList.value = Array.isArray(result?.history) ? result.history : noticeHistoryList.value;
            return true;
        }

        async function openNoticeHistory(field) {
            noticeHistoryField.value = field;
            noticeHistoryList.value = [];
            noticeHistorySearchQuery.value = '';
            selectedNoticeHistoryRecord.value = null;
            showNoticeHistory.value = true;
            isLoadingNoticeHistory.value = true;
            try {
                await importLegacyNoticeHistory(field);
                const data = await apiFetch(`/api/notices/history?departmentId=${encodeURIComponent(currentDepartmentId.value)}&field=${encodeURIComponent(field)}`);
                noticeHistoryList.value = Array.isArray(data?.history) ? data.history : [];
                selectedNoticeHistoryRecord.value = noticeHistoryList.value[0] || null;
                if (!noticeUpdatedAt.value[field] && noticeHistoryList.value[0]?.createdAt) {
                    setNoticeUpdatedAt(field, noticeHistoryList.value[0].createdAt);
                }
            } catch (error) {
                noticeHistoryList.value = [];
                selectedNoticeHistoryRecord.value = null;
                showAlert(error.message || '公告历史记录加载失败', 'error');
            } finally {
                isLoadingNoticeHistory.value = false;
            }
        }

        function rollbackNotice(record) {
            const versionTime = formatHistoryTime(record.createdAt || record.timestamp);
            if (confirm(`确定要回滚到 ${versionTime} 的版本吗？`)) {
                setNoticeUpdatedAt(noticeHistoryField.value, record.createdAt || record.timestamp || new Date());
                notices.value[noticeHistoryField.value] = record.content;
                syncNoticesToEditors();
                showNoticeHistory.value = false;
                showAlert('已成功回滚版本');
            }
        }

        async function deleteNoticeHistoryRecord(record) {
            if (!canEditData.value || !record?.id || !currentDepartmentId.value) return;
            if (!confirm(`确定要删除 ${formatHistoryTime(record.createdAt || record.timestamp)} 的历史版本吗？`)) return;
            try {
                const result = await apiFetch(`/api/notices/history/${encodeURIComponent(noticeHistoryField.value)}/${encodeURIComponent(record.id)}?departmentId=${encodeURIComponent(currentDepartmentId.value)}`, {
                    method: 'DELETE'
                });
                noticeHistoryList.value = Array.isArray(result?.history) ? result.history : [];
                if (selectedNoticeHistoryRecord.value?.id === record.id) {
                    selectedNoticeHistoryRecord.value = noticeHistoryList.value[0] || null;
                }
                showAlert('公告历史记录已删除');
            } catch (error) {
                showAlert(error.message || '删除公告历史记录失败', 'error');
            }
        }

        async function clearNoticeHistory() {
            if (!canEditData.value || !currentDepartmentId.value || noticeHistoryList.value.length === 0) return;
            const label = noticeHistoryField.value === 'teaching' ? '科室公告' : '特别备注';
            if (!confirm(`确定要清空【${label}】的全部历史版本吗？`)) return;
            try {
                const result = await apiFetch(`/api/notices/history/${encodeURIComponent(noticeHistoryField.value)}/clear?departmentId=${encodeURIComponent(currentDepartmentId.value)}`, {
                    method: 'DELETE'
                });
                noticeHistoryList.value = Array.isArray(result?.history) ? result.history : [];
                selectedNoticeHistoryRecord.value = null;
                showAlert(`${label}历史版本已清空`);
            } catch (error) {
                showAlert(error.message || '清空公告历史记录失败', 'error');
            }
        }

        function previewNoticeHistory(record) {
            selectedNoticeHistoryRecord.value = record || null;
        }

        function getNoticeHistoryPlainText(content) {
            const html = String(content || '');
            if (!html) return '';
            const container = document.createElement('div');
            container.innerHTML = html;
            return (container.textContent || container.innerText || '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function escapeRegExp(value) {
            return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function highlightNoticeHistoryText(text) {
            const sourceText = String(text || '');
            const query = String(noticeHistorySearchQuery.value || '').trim();
            const escapedText = escapeHtml(sourceText);
            if (!query) return escapedText;
            const pattern = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            return escapedText.replace(pattern, '<mark class="notice-history-highlight">$1</mark>');
        }

        function getNoticeHistoryPreviewText(record, maxLength = 72) {
            const text = getNoticeHistoryPlainText(record?.content || '');
            if (text.length <= maxLength) return text || '该版本暂无可预览内容';
            return `${text.slice(0, maxLength)}...`;
        }

        function getNoticeHistoryHighlightedPreviewHtml(record, maxLength = 72) {
            return highlightNoticeHistoryText(getNoticeHistoryPreviewText(record, maxLength));
        }

        function getNoticeHistoryHighlightedMetaHtml(text) {
            return highlightNoticeHistoryText(text);
        }

        function getNoticeHistoryMatchSnippetHtml(record, radius = 60) {
            const query = String(noticeHistorySearchQuery.value || '').trim();
            const text = getNoticeHistoryPlainText(record?.content || '');
            if (!text) return '';
            if (!query) return highlightNoticeHistoryText(text.slice(0, Math.min(text.length, radius * 2 + 12)));

            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            const matchIndex = lowerText.indexOf(lowerQuery);
            if (matchIndex === -1) {
                return highlightNoticeHistoryText(text.slice(0, Math.min(text.length, radius * 2 + 12)));
            }

            const start = Math.max(0, matchIndex - radius);
            const end = Math.min(text.length, matchIndex + query.length + radius);
            const prefix = start > 0 ? '...' : '';
            const suffix = end < text.length ? '...' : '';
            return highlightNoticeHistoryText(`${prefix}${text.slice(start, end)}${suffix}`);
        }

        function getNoticeHistoryContentLength(record) {
            return getNoticeHistoryPlainText(record?.content || '').length;
        }

        function getNoticeHistoryEntryLabel(index) {
            if (index === 0) return '最新版本';
            return `历史版本 ${index + 1}`;
        }

        const filteredNoticeHistoryList = computed(() => {
            const query = String(noticeHistorySearchQuery.value || '').trim().toLowerCase();
            if (!query) return noticeHistoryList.value;
            return noticeHistoryList.value.filter(record => {
                const timeText = formatHistoryTime(record.createdAt || record.timestamp).toLowerCase();
                const actorText = String(record.actor?.displayName || '').toLowerCase();
                const previewText = getNoticeHistoryPlainText(record.content || '').toLowerCase();
                return timeText.includes(query) || actorText.includes(query) || previewText.includes(query);
            });
        });

        function insertTable(field) {
            const editor = field === 'teaching' ? teachingEditor : specialEditor;
            if (!editor) return;
            
            const range = editor.getSelection(true);
            const tableHtml = `
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #d1d5db; margin-top: 10px;">
                    <tbody>
                        <tr><td style="border: 1px solid #d1d5db; padding: 4px;"></td><td style="border: 1px solid #d1d5db; padding: 4px;"></td><td style="border: 1px solid #d1d5db; padding: 4px;"></td></tr>
                        <tr><td style="border: 1px solid #d1d5db; padding: 4px;"></td><td style="border: 1px solid #d1d5db; padding: 4px;"></td><td style="border: 1px solid #d1d5db; padding: 4px;"></td></tr>
                        <tr><td style="border: 1px solid #d1d5db; padding: 4px;"></td><td style="border: 1px solid #d1d5db; padding: 4px;"></td><td style="border: 1px solid #d1d5db; padding: 4px;"></td></tr>
                    </tbody>
                </table>
                <p><br></p>
            `;
            
            // Quill 1.3.6 doesn't support tables natively via clipboard.dangerouslyPasteHTML easily for custom styles
            // We use a workaround to insert the HTML
            const currentHtml = editor.root.innerHTML;
            const index = range.index;
            
            // This is a simplified insertion for the demo purpose since Quill 1.x table support is limited
            editor.clipboard.dangerouslyPasteHTML(range.index, tableHtml);
        }

        function clampNumber(value, min, max, fallback) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return fallback;
            return Math.min(max, Math.max(min, numeric));
        }

        function normalizeUiSettings(settings = {}) {
            return {
                scheduleFontSize: clampNumber(settings.scheduleFontSize, 11, 22, DEFAULT_UI_SETTINGS.scheduleFontSize),
                sidebarWidth: clampNumber(settings.sidebarWidth, 420, 920, DEFAULT_UI_SETTINGS.sidebarWidth)
            };
        }

        function normalizeSidebarAccentColor(value, fallback = '') {
            const normalized = String(value || '').trim();
            if (!normalized) return fallback;
            return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : fallback;
        }

        function normalizeScheduleModule(module = {}, index = 0) {
            const fallback = DEFAULT_SCHEDULE_MODULES.find(item => item.id === module.id) || {};
            const defaultSidebarMode = fallback.sidebarMode || (fallback.id ? DEFAULT_SIDEBAR_MODE : DEFAULT_CUSTOM_SIDEBAR_MODE);
            const defaultSidebarOrder = Number.isFinite(Number(module.sidebarOrder))
                ? clampNumber(module.sidebarOrder, 1, 999, 100 + ((fallback.order || index + 1) * 10))
                : clampNumber(fallback.sidebarOrder, 1, 999, 100 + ((fallback.order || index + 1) * 10));
            return {
                id: String(module.id || fallback.id || `module-${index + 1}`).trim(),
                doctorLabel: String(module.doctorLabel || fallback.doctorLabel || `模块${index + 1}`).trim() || `模块${index + 1}`,
                groupName: String(module.groupName || fallback.groupName || module.doctorLabel || fallback.doctorLabel || `模块${index + 1}`).trim() || `模块${index + 1}`,
                clearLabel: String(module.clearLabel || fallback.clearLabel || `清空${module.groupName || fallback.groupName || module.doctorLabel || fallback.doctorLabel || `模块${index + 1}`}`).trim(),
                order: clampNumber(module.order, 1, 9999, fallback.order || index + 1),
                enabled: module.enabled !== false,
                allowFixedWeekdays: module.allowFixedWeekdays ?? fallback.allowFixedWeekdays ?? false,
                allowMultiAssign: module.allowMultiAssign ?? fallback.allowMultiAssign ?? true,
                sidebarMode: SIDEBAR_MODE_OPTIONS.some(option => option.value === module.sidebarMode)
                    ? module.sidebarMode
                    : defaultSidebarMode,
                sidebarLabel: String(module.sidebarLabel ?? fallback.sidebarLabel ?? '').trim(),
                sidebarOrder: defaultSidebarOrder,
                sidebarShowLabel: module.sidebarShowLabel ?? fallback.sidebarShowLabel ?? true,
                sidebarShowPhone: module.sidebarShowPhone ?? fallback.sidebarShowPhone ?? false,
                sidebarPhoneMode: SIDEBAR_PHONE_MODE_OPTIONS.some(option => option.value === module.sidebarPhoneMode)
                    ? module.sidebarPhoneMode
                    : (fallback.sidebarPhoneMode || 'separate_line'),
                sidebarShowTitle: module.sidebarShowTitle ?? fallback.sidebarShowTitle ?? false,
                sidebarTitleMode: SIDEBAR_TITLE_MODE_OPTIONS.some(option => option.value === module.sidebarTitleMode)
                    ? module.sidebarTitleMode
                    : (fallback.sidebarTitleMode || 'inline'),
                sidebarShowShiftName: module.sidebarShowShiftName ?? fallback.sidebarShowShiftName ?? true,
                sidebarGroupMode: SIDEBAR_GROUP_MODE_OPTIONS.some(option => option.value === module.sidebarGroupMode)
                    ? module.sidebarGroupMode
                    : (fallback.sidebarGroupMode || 'merge_by_shift'),
                sidebarDensity: SIDEBAR_DENSITY_OPTIONS.some(option => option.value === module.sidebarDensity)
                    ? module.sidebarDensity
                    : (fallback.sidebarDensity || 'standard'),
                sidebarShowIfEmpty: !!(module.sidebarShowIfEmpty ?? fallback.sidebarShowIfEmpty),
                sidebarCountMode: SIDEBAR_COUNT_MODE_OPTIONS.some(option => option.value === module.sidebarCountMode)
                    ? module.sidebarCountMode
                    : (fallback.sidebarCountMode || 'hidden'),
                sidebarAccentColor: normalizeSidebarAccentColor(module.sidebarAccentColor, normalizeSidebarAccentColor(fallback.sidebarAccentColor)),
                sidebarKeywordsText: String(module.sidebarKeywordsText ?? fallback.sidebarKeywordsText ?? '').trim(),
                sidebarShiftIds: Array.isArray(module.sidebarShiftIds)
                    ? Array.from(new Set(module.sidebarShiftIds.map(item => String(item || '').trim()).filter(Boolean)))
                    : Array.isArray(fallback.sidebarShiftIds) ? [...fallback.sidebarShiftIds] : []
            };
        }

        function normalizeModules(nextModules = []) {
            const normalized = Array.isArray(nextModules)
                ? nextModules.map((module, index) => normalizeScheduleModule(module, index))
                : [];
            return normalized.sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.groupName.localeCompare(b.groupName, 'zh-CN');
            });
        }

        function closePrimaryManagerModals() {
            showDoctorModal.value = false;
            showModuleManager.value = false;
            showShiftManager.value = false;
        }

        function resetNewModuleForm() {
            newModule.value = createDefaultNewModuleState();
        }

        function createCustomModuleId() {
            return `custom_module_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

        function normalizeNotices(nextNotices = {}) {
            return {
                teaching: String(nextNotices?.teaching || ''),
                special: String(nextNotices?.special || ''),
                teachingClinicWeekdays: normalizeWeekdayNotes(nextNotices?.teachingClinicWeekdays || DEFAULT_WEEKDAY_NOTES),
                teachingClinicMembers: Array.isArray(nextNotices?.teachingClinicMembers) ? nextNotices.teachingClinicMembers : []
            };
        }

        function enforceUiSettingsBounds() {
            uiSettings.value = normalizeUiSettings(uiSettings.value);
        }

        function shouldAutoAddTeachingClinicCategory(shift, categories) {
            if (!TEACHING_CLINIC_ENABLED_SHIFT_KEYS.has(shift?.systemKey)) return false;
            if (categories.includes('teaching_clinic')) return false;

            const legacyCategories = LEGACY_SHIFT_CATEGORY_MAP[shift.systemKey];
            if (!legacyCategories) return false;
            if (categories.length !== legacyCategories.length) return false;

            return legacyCategories.every(category => categories.includes(category));
        }

        function normalizeShiftTypes(shifts = []) {
            const normalized = shifts.map((shift, index) => {
                const categories = Array.isArray(shift?.categories) ? [...shift.categories] : [];
                if (shouldAutoAddTeachingClinicCategory(shift, categories)) {
                    categories.push('teaching_clinic');
                }

                return {
                    ...shift,
                    id: shift?.id || `custom-shift-${shift?.name || 'unnamed'}-${index}`,
                    color: shift?.color || 'blue',
                    categories
                };
            });

            const blankIndex = normalized.findIndex(shift => shift.id === BLANK_SHIFT_ID || shift.systemKey === 'blank_fill');
            if (blankIndex === -1) {
                normalized.push({ ...BLANK_SHIFT_DEFINITION });
            } else {
                normalized[blankIndex] = {
                    ...normalized[blankIndex],
                    ...BLANK_SHIFT_DEFINITION,
                    id: BLANK_SHIFT_ID
                };
            }

            return normalized;
        }

        function persistActiveDepartmentId(departmentId) {
            currentDepartmentId.value = departmentId || '';
            if (departmentId) {
                localStorage.setItem(ACTIVE_DEPARTMENT_KEY, departmentId);
            } else {
                localStorage.removeItem(ACTIVE_DEPARTMENT_KEY);
            }
        }

        function syncDepartmentDraftNames() {
            departmentDraftNames.value = Object.fromEntries(
                departments.value.map(department => [department.id, String(department.name || '')])
            );
        }

        function normalizeAdminDepartmentIds(departmentIds) {
            if (!Array.isArray(departmentIds)) return [];
            return Array.from(new Set(
                departmentIds
                    .map(id => String(id || '').trim())
                    .filter(Boolean)
            ));
        }

        function getDepartmentNameById(departmentId) {
            const match = departments.value.find(department => department.id === departmentId);
            return match?.name || departmentId;
        }

        function getAdminDepartmentNames(admin) {
            if (admin?.role === ROLE_TERMINAL) {
                return ['全部科室'];
            }
            return normalizeAdminDepartmentIds(admin?.departmentIds).map(getDepartmentNameById);
        }

        function resetAdminForm() {
            editingAdminId.value = '';
            newAdmin.value = createEmptyAdminForm();
        }

        function populateAdminForm(admin) {
            editingAdminId.value = String(admin?.id || '');
            newAdmin.value = {
                username: String(admin?.username || ''),
                password: '',
                role: admin?.role === ROLE_TERMINAL ? ROLE_TERMINAL : ROLE_ADMIN,
                displayName: String(admin?.displayName || ''),
                departmentIds: normalizeAdminDepartmentIds(admin?.departmentIds)
            };
        }

        function getDataApiUrl(departmentId = currentDepartmentId.value) {
            const deptId = String(departmentId || '').trim();
            return deptId ? `${API_URL}?departmentId=${encodeURIComponent(deptId)}` : API_URL;
        }

        async function apiFetch(url, options = {}) {
            const headers = { ...(options.headers || {}) };
            if (authToken.value) {
                headers.Authorization = `Bearer ${authToken.value}`;
            }

            const response = await fetch(url, {
                ...options,
                headers
            });

            const contentType = response.headers.get('content-type') || '';
            const payload = contentType.includes('application/json')
                ? await response.json()
                : await response.text();

            if (response.status === 401) {
                clearSession(true);
                authReady.value = true;
                throw new Error(payload?.message || '登录已失效，请重新登录');
            }

            if (!response.ok) {
                throw new Error(payload?.message || '请求失败');
            }

            return payload;
        }

        function cleanupRestrictedHolidayShifts() {
            let removedCount = 0;
            let changed = false;

            Object.keys(scheduleData.value).forEach(dateStr => {
                if (!isWeekendOrHoliday(dateStr)) return;
                const doctorSchedule = scheduleData.value[dateStr];
                if (!doctorSchedule || typeof doctorSchedule !== 'object') return;

                Object.keys(doctorSchedule).forEach(doctorId => {
                    const shiftIds = Array.isArray(doctorSchedule[doctorId]) ? doctorSchedule[doctorId] : [];
                    const allowedShiftIds = shiftIds.filter(shiftId => !isRestrictedWhiteShift(shiftId));
                    if (allowedShiftIds.length === shiftIds.length) return;

                    removedCount += shiftIds.length - allowedShiftIds.length;
                    changed = true;

                    if (allowedShiftIds.length > 0) {
                        doctorSchedule[doctorId] = allowedShiftIds;
                    } else {
                        delete doctorSchedule[doctorId];
                    }
                });

                if (Object.keys(doctorSchedule).length === 0) {
                    delete scheduleData.value[dateStr];
                }
            });

            return { changed, removedCount };
        }

        async function fetchData(departmentId = currentDepartmentId.value) {
            let needsShiftMigration = false;
            let cleanedRestrictedShiftCount = 0;
            isHydratingData.value = true;
            try {
                const data = await apiFetch(getDataApiUrl(departmentId));
                departments.value = Array.isArray(data.departments) ? data.departments : [];
                persistActiveDepartmentId(data.currentDepartmentId || departmentId || '');
                modules.value = normalizeModules(data.modules);
                doctors.value = data.doctors || [];
                scheduleData.value = data.scheduleData || {};
                const rawShiftTypes = data.shiftTypes || [];
                const normalizedShiftTypes = normalizeShiftTypes(rawShiftTypes);
                needsShiftMigration = normalizedShiftTypes.some((shift, index) => {
                    const raw = rawShiftTypes[index] || {};
                    return shift.id !== raw.id
                        || shift.color !== raw.color
                        || shift.categories.length !== (Array.isArray(raw.categories) ? raw.categories.length : 0);
                });
                shiftTypes.value = normalizedShiftTypes;
                if (data.notices) {
                    notices.value = normalizeNotices(data.notices);
                } else {
                    notices.value = normalizeNotices();
                }
                hydrateNoticeUpdatedAt();
                recentClearAction.value = null;
                uiSettings.value = normalizeUiSettings(data.uiSettings);
                if (Array.isArray(data.holidays)) {
                    holidays.value = [...data.holidays];
                }
                lockedMonths.value = Array.isArray(data.lockedMonths) ? [...data.lockedMonths] : [];
                scheduleTemplates.value = Array.isArray(data.scheduleTemplates) ? [...data.scheduleTemplates] : [];
                const cleanupResult = cleanupRestrictedHolidayShifts();
                cleanedRestrictedShiftCount = cleanupResult.removedCount;
                needsShiftMigration = needsShiftMigration || cleanupResult.changed;
                lastSavedFingerprint = JSON.stringify(buildPersistPayload());
                
                // Sync to Quill editors after data load
                nextTick(() => {
                    syncNoticesToEditors();
                });
            } catch (error) {
                console.error('Error fetching data:', error);
                showAlert('数据加载失败，请检查服务器连接', 'error');
            } finally {
                isHydratingData.value = false;
                isInitializing.value = false;
                if (needsShiftMigration) {
                    await saveData(true);
                }
                if (cleanedRestrictedShiftCount > 0) {
                    showAlert(`已自动清理 ${cleanedRestrictedShiftCount} 条周末/节假日白班`);
                }
            }
        }

        let saveTimeout = null;

        function buildPersistPayload() {
            return {
                departmentId: currentDepartmentId.value,
                modules: modules.value,
                doctors: doctors.value,
                scheduleData: scheduleData.value,
                shiftTypes: shiftTypes.value,
                notices: normalizeNotices(notices.value),
                uiSettings: normalizeUiSettings(uiSettings.value)
            };
        }

        async function saveData(force = false, options = {}) {
            if (!canEditData.value || !currentDepartmentId.value) return;
            try {
                const payload = buildPersistPayload();
                const nextFingerprint = JSON.stringify(payload);
                if (!force && nextFingerprint === lastSavedFingerprint) {
                    return;
                }
                if (!preserveRecentClearActionOnSave) {
                    recentClearAction.value = null;
                }

                isSavingData.value = true;
                
                saveInFlightPromise = apiFetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...payload,
                        skipAutoHistorySnapshot: options.skipAutoHistorySnapshot === true
                    })
                });
                const result = await saveInFlightPromise;
                if (Array.isArray(result?.departments)) {
                    departments.value = result.departments;
                }
                if (result?.currentDepartmentId) {
                    persistActiveDepartmentId(result.currentDepartmentId);
                }
                lastSavedFingerprint = nextFingerprint;
                return true;
            } catch (error) {
                console.error('Error saving data:', error);
                showAlert('数据保存失败', 'error');
                return false;
            } finally {
                isSavingData.value = false;
                saveInFlightPromise = null;
            }
        }

        function debouncedSaveData() {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                saveData();
            }, SAVE_DEBOUNCE_MS);
        }

        function persistToken(token) {
            authToken.value = token;
            localStorage.setItem(AUTH_TOKEN_KEY, token);
        }

        function clearSession(clearToken = true) {
            currentUser.value = null;
            recentClearAction.value = null;
            if (clearToken) {
                authToken.value = '';
                localStorage.removeItem(AUTH_TOKEN_KEY);
            }
            showAdminManager.value = false;
            showHistoryManager.value = false;
            showLoginPanel.value = false;
            adminAccounts.value = [];
            historyRecords.value = [];
        }

        async function activateGuestSession(showMessage = false) {
            const { token, user } = await fetch('/api/auth/guest', {
                method: 'POST'
            }).then(async response => {
                const payload = await response.json();
                if (!response.ok) {
                    throw new Error(payload?.message || '游客模式初始化失败');
                }
                return payload;
            });

            persistToken(token);
            currentUser.value = user;
            showLoginPanel.value = false;
            await fetchData();
            if (showMessage) {
                showAlert('已切换为游客模式');
            }
        }

        async function loadAdminAccounts() {
            if (!canManageAdmins.value) return;
            const data = await apiFetch('/api/admins');
            adminAccounts.value = data.admins || [];
            if (editingAdminId.value && !adminAccounts.value.some(admin => admin.id === editingAdminId.value)) {
                resetAdminForm();
            }
        }

        async function loadHistoryRecords() {
            if (!canEditData.value || !currentDepartmentId.value) return;
            isLoadingHistory.value = true;
            try {
                const data = await apiFetch(`/api/history?departmentId=${encodeURIComponent(currentDepartmentId.value)}`);
                historyRecords.value = data.history || [];
            } catch (error) {
                showAlert(error.message || '历史记录加载失败', 'error');
            } finally {
                isLoadingHistory.value = false;
            }
        }

        async function createManualHistorySnapshot(summary) {
            const result = await apiFetch('/api/history/snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    departmentId: currentDepartmentId.value,
                    summary
                })
            });
            if (Array.isArray(result?.history)) {
                historyRecords.value = result.history;
            }
            return result?.historyEntry || null;
        }

        async function restoreSession() {
            authReady.value = false;
            try {
                if (authToken.value) {
                    try {
                        const { user } = await apiFetch('/api/auth/me');
                        currentUser.value = user;
                        await fetchData();
                        if (user.role === ROLE_TERMINAL) {
                            await loadAdminAccounts();
                        }
                    } catch (e) {
                        console.warn('Session restore failed, falling back to guest mode:', e);
                        // apiFetch will have already called clearSession(true)
                    }
                }
                if (!currentUser.value) {
                    await activateGuestSession(false);
                }
            } catch (error) {
                clearSession(true);
                console.error('Error restoring session:', error);
                showAlert('游客模式初始化失败，请刷新页面重试', 'error');
            } finally {
                authReady.value = true;
            }
        }

        onMounted(() => {
            restoreSession().then(() => {
                nextTick(() => {
                    initQuillEditors();
                });
            });
        });

        onBeforeUnmount(() => {
            cleanupNoticeAutoHeightObservers();
        });

        // Watchers to auto-save changes
        watch([modules, doctors, scheduleData, shiftTypes, notices, uiSettings], () => {
            if (isInitializing.value || isHydratingData.value) return;
            debouncedSaveData();
        }, { deep: true });

        watch(() => notices.value.teaching, () => {
            scheduleNoticeHeightRefresh();
        });

        watch(() => notices.value.special, () => {
            scheduleNoticeHeightRefresh();
        });

        watch(() => currentUser.value?.role, () => {
            scheduleNoticeHeightRefresh();
        });

        watch(() => uiSettings.value.sidebarWidth, () => {
            scheduleNoticeHeightRefresh();
        });

        const showDoctorModal = ref(false);
        const showModuleManager = ref(false);
        const newDoctor = ref({ name: '', title: '主治医师', category: 'first', phone: '', notes: '' });
        const copyDoctorPopup = ref({ doctorId: null, targetModuleId: '' });
        
        const viewMode = ref('week'); // 'week' or 'month'
        const filterCategory = ref('all'); // 'all', 'first', 'second', 'third', 'trainee'
        const compactMode = ref(false);
        
        const today = new Date();
        const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const currentMonth = ref(currentMonthStr); 
        const currentWeekStart = ref(getStartOfWeek(today));

        const alert = ref({ show: false, message: '', type: 'success' });
        
        // Popup state
        const popup = ref({
            show: false,
            x: 0,
            y: 0,
            docId: null,
            docName: '',
            docCategory: '',
            dateStr: '',
            mode: 'normal'
        });

        // --- Shift Customization State ---
        const showShiftManager = ref(false);

        const colorOptions = [
            { value: 'blue', class: 'shift-color-blue', label: '海蓝' },
            { value: 'sky', class: 'shift-color-sky', label: '天蓝' },
            { value: 'cyan', class: 'shift-color-cyan', label: '湖青' },
            { value: 'teal', class: 'shift-color-teal', label: '青绿' },
            { value: 'emerald', class: 'shift-color-emerald', label: '翡翠绿' },
            { value: 'green', class: 'shift-color-green', label: '标准绿' },
            { value: 'lime', class: 'shift-color-lime', label: '柠檬绿' },
            { value: 'yellow', class: 'shift-color-yellow', label: '明黄' },
            { value: 'amber', class: 'shift-color-amber', label: '琥珀' },
            { value: 'orange', class: 'shift-color-orange', label: '橙色' },
            { value: 'red', class: 'shift-color-red', label: '朱红' },
            { value: 'rose', class: 'shift-color-rose', label: '玫瑰' },
            { value: 'pink', class: 'shift-color-pink', label: '粉色' },
            { value: 'fuchsia', class: 'shift-color-fuchsia', label: '洋红' },
            { value: 'purple', class: 'shift-color-purple', label: '紫色' },
            { value: 'violet', class: 'shift-color-violet', label: '堇紫' },
            { value: 'indigo', class: 'shift-color-indigo', label: '靛蓝' },
            { value: 'navy', class: 'shift-color-navy', label: '深海军蓝' },
            { value: 'maroon', class: 'shift-color-maroon', label: '栗红' },
            { value: 'slate', class: 'shift-color-slate', label: '岩板灰' },
            { value: 'gray', class: 'shift-color-gray', label: '中灰' },
            { value: 'zinc', class: 'shift-color-zinc', label: '锌灰' },
            { value: 'neutral', class: 'shift-color-neutral', label: '中性灰' },
            { value: 'stone', class: 'shift-color-stone', label: '石褐' }
        ];

        const editingShift = ref({ id: null, name: '', short: '', color: 'blue', categories: [] });
        const latestSavedShiftId = ref('');

        // --- Auto Schedule State ---
        const showAutoSchedule = ref(false);
        const autoScheduleConfig = ref({
            mode: 'individual',
            doctorId: '',
            groupCategory: 'first',
            groupDoctorIds: [],
            cycleShiftIds: [],
            startDate: formatDate(today),
            endDate: formatDate(new Date(today.getTime() + 13 * 24 * 60 * 60 * 1000)),
            skipWeekend: false,
            fixedWeekdays: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 0: '' }
        });

        const weekdayOptions = [
            { value: 1, label: '周一' },
            { value: 2, label: '周二' },
            { value: 3, label: '周三' },
            { value: 4, label: '周四' },
            { value: 5, label: '周五' },
            { value: 6, label: '周六' },
            { value: 0, label: '周日' }
        ];

        const doctorMap = computed(() => {
            const map = new Map();
            doctors.value.forEach(doc => map.set(doc.id, doc));
            return map;
        });

        const shiftTypeMap = computed(() => {
            const map = new Map();
            shiftTypes.value.forEach(shift => map.set(shift.id, shift));
            return map;
        });

        const selectedAutoDoctor = computed(() => {
            const doctor = doctorMap.value.get(autoScheduleConfig.value.doctorId);
            return doctor && isModuleEnabled(doctor.category) ? doctor : null;
        });

        const activePrimaryManager = computed(() => {
            if (showDoctorModal.value) return 'doctor';
            if (showModuleManager.value) return 'module';
            if (showShiftManager.value) return 'shift';
            return '';
        });

        const doctorTitleOptions = computed(() => {
            const dynamicTitles = doctors.value
                .map(doc => String(doc.title || '').trim())
                .filter(Boolean);
            return Array.from(new Set([...COMMON_DOCTOR_TITLES, ...dynamicTitles]));
        });

        const activeAutoCategory = computed(() => {
            if (autoScheduleConfig.value.mode === 'group') {
                return autoScheduleConfig.value.groupCategory;
            }
            return selectedAutoDoctor.value?.category || '';
        });

        const selectedAutoTargets = computed(() => {
            if (autoScheduleConfig.value.mode === 'group') {
                const groupDoctors = doctors.value.filter(doc => doc.category === autoScheduleConfig.value.groupCategory);
                if (!autoScheduleConfig.value.groupDoctorIds.length) {
                    return groupDoctors;
                }
                const selectedIds = new Set(autoScheduleConfig.value.groupDoctorIds);
                return groupDoctors.filter(doc => selectedIds.has(doc.id));
            }
            return selectedAutoDoctor.value ? [selectedAutoDoctor.value] : [];
        });

        const availableGroupDoctors = computed(() => {
            return enabledDoctors.value
                .filter(doc => doc.category === autoScheduleConfig.value.groupCategory)
                .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        });

        const canEditData = computed(() => {
            return currentUser.value?.role === ROLE_TERMINAL || currentUser.value?.role === ROLE_ADMIN;
        });

        const canManageAdmins = computed(() => {
            return currentUser.value?.role === ROLE_TERMINAL;
        });

        const isEditingAdminAccount = computed(() => !!editingAdminId.value);

        const departmentOptions = computed(() => {
            return [...departments.value]
                .sort((a, b) => {
                    if (a.order !== b.order) return a.order - b.order;
                    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
                })
                .map(department => ({
                    value: department.id,
                    label: department.name
                }));
        });

        const canSubmitAdminForm = computed(() => {
            const username = String(newAdmin.value.username || '').trim();
            const password = String(newAdmin.value.password || '');
            const role = newAdmin.value.role === ROLE_TERMINAL ? ROLE_TERMINAL : ROLE_ADMIN;
            const departmentIds = Array.isArray(newAdmin.value.departmentIds) ? newAdmin.value.departmentIds.filter(Boolean) : [];
            if (!username) return false;
            if (!isEditingAdminAccount.value && !password) return false;
            if (role === ROLE_ADMIN && departmentIds.length === 0) return false;
            return true;
        });

        const currentDepartment = computed(() => {
            return departments.value.find(department => department.id === currentDepartmentId.value) || null;
        });

        const enabledModules = computed(() => {
            return modules.value
                .filter(module => module.enabled !== false)
                .sort((a, b) => {
                    if (a.order !== b.order) return a.order - b.order;
                    return a.groupName.localeCompare(b.groupName, 'zh-CN');
                });
        });

        const moduleMap = computed(() => {
            const map = new Map();
            modules.value.forEach(module => map.set(module.id, module));
            return map;
        });

        function isModuleEnabled(category) {
            const module = moduleMap.value.get(String(category || '').trim());
            return !!module && module.enabled !== false;
        }

        const enabledDoctors = computed(() => {
            return doctors.value
                .filter(doc => isModuleEnabled(doc.category))
                .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        });

        const allModulesSorted = computed(() => {
            return [...modules.value].sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.groupName.localeCompare(b.groupName, 'zh-CN');
            });
        });

        const moduleManagerVisibleModules = computed(() => {
            if (moduleManagerSelectedModuleId.value === 'all') {
                return allModulesSorted.value;
            }
            return allModulesSorted.value.filter(module => module.id === moduleManagerSelectedModuleId.value);
        });

        const doctorCategoryOptions = computed(() => enabledModules.value.map(module => ({
            value: module.id,
            label: module.doctorLabel
        })));

        const clearableModules = computed(() => enabledModules.value.map(module => ({
            value: module.id,
            label: module.clearLabel
        })));

        const autoScheduleModules = computed(() => enabledModules.value.map(module => ({
            value: module.id,
            label: module.doctorLabel
        })));

        const moduleUsageStats = computed(() => {
            const stats = new Map();
            modules.value.forEach(module => {
                stats.set(module.id, {
                    doctorCount: doctors.value.filter(doc => doc.category === module.id).length,
                    shiftCount: shiftTypes.value.filter(shift => Array.isArray(shift.categories) && shift.categories.includes(module.id)).length
                });
            });
            return stats;
        });

        const sidebarModeOptions = computed(() => SIDEBAR_MODE_OPTIONS);
        const sidebarAccentOptions = computed(() => SIDEBAR_ACCENT_OPTIONS);
        const sidebarGroupModeOptions = computed(() => SIDEBAR_GROUP_MODE_OPTIONS);
        const sidebarPhoneModeOptions = computed(() => SIDEBAR_PHONE_MODE_OPTIONS);
        const sidebarTitleModeOptions = computed(() => SIDEBAR_TITLE_MODE_OPTIONS);
        const sidebarDensityOptions = computed(() => SIDEBAR_DENSITY_OPTIONS);
        const sidebarCountModeOptions = computed(() => SIDEBAR_COUNT_MODE_OPTIONS);

        function getModuleSidebarModeValue(moduleLike) {
            const mode = String(moduleLike?.sidebarMode || '').trim();
            return SIDEBAR_MODE_OPTIONS.some(option => option.value === mode)
                ? mode
                : (moduleLike?.id && isDefaultModule(moduleLike.id) ? DEFAULT_SIDEBAR_MODE : DEFAULT_CUSTOM_SIDEBAR_MODE);
        }

        function isModuleSidebarStandaloneMode(moduleLike) {
            const mode = getModuleSidebarModeValue(moduleLike);
            return mode !== 'default' && mode !== 'hidden';
        }

        function shouldShowModuleSidebarAdvancedSettings(moduleLike) {
            return isModuleSidebarStandaloneMode(moduleLike);
        }

        function shouldShowModuleSidebarKeywordEditor(moduleLike) {
            return getModuleSidebarModeValue(moduleLike) === 'module_keyword';
        }

        function shouldShowModuleSidebarWhitelistEditor(moduleLike) {
            return getModuleSidebarModeValue(moduleLike) === 'module_shift_whitelist';
        }

        function shouldShowModuleSidebarPhoneModeEditor(moduleLike) {
            return shouldShowModuleSidebarAdvancedSettings(moduleLike) && Boolean(moduleLike?.sidebarShowPhone);
        }

        function getModuleSidebarInactiveHint(moduleLike) {
            const mode = getModuleSidebarModeValue(moduleLike);
            if (mode === 'default') {
                return '当前沿用系统默认右侧规则，下方单独模块行样式配置暂不生效。';
            }
            if (mode === 'hidden') {
                return '当前模块已设置为不在右侧展示，下方右侧样式配置暂不生效。';
            }
            if (mode === 'module_keyword') {
                return '仅提取名称或简称命中关键字的班次。';
            }
            if (mode === 'module_shift_whitelist') {
                return '仅提取已勾选到白名单内的班次。';
            }
            return '当前模块会以单独模块行显示在右侧，可继续细化展示方式。';
        }

        function getSidebarKeywordListFromModule(moduleLike) {
            const rawText = String(moduleLike?.sidebarKeywordsText || '').trim();
            if (!rawText) return [];
            return Array.from(new Set(
                rawText
                    .split(/[\n,，;；|]/)
                    .map(item => item.trim())
                    .filter(Boolean)
            ));
        }

        function getModuleSidebarLabel(category) {
            const module = getModuleMeta(category);
            if (!module) return '';
            return String(module.sidebarLabel || module.groupName || module.doctorLabel || '').trim();
        }

        function getModuleSidebarAccentColor(category) {
            const module = getModuleMeta(category);
            return normalizeSidebarAccentColor(module?.sidebarAccentColor || '');
        }

        function shouldShowModuleSidebarPhone(category) {
            return Boolean(getModuleMeta(category)?.sidebarShowPhone);
        }

        function getModuleSidebarPhoneMode(category) {
            const mode = String(getModuleMeta(category)?.sidebarPhoneMode || '').trim();
            return SIDEBAR_PHONE_MODE_OPTIONS.some(option => option.value === mode) ? mode : 'separate_line';
        }

        function shouldShowModuleSidebarLabel(category) {
            return getModuleMeta(category)?.sidebarShowLabel !== false;
        }

        function shouldShowModuleSidebarTitle(category) {
            return Boolean(getModuleMeta(category)?.sidebarShowTitle);
        }

        function getModuleSidebarTitleMode(category) {
            return getModuleMeta(category)?.sidebarTitleMode || 'inline';
        }

        function shouldShowModuleSidebarShiftName(category) {
            return getModuleMeta(category)?.sidebarShowShiftName !== false;
        }

        function getModuleSidebarGroupMode(category) {
            const mode = String(getModuleMeta(category)?.sidebarGroupMode || '').trim();
            return SIDEBAR_GROUP_MODE_OPTIONS.some(option => option.value === mode) ? mode : 'merge_by_shift';
        }

        function getSidebarKeywordList(category) {
            const module = getModuleMeta(category);
            return getSidebarKeywordListFromModule(module);
        }

        function getSidebarShiftIdSet(category) {
            const module = getModuleMeta(category);
            return new Set(Array.isArray(module?.sidebarShiftIds) ? module.sidebarShiftIds : []);
        }

        function getSidebarRuleTargetShifts(moduleId) {
            return sortShifts(shiftTypes.value.filter(shift => {
                const categories = Array.isArray(shift.categories) ? shift.categories : [];
                return categories.includes(moduleId);
            }));
        }

        const roleLabel = computed(() => {
            if (currentUser.value?.role === ROLE_TERMINAL) return '终端管理员';
            if (currentUser.value?.role === ROLE_ADMIN) return '普通管理员';
            if (currentUser.value?.role === ROLE_GUEST) return '游客';
            return '未登录';
        });

        const availableShiftsForAuto = computed(() => {
            const category = activeAutoCategory.value;
            if (!category) return [];
            
            // Get all shifts available for this category
            const allAvailable = getAvailableShifts(category);
            
            // For first/trainee: show all available shifts in the cycle sequence
            // For second/third: separate into clinic (fixed) and others (cycle)
            if (isSecondThirdCategory(category)) {
                return allAvailable.filter(shift => !isClinicShift(shift.id));
            }
            return allAvailable;
        });

        const availableClinicShiftsForAuto = computed(() => {
            const category = activeAutoCategory.value;
            if (!category || !isSecondThirdCategory(category)) return [];
            return getAvailableShifts(category).filter(shift => isClinicShift(shift.id));
        });

        const availableFixedWeeklyShiftsForAuto = computed(() => {
            const category = activeAutoCategory.value;
            if (!category || !isSecondThirdCategory(category)) return [];
            return getAvailableShifts(category).filter(shift => isFixedWeeklyShift(shift));
        });

        watch(enabledModules, (nextModules) => {
            if (!nextModules.length) return;
            const availableIds = new Set(nextModules.map(module => module.id));
            if (!availableIds.has(newDoctor.value.category)) {
                newDoctor.value.category = nextModules[0].id;
            }
            if (autoScheduleConfig.value.mode === 'group' && !availableIds.has(autoScheduleConfig.value.groupCategory)) {
                autoScheduleConfig.value.groupCategory = nextModules[0].id;
            }
            if (filterCategory.value !== 'all' && !availableIds.has(filterCategory.value)) {
                filterCategory.value = 'all';
            }
            if (autoScheduleConfig.value.doctorId && !selectedAutoDoctor.value) {
                autoScheduleConfig.value.doctorId = '';
            }
        }, { immediate: true, deep: true });

        watch(allModulesSorted, (nextModules) => {
            if (moduleManagerSelectedModuleId.value === 'all') return;
            if (!nextModules.some(module => module.id === moduleManagerSelectedModuleId.value)) {
                moduleManagerSelectedModuleId.value = 'all';
            }
        }, { immediate: true, deep: true });

        watch(() => autoScheduleConfig.value.doctorId, () => {
            autoScheduleConfig.value.cycleShiftIds = [];
            autoScheduleConfig.value.fixedWeekdays = getDefaultFixedWeekdaysForCategory(selectedAutoDoctor.value?.category || '');
        });

        watch(() => autoScheduleConfig.value.groupCategory, () => {
            if (autoScheduleConfig.value.mode === 'group') {
                initializeGroupDoctorIds();
                autoScheduleConfig.value.cycleShiftIds = [];
                autoScheduleConfig.value.fixedWeekdays = getDefaultFixedWeekdaysForCategory(autoScheduleConfig.value.groupCategory);
            }
        });

        watch(() => autoScheduleConfig.value.mode, (mode) => {
            if (mode === 'group') {
                initializeGroupDoctorIds();
                autoScheduleConfig.value.doctorId = '';
                autoScheduleConfig.value.fixedWeekdays = getDefaultFixedWeekdaysForCategory(autoScheduleConfig.value.groupCategory);
            } else {
                autoScheduleConfig.value.groupDoctorIds = [];
                autoScheduleConfig.value.fixedWeekdays = getDefaultFixedWeekdaysForCategory(selectedAutoDoctor.value?.category || '');
            }
        });

        watch(doctors, () => {
            if (autoScheduleConfig.value.mode === 'group' && availableGroupDoctors.value.length && autoScheduleConfig.value.groupDoctorIds.length === 0) {
                initializeGroupDoctorIds();
            }
        }, { deep: true });

        // --- Computed ---
        const displayDateRange = computed(() => {
            if (viewMode.value === 'month') {
                const [year, month] = currentMonth.value.split('-');
                return `${year}年${month}月`;
            } else {
                const start = currentWeekStart.value;
                const end = new Date(start);
                end.setDate(start.getDate() + 6);
                return `${formatDate(start)} 至 ${formatDate(end)}`;
            }
        });

        const calendarDays = computed(() => {
            if (viewMode.value === 'month') {
                return generateMonthCalendar();
            } else {
                return generateWeekCalendar();
            }
        });

        const filteredDepartments = computed(() => {
            const query = String(departmentSearchQuery.value || '').trim().toLowerCase();
            if (!query) return departments.value;
            return departments.value.filter(d => 
                String(d.name || '').toLowerCase().includes(query) ||
                String(d.id || '').toLowerCase().includes(query)
            );
        });

        const activeDepartments = computed(() => {
            return departments.value.filter(d => !d.archived);
        });

        const groupedDoctors = computed(() => {
            const groups = {};
            enabledModules.value.forEach(module => {
                groups[module.id] = [];
            });

            doctors.value.forEach(doc => {
                if (filterCategory.value !== 'all' && doc.category !== filterCategory.value) {
                    return;
                }
                if (groups[doc.category]) {
                    groups[doc.category].push(doc);
                }
            });

            return groups;
        });

        const scheduleGroupHeaderStyle = computed(() => ({
            fontSize: `${Math.max(uiSettings.value.scheduleFontSize + 2, 16)}px`
        }));
        const scheduleDoctorNameStyle = computed(() => ({
            fontSize: `${Math.max(uiSettings.value.scheduleFontSize, 13)}px`
        }));
        const scheduleDoctorTitleStyle = computed(() => ({
            fontSize: `${Math.max(uiSettings.value.scheduleFontSize - 3, 10)}px`
        }));
        const scheduleShiftTextStyle = computed(() => ({
            fontSize: `${uiSettings.value.scheduleFontSize}px`
        }));
        const sidebarWidthStyle = computed(() => {
            const width = `${uiSettings.value.sidebarWidth}px`;
            return {
                width,
                minWidth: width,
                flexBasis: width
            };
        });

        // --- Sidebar Logic ---
        const selectedSidebarDate = ref(formatDate(today));
        const todayDutyRows = computed(() => {
            const dateStr = selectedSidebarDate.value;
            const rowConfigs = getSidebarRowConfigs();
            const rows = Object.fromEntries(
                rowConfigs.map(config => [
                    config.key,
                    { ...config, groups: new Map() }
                ])
            );

            const daySchedule = scheduleData.value[dateStr] || {};

            Object.keys(daySchedule).forEach(docId => {
                const shiftIds = daySchedule[docId] || [];
                const doc = doctorMap.value.get(docId);
                if (!doc || !isModuleEnabled(doc.category)) return;

                shiftIds.forEach(shiftId => {
                    const shift = getShiftDefinition(shiftId);
                    if (!shouldDisplaySidebarShift(doc, shift)) return;

                    const rowKey = getSidebarRowKey(doc, shift);
                    if (!rowKey) return;

                    const row = rows[rowKey];
                    const groupKey = getSidebarGroupKey(rowKey, doc, shift);
                    let group = row.groups.get(groupKey);
                    if (!group) {
                        group = {
                            key: `${rowKey}-${groupKey}`,
                            shiftId: shift.id,
                            shiftName: shift.name,
                            shiftColor: shift.color,
                            rowOrder: getSidebarRowGroupOrder(rowKey, shift),
                            members: []
                        };
                        row.groups.set(groupKey, group);
                    }

                    group.members.push({
                        name: doc.name,
                        title: String(doc.title || '').trim(),
                        category: doc.category || '',
                        phoneText: shouldShowSidebarPhone(doc, shift) ? (doc.phone || '未录入电话') : ''
                    });
                });
            });

            return rowConfigs
                .map(config => {
                    const groups = Array.from(rows[config.key].groups.values())
                        .map(group => ({
                            ...group,
                            members: [...group.members].sort((a, b) => {
                                const categoryOrderDiff = getSidebarMemberCategoryOrder(config.key, a) - getSidebarMemberCategoryOrder(config.key, b);
                                if (categoryOrderDiff !== 0) return categoryOrderDiff;
                                return a.name.localeCompare(b.name, 'zh-CN');
                            })
                        }))
                        .sort((a, b) => {
                            if (a.rowOrder !== b.rowOrder) return a.rowOrder - b.rowOrder;
                            return a.shiftName.localeCompare(b.shiftName, 'zh-CN');
                        });

                    if (config.key === 'other') {
                        return groups.map(group => ({
                            key: group.key,
                            label: '',
                            showLabel: false,
                            groups: [group],
                            showPhones: false,
                            phoneMode: 'separate_line',
                            showTitles: false,
                            titleMode: 'inline',
                            showShiftNames: true,
                            density: 'standard',
                            countMode: 'hidden',
                            accentColor: ''
                        }));
                    }

                    return {
                        key: config.key,
                        label: rows[config.key].label,
                        showLabel: config.showLabel !== false,
                        groups,
                        showPhones: config.showPhones !== false,
                        phoneMode: config.phoneMode || 'separate_line',
                        showTitles: config.showTitles === true,
                        titleMode: config.titleMode || 'inline',
                        showShiftNames: config.showShiftNames !== false,
                        density: config.density || 'standard',
                        showIfEmpty: !!config.showIfEmpty,
                        countMode: config.countMode || 'hidden',
                        accentColor: config.accentColor || ''
                    };
                })
                .flat()
                .filter(row => row.groups.length > 0 || !!row.showIfEmpty);
        });

        watch(todayDutyRows, () => {
            scheduleNoticeHeightRefresh();
        }, { deep: true });

        function getSidebarRowConfigs() {
            const configs = [
                { key: 'duty', label: '值班', order: FIXED_SIDEBAR_ROW_ORDER.duty },
                { key: 'follow', label: '跟值', order: FIXED_SIDEBAR_ROW_ORDER.follow },
                { key: 'assistant', label: '副班', order: FIXED_SIDEBAR_ROW_ORDER.assistant },
                { key: 'day', label: '白班', order: FIXED_SIDEBAR_ROW_ORDER.day },
                { key: 'clinic', label: '门诊', order: FIXED_SIDEBAR_ROW_ORDER.clinic }
            ];

            enabledModules.value
                .filter(module => shouldRenderModuleSidebarRow(module.id))
                .forEach(module => {
                    configs.push({
                        key: `module:${module.id}`,
                        label: getModuleSidebarLabel(module.id),
                        order: clampNumber(module.sidebarOrder, 1, 999, 100 + (module.order * 10)),
                        showLabel: shouldShowModuleSidebarLabel(module.id),
                        showPhones: !!module.sidebarShowPhone,
                        phoneMode: getModuleSidebarPhoneMode(module.id),
                        showTitles: !!module.sidebarShowTitle,
                        titleMode: getModuleSidebarTitleMode(module.id),
                        showShiftNames: shouldShowModuleSidebarShiftName(module.id),
                        density: module.sidebarDensity || 'standard',
                        showIfEmpty: !!module.sidebarShowIfEmpty,
                        countMode: module.sidebarCountMode || 'hidden',
                        accentColor: getModuleSidebarAccentColor(module.id)
                    });
                });

            configs.push({ key: 'other', label: '其他', order: FIXED_SIDEBAR_ROW_ORDER.other });
            return configs.sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.label.localeCompare(b.label, 'zh-CN');
            });
        }

        function isTeachingClinicSidebarDoctor(doc) {
            if (!doc || doc.category !== 'teaching_clinic') return false;
            // 教学门诊安排应提取该模块下全部有效医生，不能只限定轮转/进修/规培
            return true;
        }

        function isTeachingClinicSidebarShift(shift) {
            if (!shift) return false;
            if (isClinicShift(shift.id)) return true;

            const categories = Array.isArray(shift.categories) ? shift.categories : [];
            if (!categories.includes('teaching_clinic')) return false;
            // 只要班次被明确归到教学门诊模块，就应参与该模块的侧边栏提取，
            // 不再因为名称里包含“教学/PBL”而被误判为普通教学班次后排除。
            if (isOtherNonClinicalShift(shift.id)) return false;
            if (isGeneralShift(shift.id) || isBlankShift(shift.id)) return false;
            if (isSidebarDutyShift(shift) || isSidebarFollowShift(shift) || isSidebarAssistantShift(shift) || isSidebarDayShift(shift)) return false;
            return true;
        }

        function isCustomModuleCategory(category) {
            return Boolean(category && isModuleEnabled(category) && !isDefaultModule(category));
        }

        function getModuleSidebarMode(category) {
            const module = getModuleMeta(category);
            if (!module) return DEFAULT_SIDEBAR_MODE;
            return module.sidebarMode || (isDefaultModule(category) ? DEFAULT_SIDEBAR_MODE : DEFAULT_CUSTOM_SIDEBAR_MODE);
        }

        function shouldRenderModuleSidebarRow(category) {
            const sidebarMode = getModuleSidebarMode(category);
            return sidebarMode !== 'hidden' && sidebarMode !== 'default';
        }

        function isSidebarExcludedShift(shift) {
            if (!shift) return true;
            return isBlankShift(shift.id) || isGeneralShift(shift.id) || isOtherNonClinicalShift(shift.id);
        }

        function isExplicitModuleShift(category, shift) {
            if (!category || !shift) return false;
            const categories = Array.isArray(shift.categories) ? shift.categories : [];
            return categories.includes(category);
        }

        function matchesModuleSidebarMode(category, shift, sidebarMode) {
            if (!shift || isBlankShift(shift.id)) return false;
            // 对于显式归属当前模块的班次，以模块归类为准，不再被通用“教学/普通/外出”规则提前排除。
            if (!isExplicitModuleShift(category, shift) && isSidebarExcludedShift(shift)) return false;
            if (sidebarMode === 'module_all_valid') return true;
            if (sidebarMode === 'module_duty_only') return isSidebarDutyShift(shift);
            if (sidebarMode === 'module_clinic_only') return isClinicShift(shift.id);
            if (sidebarMode === 'module_keyword') {
                const keywords = getSidebarKeywordList(category);
                if (!keywords.length) return false;
                const targetText = `${String(shift.name || '')} ${String(shift.short || '')}`.toLowerCase();
                return keywords.some(keyword => targetText.includes(keyword.toLowerCase()));
            }
            if (sidebarMode === 'module_shift_whitelist') {
                return getSidebarShiftIdSet(category).has(shift.id);
            }
            return false;
        }

        function shouldDisplaySidebarShift(doc, shift) {
            if (!shift) return false;
            const category = doc?.category || '';
            if (!isModuleEnabled(category)) return false;
            const sidebarMode = getModuleSidebarMode(category);
            if (sidebarMode === 'hidden') return false;
            if (sidebarMode !== 'default') {
                return matchesModuleSidebarMode(category, shift, sidebarMode);
            }
            if (category === 'second') {
                return isSidebarDutyShift(shift);
            }
            if (isTeachingClinicSidebarShift(shift)) {
                return isTeachingClinicSidebarDoctor(doc);
            }
            if (category === 'third') return false;
            if (isSidebarExcludedShift(shift)) return false;
            if (isTeachingClinicSidebarShift(shift)) return false;
            if (isCustomModuleCategory(category)) return true;
            return isSidebarDutyShift(shift) || isSidebarFollowShift(shift) || isSidebarAssistantShift(shift) || isSidebarDayShift(shift) || isSidebarOtherShift(category, shift);
        }

        function shouldShowSidebarPhone(doc, shift) {
            const category = doc?.category || '';
            if (shouldShowModuleSidebarPhone(category)) return true;
            return isDutyShiftWithPhone(shift.id);
        }

        function isDutyShiftWithPhone(shiftId) {
            const shift = getShiftDefinition(shiftId);
            return ['first_oncall', 'second_oncall'].includes(shift?.systemKey);
        }

        function isSidebarDutyShift(shift) {
            return ['first_oncall', 'second_oncall'].includes(shift?.systemKey);
        }

        function isSidebarFollowShift(shift) {
            return shift?.systemKey === 'trainee_follow' || Boolean(shift?.name && shift.name.includes('跟值'));
        }

        function isSidebarAssistantShift(shift) {
            return shift?.systemKey === 'assistant' || Boolean(shift?.name && shift.name.includes('副班'));
        }

        function isSidebarDayShift(shift) {
            const shiftName = String(shift?.name || '').trim();
            return shift?.systemKey === 'day' || /^白(?:\d+)?班$/i.test(shiftName) || shiftName.includes('白班');
        }

        function isSidebarOtherShift(category, shift) {
            if (!shift || category === 'second' || category === 'third') return false;
            const isCustomOnCallLikeShift = !shift.systemKey && /值|夜|急诊|备班|留守|听班/i.test(shift.name || '');
            return isCustomOnCallLikeShift;
        }

        function getSidebarRowKey(doc, shift) {
            if (!shift) return '';
            const category = doc?.category || '';
            if (!isModuleEnabled(category)) return '';
            const sidebarMode = getModuleSidebarMode(category);
            if (sidebarMode !== 'default') {
                return matchesModuleSidebarMode(category, shift, sidebarMode) ? `module:${category}` : '';
            }
            if (isSidebarDutyShift(shift)) return 'duty';
            if (isSidebarFollowShift(shift)) return 'follow';
            if (isTeachingClinicSidebarShift(shift) && isTeachingClinicSidebarDoctor(doc)) return 'clinic';
            if (isSidebarAssistantShift(shift)) return 'assistant';
            if (isSidebarDayShift(shift)) return 'day';
            if (isCustomModuleCategory(category)) return `module:${category}`;
            if (isSidebarOtherShift(category, shift)) return 'other';
            return '';
        }

        function getSidebarRowGroupOrder(rowKey, shift) {
            if (rowKey === 'clinic') {
                if (isClinicShift(shift.id)) return 1;
                return 2;
            }
            if (rowKey === 'duty') {
                if (shift.systemKey === 'first_oncall') return 1;
                if (shift.systemKey === 'second_oncall') return 2;
            }
            if (rowKey === 'follow') {
                return 1;
            }
            if (rowKey === 'assistant') {
                if (shift.systemKey === 'assistant') return 1;
            }
            if (rowKey === 'day') {
                if (shift.systemKey === 'day') return 1;
            }
            if (rowKey.startsWith('module:')) {
                return 1;
            }
            return 10;
        }

        function getSidebarGroupKey(rowKey, doc, shift) {
            if (rowKey.startsWith('module:')) {
                const category = doc?.category || rowKey.replace('module:', '');
                if (getModuleSidebarGroupMode(category) === 'split_by_doctor') {
                    return `${shift.id}::${doc.id}`;
                }
            }
            return shift.id;
        }

        function getSidebarGroupNames(group) {
            return (group?.members || []).map(member => member.name).join('、');
        }

        function getSidebarMemberCategoryOrder(rowKey, member) {
            if (!['assistant', 'day'].includes(rowKey)) return 0;
            const category = String(member?.category || '').trim();
            if (category === 'first') return 0;
            if (category === 'trainee') return 1;
            return 2;
        }

        function shouldShowSidebarMemberTitleBadge(row, member) {
            return !!(row?.showTitles && row?.titleMode === 'badge' && member?.title);
        }

        function getSidebarMemberDisplayText(row, member) {
            const details = [];
            if (row?.showTitles && row?.titleMode !== 'badge' && member?.title) {
                details.push(member.title);
            }
            if (row?.showPhones && row?.phoneMode === 'inline_after_name' && member?.phoneText) {
                details.push(member.phoneText);
            }
            if (details.length > 0) {
                return `${member.name}（${details.join('，')}）`;
            }
            return member?.name || '';
        }

        function shouldShowSidebarMemberPhoneBadge(row, member) {
            return !!(row?.showPhones && row?.phoneMode === 'badge_after_name' && member?.phoneText);
        }

        function getSidebarGroupDisplayText(row, group) {
            return (group?.members || []).map(member => getSidebarMemberDisplayText(row, member)).join('、');
        }

        function getSidebarGroupPhones(group) {
            return (group?.members || [])
                .filter(member => member.phoneText)
                .map(member => `${member.name} ${member.phoneText}`)
                .join('；');
        }

        function shouldShowSidebarGroupCount(row, group) {
            const countMode = String(row?.countMode || 'hidden');
            const memberCount = Array.isArray(group?.members) ? group.members.length : 0;
            if (memberCount <= 0) return false;
            if (countMode === 'always') return true;
            if (countMode === 'multi_only') return memberCount > 1;
            return false;
        }

        function getSidebarGroupCountText(group) {
            const memberCount = Array.isArray(group?.members) ? group.members.length : 0;
            return `${memberCount}人`;
        }

        function getSidebarRowPhones(row) {
            if (row?.showPhones === false || row?.phoneMode === 'inline_after_name' || row?.phoneMode === 'badge_after_name') return '';
            return (row?.groups || [])
                .map(group => getSidebarGroupPhones(group))
                .filter(Boolean)
                .join('；');
        }

        function getReadableTextColor(backgroundColor) {
            const color = normalizeSidebarAccentColor(backgroundColor);
            if (!color) return '#374151';
            const red = parseInt(color.slice(1, 3), 16);
            const green = parseInt(color.slice(3, 5), 16);
            const blue = parseInt(color.slice(5, 7), 16);
            const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
            return brightness >= 150 ? '#111827' : '#ffffff';
        }

        function toSidebarTint(backgroundColor, alpha = 0.12) {
            const color = normalizeSidebarAccentColor(backgroundColor);
            if (!color) return '';
            const red = parseInt(color.slice(1, 3), 16);
            const green = parseInt(color.slice(3, 5), 16);
            const blue = parseInt(color.slice(5, 7), 16);
            return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        }

        function getSidebarRowStyle(row) {
            const accentColor = normalizeSidebarAccentColor(row?.accentColor || '');
            const isEmptyRow = Array.isArray(row?.groups) && row.groups.length === 0;
            if (!accentColor && !isEmptyRow) return null;
            if (!accentColor && isEmptyRow) {
                return {
                    borderStyle: 'dashed',
                    borderColor: '#d7dee8',
                    backgroundColor: '#fbfcfe',
                    opacity: 0.88
                };
            }
            return {
                borderLeft: `4px solid ${accentColor}`,
                backgroundColor: isEmptyRow ? toSidebarTint(accentColor, 0.02) : toSidebarTint(accentColor, 0.06),
                opacity: isEmptyRow ? 0.84 : 1
            };
        }

        function getSidebarRowLabelStyle(row) {
            const accentColor = normalizeSidebarAccentColor(row?.accentColor || '');
            if (!accentColor) return null;
            return {
                backgroundColor: accentColor,
                borderColor: accentColor,
                color: getReadableTextColor(accentColor)
            };
        }

        function getSidebarRowEmptyText(row) {
            const label = String(row?.label || '').trim();
            if (label && row?.showLabel === false) {
                return `${label}今日暂无安排`;
            }
            return '今日暂无安排';
        }

        // --- Methods ---
        async function handleLogin() {
            const username = loginForm.value.username.trim();
            const password = loginForm.value.password;

            if (!username || !password) {
                showAlert('请输入账号和密码', 'error');
                return;
            }

            isSubmittingLogin.value = true;
            try {
                const { token, user } = await apiFetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                persistToken(token);
                currentUser.value = user;
                showLoginPanel.value = false;
                loginForm.value = { username: '', password: '' };
                await fetchData();
                if (user.role === ROLE_TERMINAL) {
                    await loadAdminAccounts();
                }
                showAlert(`欢迎登录，${user.displayName}`);
            } catch (error) {
                showAlert(error.message || '登录失败', 'error');
            } finally {
                isSubmittingLogin.value = false;
            }
        }

        async function logout() {
            try {
                if (authToken.value) {
                    await apiFetch('/api/auth/logout', { method: 'POST' });
                }
            } catch (error) {
                console.error('Error logging out:', error);
            } finally {
                clearSession(true);
                await activateGuestSession(true);
            }
        }

        function ensureCanEdit(message = '游客角色仅可查看排班信息，不能执行编辑操作') {
            if (canEditData.value) return true;
            showAlert(message, 'error');
            return false;
        }

        function ensureTerminalAdmin(message = '仅终端管理员可执行该操作') {
            if (canManageAdmins.value) return true;
            showAlert(message, 'error');
            return false;
        }

        function openShiftManager() {
            if (!ensureCanEdit()) return;
            closePrimaryManagerModals();
            showShiftManager.value = true;
        }

        function openDoctorManager() {
            if (!ensureCanEdit()) return;
            closePrimaryManagerModals();
            showDoctorModal.value = true;
        }

        function getNoticeTextLength(field) {
            const html = String(notices.value?.[field] || '');
            // Create a temp div to strip HTML tags for character count
            const temp = document.createElement('div');
            temp.innerHTML = html;
            return temp.textContent.trim().length;
        }

        function isNoticeEmpty(field) {
            return getNoticeTextLength(field) === 0;
        }

        function focusNoticeEditor(field) {
            const editor = field === 'teaching' ? teachingEditor : specialEditor;
            if (!editor) return;
            editor.focus();
            const length = Math.max(0, editor.getLength() - 1);
            editor.setSelection(length, 0, 'silent');
        }

        function getNoticeLastUpdatedLabel(field) {
            const rawValue = noticeUpdatedAt.value[field];
            const parsed = parseNoticeTimestamp(rawValue);
            if (!parsed) {
                return canEditData.value ? '当前会话暂无编辑记录' : '暂无更新时间记录';
            }
            return `最近更新 ${parsed.toLocaleString()}`;
        }

        async function copyNotice(field) {
            const html = String(notices.value?.[field] || '');
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const text = temp.textContent;
            
            if (!text.trim()) {
                showAlert('当前内容为空，暂无可复制内容', 'error');
                return;
            }

            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }
                showAlert('内容已复制');
            } catch (error) {
                console.error('Copy notice failed:', error);
                showAlert('复制失败，请手动复制', 'error');
            }
        }

        function appendNoticeTimestamp(field) {
            if (!ensureCanEdit()) return;
            const now = new Date();
            const timestamp = `[${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}] `;
            
            const editor = field === 'teaching' ? teachingEditor : specialEditor;
            if (editor) {
                const range = editor.getSelection(true);
                editor.insertText(range.index, timestamp, 'bold', true);
                editor.setSelection(range.index + timestamp.length);
            }
        }

        function clearNotice(field, label) {
            if (!ensureCanEdit()) return;
            const html = String(notices.value?.[field] || '');
            if (!html || html === '<p><br></p>') return;
            
            if (!confirm(`确定要清空【${label}】吗？`)) return;
            
            const editor = field === 'teaching' ? teachingEditor : specialEditor;
            if (editor) {
                editor.setText('');
            }
            setNoticeUpdatedAt(field, new Date());
            notices.value[field] = '';
            localStorage.removeItem(DRAFT_KEY_PREFIX + field);
            showAlert(`${label}已清空`);
        }

        function initializeGroupDoctorIds() {
            autoScheduleConfig.value.groupDoctorIds = availableGroupDoctors.value.map(doc => doc.id);
        }

        function activateGroupAutoSchedule() {
            if (!ensureCanEdit()) return;
            autoScheduleConfig.value.mode = 'group';
            if (!autoScheduleConfig.value.groupCategory) {
                autoScheduleConfig.value.groupCategory = 'first';
            }
            initializeGroupDoctorIds();
        }

        function openAutoScheduleModal() {
            if (!ensureCanEdit()) return;
            if (autoScheduleConfig.value.mode === 'group') {
                initializeGroupDoctorIds();
            }
            autoScheduleConfig.value.fixedWeekdays = getDefaultFixedWeekdaysForCategory(activeAutoCategory.value);
            showAutoSchedule.value = true;
        }

        async function openAdminManager() {
            if (!ensureTerminalAdmin()) return;
            await loadAdminAccounts();
            resetAdminForm();
            showAdminManager.value = true;
        }

        function openDepartmentManager() {
            if (!ensureTerminalAdmin('仅终端管理员可管理科室')) return;
            newDepartmentName.value = '';
            duplicateDepartmentName.value = currentDepartment.value ? `${currentDepartment.value.name}-副本` : '';
            syncDepartmentDraftNames();
            showDepartmentManager.value = true;
        }

        function closeDepartmentManager() {
            showDepartmentManager.value = false;
        }

        function openModuleManager() {
            if (!ensureCanEdit()) return;
            closePrimaryManagerModals();
            resetNewModuleForm();
            showNewModuleForm.value = false;
            moduleManagerSelectedModuleId.value = 'all';
            showModuleManager.value = true;
        }

        function closeModuleManager() {
            showModuleManager.value = false;
        }

        function toggleNewModuleForm() {
            showNewModuleForm.value = !showNewModuleForm.value;
        }

        function getModuleMeta(moduleId) {
            return moduleMap.value.get(moduleId) || null;
        }

        function isDefaultModule(moduleId) {
            return DEFAULT_MODULE_ID_SET.has(moduleId);
        }

        function getModuleUsage(moduleId) {
            return moduleUsageStats.value.get(moduleId) || { doctorCount: 0, shiftCount: 0 };
        }

        function resequenceModules(nextModules) {
            // 直接按传入数组的顺序重新分配 order 字段，不再在内部重新排序
            // 这样 moveModule 的交换操作才能生效
            modules.value = normalizeModules(
                [...nextModules].map((module, index) => ({
                    ...module,
                    order: index + 1
                }))
            );
        }

        function canMoveModuleUp(moduleId) {
            const index = allModulesSorted.value.findIndex(module => module.id === moduleId);
            return index > 0;
        }

        function canMoveModuleDown(moduleId) {
            const index = allModulesSorted.value.findIndex(module => module.id === moduleId);
            return index > -1 && index < allModulesSorted.value.length - 1;
        }

        function moveModule(moduleId, direction) {
            if (!ensureCanEdit()) return;
            const orderedModules = [...allModulesSorted.value];
            const index = orderedModules.findIndex(module => module.id === moduleId);
            if (index === -1) return;
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= orderedModules.length) return;
            [orderedModules[index], orderedModules[targetIndex]] = [orderedModules[targetIndex], orderedModules[index]];
            resequenceModules(orderedModules);
        }

        function normalizeModuleEditableFields(moduleId) {
            const module = getModuleMeta(moduleId);
            if (!module) return;
            const normalized = normalizeScheduleModule(module, module.order - 1);
            if (!normalized.clearLabel) {
                normalized.clearLabel = `清空${normalized.groupName}`;
            }
            modules.value = normalizeModules(modules.value.map(item => item.id === moduleId ? normalized : item));
        }

        function createModule() {
            if (!ensureCanEdit()) return;
            const doctorLabel = String(newModule.value.doctorLabel || '').trim();
            const groupName = String(newModule.value.groupName || '').trim();
            const clearLabel = String(newModule.value.clearLabel || '').trim() || `清空${groupName || doctorLabel || '模块排班'}`;
            
            if (!doctorLabel) {
                showAlert('请填写模块对应的人员类别名称', 'error');
                return;
            }
            if (!groupName) {
                showAlert('请填写模块表格名称', 'error');
                return;
            }

            // 检查重名
            const isDuplicate = modules.value.some(m => 
                m.doctorLabel.trim() === doctorLabel || 
                m.groupName.trim() === groupName
            );
            if (isDuplicate && !confirm(`已存在名称相似的模块（“${doctorLabel}”或“${groupName}”），确定要继续创建吗？`)) {
                return;
            }

            if (newModuleSidebarValidationMessages.value.length > 0) {
                showAlert(newModuleSidebarValidationMessages.value[0], 'error');
                return;
            }

            const nextOrder = allModulesSorted.value.length + 1;
            const sidebarMode = newModule.value.sidebarMode || DEFAULT_CUSTOM_SIDEBAR_MODE;
            
            modules.value = normalizeModules([
                ...modules.value,
                {
                    id: createCustomModuleId(),
                    doctorLabel,
                    groupName,
                    clearLabel,
                    order: nextOrder,
                    enabled: newModule.value.enabled !== false,
                    allowFixedWeekdays: !!newModule.value.allowFixedWeekdays,
                    allowMultiAssign: newModule.value.allowMultiAssign !== false,
                    sidebarMode,
                    sidebarLabel: String(newModule.value.sidebarLabel || '').trim(),
                    sidebarOrder: clampNumber(newModule.value.sidebarOrder, 1, 999, 100 + (nextOrder * 10)),
                    sidebarShowLabel: newModule.value.sidebarShowLabel !== false,
                    sidebarShowPhone: !!newModule.value.sidebarShowPhone,
                    sidebarPhoneMode: newModule.value.sidebarPhoneMode || 'separate_line',
                    sidebarShowTitle: !!newModule.value.sidebarShowTitle,
                    sidebarTitleMode: newModule.value.sidebarTitleMode || 'inline',
                    sidebarShowShiftName: newModule.value.sidebarShowShiftName !== false,
                    sidebarGroupMode: newModule.value.sidebarGroupMode || 'merge_by_shift',
                    sidebarDensity: newModule.value.sidebarDensity || 'standard',
                    sidebarShowIfEmpty: !!newModule.value.sidebarShowIfEmpty,
                    sidebarAccentColor: normalizeSidebarAccentColor(newModule.value.sidebarAccentColor),
                    sidebarKeywordsText: String(newModule.value.sidebarKeywordsText || '').trim(),
                    sidebarShiftIds: Array.isArray(newModule.value.sidebarShiftIds) ? [...newModule.value.sidebarShiftIds] : []
                }
            ]);
            resetNewModuleForm();
            showAlert('新模块已创建');
        }

        function toggleModuleEnabled(moduleId) {
            if (!ensureCanEdit()) return;
            const module = getModuleMeta(moduleId);
            if (!module) return;
            const isEnabling = module.enabled === false;
            if (!isEnabling) {
                const disabledReason = getModuleToggleDisabledReason(moduleId);
                if (disabledReason) {
                    showAlert(disabledReason, 'error');
                    return;
                }
                const usage = getModuleUsage(moduleId);
                if ((usage.doctorCount > 0 || usage.shiftCount > 0)
                    && !confirm(`模块“${module.groupName}”当前仍有关联数据。\n\n停用后，该模块下的人员、班次和既有排班会保留，但不会继续在主排班界面展示；后续重新启用后可恢复使用。\n\n确定继续停用吗？`)) {
                    return;
                }
            }
            modules.value = normalizeModules(modules.value.map(item => item.id === moduleId ? { ...item, enabled: isEnabling } : item));
            showAlert(isEnabling ? `模块“${module.groupName}”已启用` : `模块“${module.groupName}”已停用`);
        }

        function deleteModule(moduleId) {
            if (!ensureCanEdit()) return;
            const module = getModuleMeta(moduleId);
            if (!module) return;
            if (isDefaultModule(moduleId)) {
                const deleteDisabledReason = getModuleDeleteDisabledReason(moduleId);
                if (deleteDisabledReason) {
                    showAlert(deleteDisabledReason, 'error');
                    return;
                }
            }
            const disabledReason = getModuleDeleteDisabledReason(moduleId);
            if (disabledReason) {
                showAlert(disabledReason, 'error');
                return;
            }
            const usage = getModuleUsage(moduleId);
            const moduleDoctorIds = doctors.value
                .filter(doc => doc.category === moduleId)
                .map(doc => doc.id);
            const cleanupMessage = (usage.doctorCount > 0 || usage.shiftCount > 0)
                ? `\n\n该模块下的 ${usage.doctorCount} 名人员会一并删除，相关排班会同步清理；仅属于该模块的 ${usage.shiftCount} 个班次也会同步删除。`
                : '';
            if (!confirm(`确定删除模块“${module.groupName}”吗？${cleanupMessage}`)) return;

            doctors.value = doctors.value.filter(doc => doc.category !== moduleId);

            Object.keys(scheduleData.value).forEach(date => {
                if (!scheduleData.value[date]) return;
                moduleDoctorIds.forEach(docId => {
                    if (scheduleData.value[date][docId]) {
                        delete scheduleData.value[date][docId];
                    }
                });
                if (Object.keys(scheduleData.value[date]).length === 0) {
                    delete scheduleData.value[date];
                }
            });

            const removedShiftIds = new Set();
            shiftTypes.value = normalizeShiftTypes(
                shiftTypes.value
                    .map(shift => {
                        const categories = Array.isArray(shift.categories) ? shift.categories : [];
                        if (!categories.includes(moduleId)) return shift;

                        const nextCategories = categories.filter(category => category !== moduleId);
                        if (!nextCategories.length && !shift.systemKey) {
                            removedShiftIds.add(shift.id);
                            return null;
                        }

                        return {
                            ...shift,
                            categories: nextCategories
                        };
                    })
                    .filter(Boolean)
            );

            if (removedShiftIds.size > 0) {
                Object.keys(scheduleData.value).forEach(date => {
                    if (!scheduleData.value[date]) return;
                    Object.keys(scheduleData.value[date]).forEach(docId => {
                        const shiftIds = normalizeDoctorDay(date, docId).filter(shiftId => !removedShiftIds.has(shiftId));
                        if (shiftIds.length === 0) {
                            delete scheduleData.value[date][docId];
                        } else {
                            scheduleData.value[date][docId] = shiftIds;
                        }
                    });
                    if (Object.keys(scheduleData.value[date]).length === 0) {
                        delete scheduleData.value[date];
                    }
                });
            }

            notices.value.teachingClinicMembers = (notices.value.teachingClinicMembers || []).filter(docId => !moduleDoctorIds.includes(docId));
            if (moduleDoctorIds.includes(autoScheduleConfig.value.doctorId)) {
                autoScheduleConfig.value.doctorId = '';
            }
            if (newDoctor.value.category === moduleId) {
                newDoctor.value.category = enabledModules.value.find(item => item.id !== moduleId)?.id || 'first';
            }
            if (filterCategory.value === moduleId) {
                filterCategory.value = 'all';
            }
            if (autoScheduleConfig.value.groupCategory === moduleId) {
                autoScheduleConfig.value.groupCategory = enabledModules.value.find(item => item.id !== moduleId)?.id || 'first';
            }
            autoScheduleConfig.value.groupDoctorIds = autoScheduleConfig.value.groupDoctorIds.filter(docId => !moduleDoctorIds.includes(docId));
            if (moduleDoctorIds.includes(popup.value.docId)) {
                closePopup();
            }

            resequenceModules(modules.value.filter(item => item.id !== moduleId));
            showAlert('模块已删除');
        }

        async function switchDepartment(departmentId) {
            const nextDepartmentId = String(departmentId || '').trim();
            if (!nextDepartmentId || nextDepartmentId === currentDepartmentId.value) return;

            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
                await saveData(true);
            }

            showDoctorModal.value = false;
            showShiftManager.value = false;
            showAutoSchedule.value = false;
            showHistoryManager.value = false;
            showModuleManager.value = false;
            closePopup();

            await fetchData(nextDepartmentId);
            showAlert(`已切换到 ${currentDepartment.value?.name || '所选科室'}`);
        }

        async function createDepartment(mode = 'blank') {
            if (!ensureCanEdit()) return;
            const isDuplicate = mode === 'duplicate';
            const name = String(isDuplicate ? duplicateDepartmentName.value : newDepartmentName.value).trim();
            if (!name) {
                showAlert('请填写科室名称', 'error');
                return;
            }

            isSubmittingDepartment.value = true;
            try {
                const payload = { name };
                if (isDuplicate && currentDepartmentId.value) {
                    payload.sourceDepartmentId = currentDepartmentId.value;
                    payload.options = { ...departmentCopyOptions.value };
                }
                const result = await apiFetch('/api/departments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                departments.value = Array.isArray(result.departments) ? result.departments : departments.value;
                syncDepartmentDraftNames();
                await fetchData(result.currentDepartmentId || currentDepartmentId.value);
                if (isDuplicate) {
                    duplicateDepartmentName.value = '';
                    showDepartmentCopyOptions.value = false;
                    showAlert('科室复制成功');
                } else {
                    newDepartmentName.value = '';
                    showAlert('新科室创建成功');
                }
                showDepartmentManager.value = false;
            } catch (error) {
                showAlert(error.message || '科室创建失败', 'error');
            } finally {
                isSubmittingDepartment.value = false;
            }
        }

        async function archiveDepartment(departmentId) {
            if (!ensureCanEdit()) return;
            const department = departments.value.find(item => item.id === departmentId);
            if (!department) return;
            if (departments.value.filter(d => !d.archived).length <= 1 && !department.archived) {
                showAlert('系统至少需要保留一个启用状态的科室', 'error');
                return;
            }
            if (!confirm(`确定要禁用科室“${department.name}”吗？禁用后该科室将不再出现在切换列表中。`)) return;

            isSubmittingDepartment.value = true;
            try {
                const result = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}/archive`, {
                    method: 'PATCH'
                });
                departments.value = Array.isArray(result.departments) ? result.departments : departments.value;
                syncDepartmentDraftNames();
                if (departmentId === currentDepartmentId.value) {
                    const fallback = departments.value.find(d => !d.archived) || departments.value[0];
                    await fetchData(fallback.id);
                }
                showAlert(`科室“${department.name}”已禁用`);
            } catch (error) {
                showAlert(error.message || '科室禁用失败', 'error');
            } finally {
                isSubmittingDepartment.value = false;
            }
        }

        async function unarchiveDepartment(departmentId) {
            if (!ensureCanEdit()) return;
            const department = departments.value.find(item => item.id === departmentId);
            if (!department) return;

            isSubmittingDepartment.value = true;
            try {
                const result = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}/unarchive`, {
                    method: 'PATCH'
                });
                departments.value = Array.isArray(result.departments) ? result.departments : departments.value;
                syncDepartmentDraftNames();
                showAlert(`科室“${department.name}”已重新启用`);
            } catch (error) {
                showAlert(error.message || '科室启用失败', 'error');
            } finally {
                isSubmittingDepartment.value = false;
            }
        }

        function openDepartmentCopy() {
            if (!currentDepartment.value) return;
            duplicateDepartmentName.value = `${currentDepartment.value.name}-副本`;
            showDepartmentCopyOptions.value = true;
        }

        function canDeleteDepartment(departmentId) {
            return departments.value.length > 1 && !!departmentId;
        }

        function canMoveDepartmentUp(departmentId) {
            return departments.value.findIndex(item => item.id === departmentId) > 0;
        }

        function canMoveDepartmentDown(departmentId) {
            const index = departments.value.findIndex(item => item.id === departmentId);
            return index >= 0 && index < departments.value.length - 1;
        }

        async function renameDepartment(departmentId) {
            if (!ensureCanEdit()) return;
            const department = departments.value.find(item => item.id === departmentId);
            if (!department) return;
            const name = String(departmentDraftNames.value[departmentId] || '').trim();
            if (!name) {
                showAlert('请填写科室名称', 'error');
                return;
            }

            isSubmittingDepartment.value = true;
            try {
                const result = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                departments.value = Array.isArray(result.departments) ? result.departments : departments.value;
                syncDepartmentDraftNames();
                if (result.currentDepartmentId) {
                    persistActiveDepartmentId(result.currentDepartmentId);
                }
                showAlert(`科室“${department.name}”已重命名`);
            } catch (error) {
                showAlert(error.message || '科室重命名失败', 'error');
            } finally {
                isSubmittingDepartment.value = false;
            }
        }

        async function moveDepartment(departmentId, direction) {
            if (!ensureCanEdit()) return;
            const currentIndex = departments.value.findIndex(item => item.id === departmentId);
            if (currentIndex < 0) return;
            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= departments.value.length) return;

            const orderedIds = departments.value.map(item => item.id);
            [orderedIds[currentIndex], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[currentIndex]];

            isSubmittingDepartment.value = true;
            try {
                const result = await apiFetch('/api/departments/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderedIds,
                        currentDepartmentId: currentDepartmentId.value
                    })
                });
                departments.value = Array.isArray(result.departments) ? result.departments : departments.value;
                syncDepartmentDraftNames();
                if (result.currentDepartmentId) {
                    persistActiveDepartmentId(result.currentDepartmentId);
                }
                showAlert(direction === 'up' ? '科室已上移' : '科室已下移');
            } catch (error) {
                showAlert(error.message || '科室排序失败', 'error');
            } finally {
                isSubmittingDepartment.value = false;
            }
        }

        async function deleteDepartment(departmentId) {
            if (!ensureCanEdit()) return;
            const department = departments.value.find(item => item.id === departmentId);
            if (!department) return;
            if (!canDeleteDepartment(departmentId)) {
                showAlert('系统至少需要保留一个科室', 'error');
                return;
            }
            if (!confirm(`确定删除科室“${department.name}”吗？该科室下的人员、班次、排班和历史记录都会一并删除。`)) {
                return;
            }

            isSubmittingDepartment.value = true;
            try {
                const result = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}?departmentId=${encodeURIComponent(currentDepartmentId.value)}`, {
                    method: 'DELETE'
                });
                departments.value = Array.isArray(result.departments) ? result.departments : departments.value;
                syncDepartmentDraftNames();
                await fetchData(result.currentDepartmentId || currentDepartmentId.value);
                showAlert(`科室“${department.name}”已删除`);
            } catch (error) {
                showAlert(error.message || '科室删除失败', 'error');
            } finally {
                isSubmittingDepartment.value = false;
            }
        }

        async function openHistoryManager() {
            if (!ensureCanEdit()) return;
            await loadHistoryRecords();
            showHistoryManager.value = true;
        }

        function formatHistoryTime(isoTime) {
            if (!isoTime) return '';
            const date = new Date(isoTime);
            if (Number.isNaN(date.getTime())) return isoTime;
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        async function restoreHistorySnapshot(historyId, successMessage = '历史排班记录已恢复') {
            try {
                await apiFetch(`/api/history/${historyId}/restore?departmentId=${encodeURIComponent(currentDepartmentId.value)}`, {
                    method: 'POST'
                });
                await fetchData(currentDepartmentId.value);
                if (showHistoryManager.value) {
                    await loadHistoryRecords();
                }
                showAlert(successMessage);
            } catch (error) {
                throw error;
            }
        }

        async function restoreHistoryRecord(historyId) {
            if (!ensureCanEdit()) return;
            if (!confirm('确定要恢复到这条历史排班记录吗？当前数据会先自动留存后再恢复。')) return;

            try {
                await restoreHistorySnapshot(historyId, '历史排班记录已恢复');
            } catch (error) {
                showAlert(error.message || '历史排班恢复失败', 'error');
            }
        }

        async function deleteHistoryRecord(historyId) {
            if (!ensureCanEdit()) return;
            if (!confirm('确定删除这条历史排班记录吗？删除后将无法恢复。')) return;

            try {
                const result = await apiFetch(`/api/history/${encodeURIComponent(historyId)}?departmentId=${encodeURIComponent(currentDepartmentId.value)}`, {
                    method: 'DELETE'
                });
                historyRecords.value = Array.isArray(result.history) ? result.history : [];
                showAlert('历史排班记录已删除');
            } catch (error) {
                showAlert(error.message || '历史排班记录删除失败', 'error');
            }
        }

        async function runClearActionWithUndo(snapshotSummary, successMessage, action) {
            if (!ensureCanEdit()) return;
            closeClearMenu();

            try {
                const historyEntry = await createManualHistorySnapshot(snapshotSummary);
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                action();
                preserveRecentClearActionOnSave = true;
                await saveData(true, { skipAutoHistorySnapshot: true });
                recentClearAction.value = historyEntry
                    ? {
                        historyId: historyEntry.id,
                        summary: historyEntry.summary
                    }
                    : null;
                showAlert(successMessage);
            } catch (error) {
                preserveRecentClearActionOnSave = false;
                await fetchData(currentDepartmentId.value);
                showAlert(error.message || '清空失败，请稍后重试', 'error');
                return;
            } finally {
                preserveRecentClearActionOnSave = false;
            }
        }

        async function undoRecentClearAction() {
            if (!ensureCanEdit()) return;
            if (!recentClearAction.value?.historyId) {
                showAlert('当前没有可撤销的清空操作', 'error');
                return;
            }
            if (!confirm(`确定撤销最近一次清空吗？将恢复到“${recentClearAction.value.summary}”对应的排班状态。`)) return;

            try {
                await restoreHistorySnapshot(recentClearAction.value.historyId, '最近一次清空已撤销');
                recentClearAction.value = null;
            } catch (error) {
                recentClearAction.value = null;
                showAlert(error.message || '撤销清空失败', 'error');
            }
        }

        function toggleLoginPanel() {
            showLoginPanel.value = !showLoginPanel.value;
        }

        function closeLoginPanel() {
            showLoginPanel.value = false;
        }

        function editAdminAccount(admin) {
            if (!ensureTerminalAdmin()) return;
            populateAdminForm(admin);
        }

        function cancelAdminEdit() {
            resetAdminForm();
        }

        async function createAdminAccount() {
            if (!ensureTerminalAdmin()) return;

            const role = newAdmin.value.role === ROLE_TERMINAL ? ROLE_TERMINAL : ROLE_ADMIN;
            const payload = {
                username: newAdmin.value.username.trim(),
                password: newAdmin.value.password,
                role,
                displayName: newAdmin.value.displayName.trim(),
                departmentIds: role === ROLE_ADMIN ? normalizeAdminDepartmentIds(newAdmin.value.departmentIds) : []
            };

            if (!payload.username) {
                showAlert('请填写管理员账号', 'error');
                return;
            }
            if (!isEditingAdminAccount.value && !payload.password) {
                showAlert('请填写管理员密码', 'error');
                return;
            }
            if (payload.role === ROLE_ADMIN && payload.departmentIds.length === 0) {
                showAlert('请至少为普通管理员分配一个科室', 'error');
                return;
            }

            try {
                await apiFetch(isEditingAdminAccount.value
                    ? `/api/admins/${encodeURIComponent(editingAdminId.value)}`
                    : '/api/admins', {
                    method: isEditingAdminAccount.value ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const successMessage = isEditingAdminAccount.value ? '管理员账号已更新' : '管理员账号创建成功';
                resetAdminForm();
                await loadAdminAccounts();
                showAlert(successMessage);
            } catch (error) {
                showAlert(error.message || (isEditingAdminAccount.value ? '管理员账号更新失败' : '管理员账号创建失败'), 'error');
            }
        }

        async function deleteAdminAccount(adminId) {
            if (!ensureTerminalAdmin()) return;
            if (!confirm('确定要删除该管理员账号吗？')) return;

            try {
                await apiFetch(`/api/admins/${adminId}`, {
                    method: 'DELETE'
                });
                if (editingAdminId.value === adminId) {
                    resetAdminForm();
                }
                await loadAdminAccounts();
                showAlert('管理员账号已删除');
            } catch (error) {
                showAlert(error.message || '删除管理员账号失败', 'error');
            }
        }

        function handleScheduleCellClick(doc, day, event) {
            if (!ensureCanEdit()) return;
            if (!ensureNotLocked(day.dateStr)) return;
            openShiftPopup(doc, day, event);
        }

        function getStartOfWeek(date) {
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
            return new Date(d.setDate(diff));
        }

        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getDayOfWeekStr(date) {
            const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return days[date.getDay()];
        }

        function generateMonthCalendar() {
            const [year, month] = currentMonth.value.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();
            const days = [];
            
            for (let i = 1; i <= daysInMonth; i++) {
                const date = new Date(year, month - 1, i);
                const dateStr = formatDate(date);
                const dayOfWeek = date.getDay();
                
                days.push({
                    date: date,
                    dateStr: dateStr,
                    dateNum: `${month}/${i}`,
                    dayOfWeek: getDayOfWeekStr(date),
                    isToday: dateStr === formatDate(today),
                    isWeekend: dayOfWeek === 0 || dayOfWeek === 6
                });
            }
            return days;
        }

        function generateWeekCalendar() {
            const days = [];
            let currentDate = new Date(currentWeekStart.value);
            
            for (let i = 0; i < 7; i++) {
                const dateStr = formatDate(currentDate);
                const dayOfWeek = currentDate.getDay();
                
                days.push({
                    date: new Date(currentDate),
                    dateStr: dateStr,
                    dateNum: `${currentDate.getMonth()+1}/${currentDate.getDate()}`,
                    dayOfWeek: getDayOfWeekStr(currentDate),
                    isToday: dateStr === formatDate(today),
                    isWeekend: dayOfWeek === 0 || dayOfWeek === 6
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }
            return days;
        }

        function prevPeriod() {
            if (viewMode.value === 'month') {
                const [year, month] = currentMonth.value.split('-').map(Number);
                const d = new Date(year, month - 2, 1);
                currentMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } else {
                const d = new Date(currentWeekStart.value);
                d.setDate(d.getDate() - 7);
                currentWeekStart.value = d;
            }
        }

        function nextPeriod() {
            if (viewMode.value === 'month') {
                const [year, month] = currentMonth.value.split('-').map(Number);
                const d = new Date(year, month, 1);
                currentMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } else {
                const d = new Date(currentWeekStart.value);
                d.setDate(d.getDate() + 7);
                currentWeekStart.value = d;
            }
        }

        // --- Doctor Management ---
        function createDoctorId() {
            return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        }

        function getDefaultDoctorName(module, sequence, usedNames) {
            const baseName = String(module?.doctorLabel || module?.groupName || '人员').trim() || '人员';
            let nextSequence = Math.max(1, Number(sequence) || 1);
            let candidate = `${baseName}${nextSequence}`;

            while (usedNames.has(candidate)) {
                nextSequence += 1;
                candidate = `${baseName}${nextSequence}`;
            }

            return candidate;
        }

        function fillDefaultDoctorsForModules(targetPerModule = 3) {
            if (!ensureCanEdit()) return;

            const target = clampNumber(targetPerModule, 3, 5, 3);
            const nextDoctors = [];
            const usedNames = new Set(
                doctors.value
                    .map(doc => String(doc?.name || '').trim())
                    .filter(Boolean)
            );

            enabledModules.value.forEach(module => {
                const moduleDoctors = doctors.value.filter(doc => doc.category === module.id);
                let nextSequence = moduleDoctors.length + 1;

                while (moduleDoctors.length + nextDoctors.filter(doc => doc.category === module.id).length < target) {
                    const name = getDefaultDoctorName(module, nextSequence, usedNames);
                    usedNames.add(name);
                    nextDoctors.push({
                        id: createDoctorId(),
                        name,
                        title: '主治医师',
                        category: module.id,
                        phone: '',
                        notes: ''
                    });
                    nextSequence += 1;
                }
            });

            if (!nextDoctors.length) {
                showAlert(`当前每个模块已至少配置 ${target} 人`);
                return;
            }

            doctors.value = [...doctors.value, ...nextDoctors];
            showAlert(`已按模块补齐默认人员，共新增 ${nextDoctors.length} 人`);
        }

        function addDoctor() {
            if (!ensureCanEdit()) return;
            if (newDoctor.value.name.trim()) {
                doctors.value.push({
                    id: createDoctorId(),
                    ...newDoctor.value,
                    name: newDoctor.value.name.trim(),
                    title: newDoctor.value.title.trim(),
                    phone: (newDoctor.value.phone || '').trim(),
                    notes: (newDoctor.value.notes || '').trim()
                });
                newDoctor.value = {
                    name: '',
                    title: '主治医师',
                    category: enabledModules.value[0]?.id || 'first',
                    phone: '',
                    notes: ''
                };
                showAlert('人员添加成功');
            }
        }

        function normalizeDoctorEditableFields(doc) {
            doc.name = (doc.name || '').trim();
            doc.title = (doc.title || '').trim();
            doc.phone = (doc.phone || '').trim();
            doc.notes = (doc.notes || '').trim();
            if (!doc.name) doc.name = '未命名人员';
            if (!doc.title) doc.title = '未填写';
        }

        function deleteDoctor(id) {
            if (!ensureCanEdit()) return;
            if(confirm('确定要删除该人员吗？相关的排班信息将一并移除。')) {
                doctors.value = doctors.value.filter(d => d.id !== id);
                // Remove from schedule
                Object.keys(scheduleData.value).forEach(date => {
                    if (scheduleData.value[date] && scheduleData.value[date][id]) {
                        delete scheduleData.value[date][id];
                    }
                });
                showAlert('人员已删除');
            }
        }

        function openCopyDoctorPopup(doctorId) {
            const doc = doctors.value.find(d => d.id === doctorId);
            if (!doc) return;
            const firstOther = enabledModules.value.find(m => m.id !== doc.category);
            copyDoctorPopup.value = { doctorId, targetModuleId: firstOther?.id || '' };
        }

        function closeCopyDoctorPopup() {
            copyDoctorPopup.value = { doctorId: null, targetModuleId: '' };
        }

        function copyDoctorToModule() {
            if (!ensureCanEdit()) return;
            const { doctorId, targetModuleId } = copyDoctorPopup.value;
            if (!doctorId || !targetModuleId) return;
            const source = doctors.value.find(d => d.id === doctorId);
            if (!source) return;
            doctors.value.push({
                id: createDoctorId(),
                name: source.name,
                title: source.title,
                category: targetModuleId,
                phone: source.phone || '',
                notes: source.notes || ''
            });
            closeCopyDoctorPopup();
            showAlert(`已将${source.name}复制到${getCategoryName(targetModuleId)}`);
        }

        function getAdjacentDoctorIndexInCategory(doctorId, direction) {
            const currentIndex = doctors.value.findIndex(doc => doc.id === doctorId);
            if (currentIndex === -1) return -1;

            const currentDoctor = doctors.value[currentIndex];
            const step = direction === 'up' ? -1 : 1;
            let index = currentIndex + step;

            while (index >= 0 && index < doctors.value.length) {
                if (doctors.value[index]?.category === currentDoctor.category) {
                    return index;
                }
                index += step;
            }

            return -1;
        }

        function canMoveDoctorUp(doctorId) {
            return getAdjacentDoctorIndexInCategory(doctorId, 'up') !== -1;
        }

        function canMoveDoctorDown(doctorId) {
            return getAdjacentDoctorIndexInCategory(doctorId, 'down') !== -1;
        }

        function moveDoctor(doctorId, direction) {
            if (!ensureCanEdit()) return;

            const currentIndex = doctors.value.findIndex(doc => doc.id === doctorId);
            const targetIndex = getAdjacentDoctorIndexInCategory(doctorId, direction);
            if (currentIndex === -1 || targetIndex === -1) return;

            const reorderedDoctors = [...doctors.value];
            const [doctor] = reorderedDoctors.splice(currentIndex, 1);
            reorderedDoctors.splice(targetIndex, 0, doctor);
            doctors.value = reorderedDoctors;
        }

        function getCategoryName(category) {
            return getModuleMeta(category)?.doctorLabel || '未知';
        }

        function getGroupName(groupKey) {
            return getModuleMeta(groupKey)?.groupName || getCategoryName(groupKey);
        }

        function getShiftDefinition(shiftId) {
            return shiftTypeMap.value.get(shiftId) || null;
        }

        function isFirstOnCallShift(shiftId) {
            const shift = getShiftDefinition(shiftId);
            return shift?.systemKey === 'first_oncall';
        }

        function isClinicShift(shiftId) {
            const shift = getShiftDefinition(shiftId);
            if (!shift) return false;
            // Built-in clinic shifts OR custom shift with "门诊" in name
            const isBuiltInClinic = ['morning', 'afternoon', 'fullday'].includes(shift.systemKey);
            const isCustomClinic = shift.name && shift.name.includes('门诊');
            return isBuiltInClinic || isCustomClinic;
        }

        function isTeachingShift(shiftId) {
            const shift = getShiftDefinition(shiftId);
            if (!shift) return false;
            return shift.systemKey === 'teaching' || /教学|PBL/i.test(shift.name || '');
        }

        function isFixedWeeklyShift(shift) {
            if (!shift) return false;
            return isClinicShift(shift.id) || isTeachingShift(shift.id);
        }

        function isGeneralShift(shiftId) {
            const shift = getShiftDefinition(shiftId);
            if (!shift) return false;
            // Built-in general shifts OR custom shift with "普通" or "办" in name
            const isBuiltInGeneral = ['general', 'general_secondary'].includes(shift.systemKey);
            const isCustomGeneral = shift.name && (shift.name.includes('普通') || shift.name.includes('办'));
            return isBuiltInGeneral || isCustomGeneral;
        }

        function isOtherNonClinicalShift(shiftId) {
            const shift = getShiftDefinition(shiftId);
            if (!shift) return false;
            return ['teaching', 'outside'].includes(shift.systemKey) || (shift.name && (shift.name.includes('教学') || shift.name.includes('外出')));
        }

        function isHoliday(dateStr) {
            return holidayDateSet.value.has(dateStr);
        }

        function isDateLocked(dateStr) {
            if (!dateStr || typeof dateStr !== 'string') return false;
            const month = dateStr.slice(0, 7);
            return lockedMonths.value.includes(month);
        }

        function ensureNotLocked(dateStr, options = {}) {
            if (!isDateLocked(dateStr)) return true;
            if (!options.silent) {
                showAlert(`${dateStr.slice(0, 7)} 所在月份已锁定，不能修改排班`, 'error');
            }
            return false;
        }

        const currentViewMonths = computed(() => {
            const months = new Set();
            calendarDays.value.forEach(day => months.add(day.dateStr.slice(0, 7)));
            return [...months];
        });

        const isCurrentPeriodLocked = computed(() => {
            const targetMonth = currentViewMonths.value[0];
            return targetMonth ? lockedMonths.value.includes(targetMonth) : false;
        });

        async function openHolidayManager() {
            if (!ensureCanEdit()) return;
            try {
                const resp = await apiFetch(`${API_BASE}/holidays`);
                if (Array.isArray(resp?.holidays)) holidays.value = [...resp.holidays];
            } catch (e) { console.error('加载节假日失败', e); }
            showHolidayManager.value = true;
        }

        async function addHoliday() {
            if (!ensureCanEdit()) return;
            const date = String(newHolidayDate.value || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                showAlert('请选择有效日期', 'error');
                return;
            }
            try {
                const resp = await apiFetch(`${API_BASE}/holidays`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
                if (Array.isArray(resp?.holidays)) holidays.value = [...resp.holidays];
                newHolidayDate.value = '';
                showAlert('节假日已添加');
            } catch (e) {
                showAlert(e?.message || '添加失败', 'error');
            }
        }

        async function removeHoliday(date) {
            if (!ensureCanEdit()) return;
            try {
                const resp = await apiFetch(`${API_BASE}/holidays/${encodeURIComponent(date)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
                if (Array.isArray(resp?.holidays)) holidays.value = [...resp.holidays];
                showAlert('节假日已移除');
            } catch (e) {
                showAlert(e?.message || '移除失败', 'error');
            }
        }

        function prevSidebarDay() {
            const d = new Date(selectedSidebarDate.value);
            d.setDate(d.getDate() - 1);
            selectedSidebarDate.value = formatDate(d);
        }

        function nextSidebarDay() {
            const d = new Date(selectedSidebarDate.value);
            d.setDate(d.getDate() + 1);
            selectedSidebarDate.value = formatDate(d);
        }

        function resetSidebarDateToToday() {
            selectedSidebarDate.value = formatDate(today);
        }

        const periodStats = computed(() => {
            const dateStrs = calendarDays.value.map(d => d.dateStr);
            const shiftMap = new Map(shiftTypes.value.map(s => [s.id, s]));
            const rows = doctors.value
                .filter(doc => isModuleEnabled(doc.category))
                .map(doc => {
                    const counts = {};
                    let total = 0;
                    dateStrs.forEach(dateStr => {
                        const ids = scheduleData.value[dateStr]?.[doc.id] || [];
                        ids.forEach(id => {
                            if (id === BLANK_SHIFT_ID) return;
                            counts[id] = (counts[id] || 0) + 1;
                            total += 1;
                        });
                    });
                    return { doc, counts, total };
                });
            const usedShiftIds = new Set();
            rows.forEach(r => Object.keys(r.counts).forEach(id => usedShiftIds.add(id)));
            const columns = shiftTypes.value.filter(s => usedShiftIds.has(s.id));
            const totals = rows.map(r => r.total).filter(t => t > 0);
            const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
            const rowsWithBalance = rows.map(r => ({
                ...r,
                balance: avg === 0 ? 'normal' : r.total === 0 ? 'normal' : r.total < avg * 0.75 ? 'low' : r.total > avg * 1.25 ? 'high' : 'normal'
            }));
            const byCategory = {};
            enabledModules.value.forEach(m => { byCategory[m.id] = []; });
            rowsWithBalance.forEach(row => {
                const cat = row.doc.category || 'other';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(row);
            });
            Object.keys(byCategory).forEach(k => { if (!byCategory[k].length) delete byCategory[k]; });
            return { rows: rowsWithBalance, byCategory, columns, shiftMap, avg: Math.round(avg * 10) / 10 };
        });

        function openStatsModal() {
            showStatsModal.value = true;
        }

        async function toggleCurrentMonthLock() {
            if (!ensureCanEdit()) return;
            const months = currentViewMonths.value;
            if (!months.length) return;
            const targetMonth = months[0];
            const isLocked = lockedMonths.value.includes(targetMonth);
            try {
                if (isLocked) {
                    const resp = await apiFetch(`${API_BASE}/departments/${currentDepartmentId.value}/lock-month/${encodeURIComponent(targetMonth)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
                    if (Array.isArray(resp?.lockedMonths)) lockedMonths.value = [...resp.lockedMonths];
                    showAlert(`${targetMonth} 已解锁`);
                } else {
                    const resp = await apiFetch(`${API_BASE}/departments/${currentDepartmentId.value}/lock-month`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: targetMonth }) });
                    if (Array.isArray(resp?.lockedMonths)) lockedMonths.value = [...resp.lockedMonths];
                    showAlert(`${targetMonth} 已锁定`);
                }
            } catch (e) {
                showAlert(e?.message || '操作失败', 'error');
            }
        }

        async function openTemplateManager() {
            if (!ensureCanEdit()) return;
            try {
                const resp = await apiFetch(`${API_BASE}/templates`);
                if (Array.isArray(resp?.scheduleTemplates)) scheduleTemplates.value = [...resp.scheduleTemplates];
            } catch (e) { console.error('加载模板失败', e); }
            showTemplateManager.value = true;
        }

        async function saveCurrentCycleAsTemplate() {
            if (!ensureCanEdit()) return;
            const name = String(newTemplateName.value || '').trim();
            if (!name) {
                showAlert('请输入模板名称', 'error');
                return;
            }
            const category = activeAutoCategory.value || autoScheduleConfig.value.groupCategory || 'first';
            const cycleShiftIds = [...autoScheduleConfig.value.cycleShiftIds];
            if (!cycleShiftIds.length) {
                showAlert('当前循环序列为空，无可保存内容', 'error');
                return;
            }
            try {
                const resp = await apiFetch(`${API_BASE}/templates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, category, cycleShiftIds })
                });
                if (Array.isArray(resp?.scheduleTemplates)) scheduleTemplates.value = [...resp.scheduleTemplates];
                newTemplateName.value = '';
                showAlert('模板已保存');
            } catch (e) {
                showAlert(e?.message || '保存失败', 'error');
            }
        }

        function applyTemplate(template) {
            if (!ensureCanEdit()) return;
            if (!template) return;
            if (template.category && isModuleEnabled(template.category)) {
                if (autoScheduleConfig.value.mode === 'group') {
                    autoScheduleConfig.value.groupCategory = template.category;
                }
            }
            autoScheduleConfig.value.cycleShiftIds = Array.isArray(template.cycleShiftIds) ? [...template.cycleShiftIds] : [];
            showTemplateManager.value = false;
            showAlert(`已加载模板：${template.name}`);
        }

        async function deleteTemplate(id) {
            if (!ensureCanEdit()) return;
            if (!confirm('确定删除该模板吗？')) return;
            try {
                const resp = await apiFetch(`${API_BASE}/templates/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
                if (Array.isArray(resp?.scheduleTemplates)) scheduleTemplates.value = [...resp.scheduleTemplates];
                showAlert('模板已删除');
            } catch (e) {
                showAlert(e?.message || '删除失败', 'error');
            }
        }

        function isWeekendOrHoliday(dateStr) {
            const date = new Date(dateStr);
            const day = date.getDay();
            return day === 0 || day === 6 || isHoliday(dateStr);
        }

        function isRestrictedWhiteShift(shiftId) {
            const shift = getShiftDefinition(shiftId);
            if (!shift) return false;
            if (shift.systemKey === 'blank_fill') return false;
            const shiftName = String(shift.name || '').trim();
            const shortName = String(shift.short || '').trim();
            return shift.systemKey === 'day' || shiftName.includes('白') || shortName.includes('白');
        }

        function isBlankShift(shiftId) {
            const shift = getShiftDefinition(shiftId);
            return shift?.systemKey === 'blank_fill';
        }

        function isSecondThirdCategory(category) {
            return Boolean(getModuleMeta(category)?.allowFixedWeekdays);
        }

        function getDefaultFixedWeekdaysForCategory(category) {
            const defaults = { ...DEFAULT_WEEKDAY_NOTES };
            if (!isSecondThirdCategory(category)) return defaults;

            Object.keys(defaults).forEach(key => {
                const shiftId = notices.value?.teachingClinicWeekdays?.[key] || '';
                const shift = getShiftDefinition(shiftId);
                const categories = Array.isArray(shift?.categories) ? shift.categories : [];
                if (shift && categories.includes(category) && isFixedWeeklyShift(shift)) {
                    defaults[key] = shift.id;
                }
            });
            return defaults;
        }

        function canMultiAssign(category) {
            return getModuleMeta(category)?.allowMultiAssign !== false;
        }

        function isBuiltInShift(shift) {
            return Boolean(shift?.systemKey);
        }

        function sortShifts(shifts = []) {
            return [...shifts].sort((a, b) => {
                const builtInDiff = Number(isBuiltInShift(b)) - Number(isBuiltInShift(a));
                if (builtInDiff !== 0) return builtInDiff;

                const nameA = (a?.name || '').trim();
                const nameB = (b?.name || '').trim();
                return nameA.localeCompare(nameB, 'zh-CN');
            });
        }

        const sortedShiftTypes = computed(() => sortShifts(shiftTypes.value));

        // --- Shift Management ---
        function resetEditingShift() {
            editingShift.value = { id: null, name: '', short: '', color: 'blue', categories: [] };
        }

        function editShift(shift) {
            editingShift.value = { ...shift, categories: [...shift.categories] };
        }

        async function saveShift() {
            if (!ensureCanEdit()) return;
            const trimmedName = (editingShift.value.name || '').trim();

            if (!trimmedName) {
                showAlert('请填写班次全称', 'error');
                return;
            }
            if (editingShift.value.categories.length === 0) {
                showAlert('请至少选择一个适用人员类别', 'error');
                return;
            }
            if (editingShift.value.id) {
                // Update
                const index = shiftTypes.value.findIndex(s => s.id === editingShift.value.id);
                if (index !== -1) {
                    latestSavedShiftId.value = editingShift.value.id;
                    shiftTypes.value[index] = {
                        ...editingShift.value,
                        name: trimmedName
                    };
                    showAlert('班次更新成功');
                }
            } else {
                // Add
                const newShiftId = 's' + Date.now();
                latestSavedShiftId.value = newShiftId;
                shiftTypes.value.push({
                    ...editingShift.value,
                    id: newShiftId,
                    name: trimmedName,
                    categories: [...editingShift.value.categories]
                });
                showAlert('班次添加成功');
            }
            resetEditingShift();
            await nextTick();
            scrollToShiftRow(latestSavedShiftId.value);
        }

        function scrollToShiftRow(shiftId) {
            if (!shiftId) return;
            const row = document.getElementById(`shift-row-${shiftId}`);
            if (!row) return;
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function deleteShift(id) {
            if (!ensureCanEdit()) return;
            if (confirm('确定要删除该班次吗？已分配该班次的排班记录也将被移除。')) {
                shiftTypes.value = shiftTypes.value.filter(s => s.id !== id);
                // Remove from schedule
                Object.keys(scheduleData.value).forEach(date => {
                    if (scheduleData.value[date]) {
                        Object.keys(scheduleData.value[date]).forEach(docId => {
                            const shiftIds = normalizeDoctorDay(date, docId).filter(shiftId => shiftId !== id);
                            if (shiftIds.length === 0) {
                                delete scheduleData.value[date][docId];
                            } else {
                                scheduleData.value[date][docId] = shiftIds;
                            }
                        });
                    }
                });
                showAlert('班次已删除');
            }
        }

        // --- Scheduling ---
        function getShiftIds(doctorId, dateStr) {
            return scheduleData.value[dateStr]?.[doctorId] || [];
        }

        function getShifts(doctorId, dateStr) {
            return getShiftIds(doctorId, dateStr)
                .map(typeId => ({ type: typeId }))
                .filter(shift => getShiftDefinition(shift.type));
        }

        function getMainScheduleShifts(doctorId, dateStr) {
            return getShifts(doctorId, dateStr);
        }

        function getShift(doctorId, dateStr) {
            return getShifts(doctorId, dateStr)[0] || null;
        }

        function getShiftName(typeId) {
            const shift = getShiftDefinition(typeId);
            return shift ? shift.name : '未知班次';
        }

        function getScheduleCellShiftName(typeId) {
            return isBlankShift(typeId) ? '' : getShiftName(typeId);
        }
        
        function getExportShiftName(typeId) {
            return isBlankShift(typeId) ? '' : getShiftName(typeId);
        }

        function getShiftColorClass(typeId) {
            const shift = getShiftDefinition(typeId);
            return shift ? `shift-color-${shift.color}` : 'bg-gray-200 text-gray-800 border-gray-300';
        }

        function getScheduleCellShiftClass(typeId) {
            return isBlankShift(typeId) ? 'shift-color-blank-cell' : getShiftColorClass(typeId);
        }

        function getAvailableShifts(category, dateStr = '', mode = 'normal') {
            if (category && !isModuleEnabled(category)) {
                return [];
            }
            const filteredShifts = (!category ? shiftTypes.value : shiftTypes.value.filter(shift => {
                const categories = Array.isArray(shift.categories) ? shift.categories : [];
                // If it's a built-in shift, respect the category
                if (shift.systemKey) {
                    return categories.includes(category);
                }
                // If it's a custom shift, show it if it has the category OR if it has NO categories assigned (fallback)
                return categories.includes(category) || categories.length === 0;
            })).filter(shift => {
                if (!dateStr) return true;
                return !(isWeekendOrHoliday(dateStr) && isRestrictedWhiteShift(shift.id));
            });
            const modeFilteredShifts = mode === 'teachingClinic'
                ? filteredShifts.filter(shift => isFixedWeeklyShift(shift))
                : filteredShifts;
            return sortShifts(modeFilteredShifts);
        }

        function getAvailableShiftGroups(category, dateStr = '', mode = 'normal') {
            const availableShifts = getAvailableShifts(category, dateStr, mode);
            const builtInShifts = availableShifts.filter(isBuiltInShift);
            const customShifts = availableShifts.filter(shift => !isBuiltInShift(shift));

            return [
                { key: 'built-in', title: '系统班次', shifts: builtInShifts },
                { key: 'custom', title: '自定义班次', shifts: customShifts }
            ].filter(group => group.shifts.length > 0);
        }

        function hasShiftAssigned(doctorId, dateStr, shiftId) {
            return getShiftIds(doctorId, dateStr).includes(shiftId);
        }

        function normalizeDoctorDay(dateStr, doctorId) {
            if (!scheduleData.value[dateStr]) {
                scheduleData.value[dateStr] = {};
            }
            if (!Array.isArray(scheduleData.value[dateStr][doctorId])) {
                const current = scheduleData.value[dateStr][doctorId];
                scheduleData.value[dateStr][doctorId] = current
                    ? (Array.isArray(current) ? current : [current.type || current])
                    : [];
            }
            return scheduleData.value[dateStr][doctorId];
        }

        function clearDoctorDayShifts(doctorId, dateStr, options = {}) {
            if (!ensureNotLocked(dateStr, options)) return;
            if (scheduleData.value[dateStr]?.[doctorId]) {
                delete scheduleData.value[dateStr][doctorId];
            }
        }

        function validateRestrictedHolidayShift(dateStr, shiftId, options = {}) {
            if (!isRestrictedWhiteShift(shiftId) || !isWeekendOrHoliday(dateStr)) return true;
            if (!options.silent) {
                showAlert('规则冲突：周末及节假日不允许安排带“白”字的班次', 'error');
            }
            return false;
        }

        function validateFirstOnCall(dateStr, doctorId, shiftId) {
            if (!isFirstOnCallShift(shiftId)) return true;
            const targetDate = new Date(dateStr);
            const prevDate = new Date(targetDate);
            prevDate.setDate(targetDate.getDate() - 1);
            const nextDate = new Date(targetDate);
            nextDate.setDate(targetDate.getDate() + 1);

            const prevShifts = getShiftIds(doctorId, formatDate(prevDate));
            const nextShifts = getShiftIds(doctorId, formatDate(nextDate));
            if (prevShifts.some(isFirstOnCallShift) || nextShifts.some(isFirstOnCallShift)) {
                showAlert('规则冲突：同一人员不能连续两天安排一线值班', 'error');
                return false;
            }
            return true;
        }

        function getConsecutiveScheduledDays(doctorId, anchorDateStr) {
            const anchor = new Date(anchorDateStr);
            let count = 1;
            const d = new Date(anchor);
            d.setDate(d.getDate() - 1);
            while (getShiftIds(doctorId, formatDate(d)).filter(id => id !== BLANK_SHIFT_ID).length > 0) {
                count++;
                d.setDate(d.getDate() - 1);
                if (count > 30) break;
            }
            const d2 = new Date(anchor);
            d2.setDate(d2.getDate() + 1);
            while (getShiftIds(doctorId, formatDate(d2)).filter(id => id !== BLANK_SHIFT_ID).length > 0) {
                count++;
                d2.setDate(d2.getDate() + 1);
                if (count > 30) break;
            }
            return count;
        }

        function validateConsecutiveDays(dateStr, doctorId, options = {}) {
            if (options.silent) return true;
            const WARN_THRESHOLD = 6;
            const consecutive = getConsecutiveScheduledDays(doctorId, dateStr);
            if (consecutive >= WARN_THRESHOLD) {
                const doc = doctors.value.find(d => d.id === doctorId);
                const name = doc?.name || doctorId;
                showAlert(`注意：${name} 连续上班将达 ${consecutive} 天，请确认是否合理`, 'error');
            }
            return true;
        }

        function addShiftEntry(dateStr, doctorId, doctorCategory, shiftId, options = {}) {
            if (!ensureNotLocked(dateStr, options)) return false;
            if (!validateRestrictedHolidayShift(dateStr, shiftId, options)) return false;
            if (!validateFirstOnCall(dateStr, doctorId, shiftId)) return false;
            validateConsecutiveDays(dateStr, doctorId, options);

            const shiftIds = normalizeDoctorDay(dateStr, doctorId);
            if (shiftIds.includes(shiftId)) {
                return false;
            }

            if (!canMultiAssign(doctorCategory)) {
                scheduleData.value[dateStr][doctorId] = [shiftId];
                return true;
            }

            if (isClinicShift(shiftId)) {
                const clinicIds = shiftIds.filter(existingId => !isClinicShift(existingId));
                scheduleData.value[dateStr][doctorId] = [...clinicIds, shiftId];
                return true;
            }

            scheduleData.value[dateStr][doctorId].push(shiftId);
            return true;
        }

        function openShiftPopup(doc, day, event, mode = 'normal') {
            const cell = event?.currentTarget;
            const rect = cell?.getBoundingClientRect?.();
            const popupWidth = 280;
            const popupHeight = 360;
            const edgePadding = 12;

            let x = rect ? rect.right + 8 : Math.max(edgePadding, Math.round((window.innerWidth - popupWidth) / 2));
            let y = rect ? rect.top : Math.max(edgePadding, Math.round((window.innerHeight - popupHeight) / 2));

            if (rect && x + popupWidth > window.innerWidth - edgePadding) {
                x = rect.left - popupWidth - 8;
            }

            x = Math.max(edgePadding, Math.min(x, window.innerWidth - popupWidth - edgePadding));
            y = Math.max(edgePadding, Math.min(y, window.innerHeight - popupHeight - edgePadding));

            popup.value = {
                show: true,
                x: x,
                y: y,
                docId: doc.id,
                docName: doc.name,
                docCategory: doc.category,
                dateStr: day.dateStr,
                mode
            };
        }

        function closePopup() {
            popup.value.show = false;
        }

        function clearPopupShifts() {
            const { docId, dateStr, mode } = popup.value;
            if (!scheduleData.value[dateStr]?.[docId]) return;
            if (mode === 'teachingClinic') {
                const remainingShiftIds = getShiftIds(docId, dateStr).filter(shiftId => !isFixedWeeklyShift(getShiftDefinition(shiftId)));
                if (remainingShiftIds.length > 0) {
                    scheduleData.value[dateStr][docId] = remainingShiftIds;
                } else {
                    delete scheduleData.value[dateStr][docId];
                }
            } else {
                clearDoctorDayShifts(docId, dateStr);
            }
        }

        function assignShift(shiftType) {
            if (!ensureCanEdit()) return;
            const { docId, docCategory, dateStr } = popup.value;
            if (!ensureNotLocked(dateStr)) return;
            
            if (!scheduleData.value[dateStr]) {
                scheduleData.value[dateStr] = {};
            }

            if (shiftType === null) {
                clearPopupShifts();
                closePopup();
            } else {
                const currentShiftIds = getShiftIds(docId, dateStr);
                if (canMultiAssign(docCategory)) {
                    if (currentShiftIds.includes(shiftType)) {
                        scheduleData.value[dateStr][docId] = currentShiftIds.filter(id => id !== shiftType);
                        if (scheduleData.value[dateStr][docId].length === 0) {
                            delete scheduleData.value[dateStr][docId];
                        }
                    } else {
                        addShiftEntry(dateStr, docId, docCategory, shiftType);
                    }
                } else {
                    if (addShiftEntry(dateStr, docId, docCategory, shiftType)) {
                        closePopup();
                    }
                    return;
                }
            }
        }

        async function savePopupAssignments() {
            if (!ensureCanEdit()) return;
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
            const saved = await saveData(true);
            if (saved === false) return;
            closePopup();
            showAlert('排班已保存');
        }

        function toggleClearMenu() {
            showClearMenu.value = !showClearMenu.value;
        }

        function closeClearMenu() {
            showClearMenu.value = false;
        }

        async function clearCurrentView() {
            if (!ensureCanEdit()) return;
            const lockedDates = calendarDays.value.filter(day => isDateLocked(day.dateStr));
            if (lockedDates.length === calendarDays.value.length) {
                showAlert('当前视图内所有日期均已锁定，无法清空', 'error'); return;
            }
            const lockedNote = lockedDates.length ? `（已锁定的 ${lockedDates.length} 天不受影响）` : '';
            if (!confirm(`确定要清空当前视图内的排班数据吗？${lockedNote}可通过“撤销最近一次清空”恢复。`)) return;

            await runClearActionWithUndo(
                `清空当前视图前留存 - ${displayDateRange.value}`,
                '当前排班已清空，可撤销最近一次清空',
                () => {
                    calendarDays.value.forEach(day => {
                        if (isDateLocked(day.dateStr)) return;
                        if (scheduleData.value[day.dateStr]) {
                            if (filterCategory.value === 'all') {
                                delete scheduleData.value[day.dateStr];
                            } else {
                                Object.keys(scheduleData.value[day.dateStr]).forEach(docId => {
                                    const doc = doctorMap.value.get(docId);
                                    if (doc && doc.category === filterCategory.value) {
                                        delete scheduleData.value[day.dateStr][docId];
                                    }
                                });
                                if (Object.keys(scheduleData.value[day.dateStr]).length === 0) {
                                    delete scheduleData.value[day.dateStr];
                                }
                            }
                        }
                    });
                }
            );
        }

        async function clearAllSchedule() {
            if (!ensureCanEdit()) return;
            const lockedNote = lockedMonths.value.length ? `（已锁定月份 ${lockedMonths.value.join('、')} 不受影响）` : '';
            if (!confirm(`确定要清空系统内全部排班数据吗？${lockedNote}可通过“撤销最近一次清空”恢复。`)) return;

            await runClearActionWithUndo(
                '清空全部排班前留存',
                '全部排班已清空，可撤销最近一次清空',
                () => {
                    if (lockedMonths.value.length === 0) {
                        scheduleData.value = {};
                    } else {
                        Object.keys(scheduleData.value).forEach(dateStr => {
                            if (!isDateLocked(dateStr)) delete scheduleData.value[dateStr];
                        });
                    }
                }
            );
        }

        function getCurrentMonthDateRange() {
            let baseDate;
            if (viewMode.value === 'month') {
                const [year, month] = currentMonth.value.split('-').map(Number);
                baseDate = new Date(year, month - 1, 1);
            } else {
                baseDate = new Date(currentWeekStart.value);
            }

            const year = baseDate.getFullYear();
            const month = baseDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const dateStrList = [];

            for (let day = 1; day <= daysInMonth; day++) {
                dateStrList.push(formatDate(new Date(year, month, day)));
            }

            return {
                label: `${year}年${String(month + 1).padStart(2, '0')}月`,
                dateStrList
            };
        }

        async function clearGroupSchedule(groupCategory) {
            if (!ensureCanEdit()) return;
            const groupName = getGroupName(groupCategory);
            const { label, dateStrList } = getCurrentMonthDateRange();
            const lockedCount = dateStrList.filter(d => isDateLocked(d)).length;
            const lockedNote = lockedCount ? `（已锁定的 ${lockedCount} 天不受影响）` : '';
            if (!confirm(`确定要清空【${label}】内所有【${groupName}】的排班数据吗？${lockedNote}可通过“撤销最近一次清空”恢复。`)) return;

            await runClearActionWithUndo(
                `清空${label}${groupName}前留存`,
                `已清空【${label}】的【${groupName}】排班，可撤销最近一次清空`,
                () => {
                    dateStrList.forEach(dateStr => {
                        if (isDateLocked(dateStr)) return;
                        if (scheduleData.value[dateStr]) {
                            Object.keys(scheduleData.value[dateStr]).forEach(docId => {
                                const doc = doctorMap.value.get(docId);
                                if (doc && doc.category === groupCategory) {
                                    delete scheduleData.value[dateStr][docId];
                                }
                            });
                            if (Object.keys(scheduleData.value[dateStr]).length === 0) {
                                delete scheduleData.value[dateStr];
                            }
                        }
                    });
                }
            );
        }

        // --- Auto Schedule ---
        function addShiftToCycle(shiftId) {
            if (!ensureCanEdit()) return;
            if (!shiftId) return;
            autoScheduleConfig.value.cycleShiftIds.push(shiftId);
        }

        function removeCycleShift(index) {
            if (!ensureCanEdit()) return;
            autoScheduleConfig.value.cycleShiftIds.splice(index, 1);
        }

        function clearCycleSequence() {
            if (!ensureCanEdit()) return;
            autoScheduleConfig.value.cycleShiftIds = [];
        }

        function toggleGroupDoctorSelection(doctorId) {
            if (!ensureCanEdit()) return;
            const selectedIds = new Set(autoScheduleConfig.value.groupDoctorIds);
            if (selectedIds.has(doctorId)) {
                selectedIds.delete(doctorId);
            } else {
                selectedIds.add(doctorId);
            }
            autoScheduleConfig.value.groupDoctorIds = Array.from(selectedIds);
        }

        function setAllGroupDoctorsSelected(selected) {
            if (!ensureCanEdit()) return;
            autoScheduleConfig.value.groupDoctorIds = selected
                ? availableGroupDoctors.value.map(doc => doc.id)
                : [];
        }

        function generateAutoSchedule() {
            if (!ensureCanEdit()) return;
            if (selectedAutoTargets.value.length === 0) {
                showAlert(autoScheduleConfig.value.mode === 'group' ? '当前分组没有可排班人员' : '请选择需要排班的人员', 'error');
                return;
            }
            const start0 = new Date(autoScheduleConfig.value.startDate);
            const end0 = new Date(autoScheduleConfig.value.endDate);
            const rangeMonths = new Set();
            for (let d = new Date(start0); d <= end0; d.setDate(d.getDate() + 1)) {
                rangeMonths.add(formatDate(d).slice(0, 7));
            }
            const blockedMonths = [...rangeMonths].filter(m => lockedMonths.value.includes(m));
            if (blockedMonths.length) {
                showAlert(`以下月份已锁定，无法执行自动排班：${blockedMonths.join('、')}`, 'error');
                return;
            }

            const start = new Date(autoScheduleConfig.value.startDate);
            const end = new Date(autoScheduleConfig.value.endDate);
            
            if (isNaN(start) || isNaN(end) || start > end) {
                showAlert('请选择有效的日期范围', 'error');
                return;
            }

            const hasFixedClinic = Object.values(autoScheduleConfig.value.fixedWeekdays).some(Boolean);
            const hasCycle = autoScheduleConfig.value.cycleShiftIds.length > 0;
            if (!hasFixedClinic && !hasCycle) {
                showAlert('请至少设置固定门诊或循环班次序列', 'error');
                return;
            }

            let assignedCount = 0;
            const isGroupMode = autoScheduleConfig.value.mode === 'group';

            selectedAutoTargets.value.forEach((doctor, doctorIndex) => {
                let currentDate = new Date(start);
                let cycleEligibleDayIndex = 0;

                while (currentDate <= end) {
                    const dateStr = formatDate(currentDate);
                    const dayOfWeek = currentDate.getDay();
                    const fixedClinicShiftId = autoScheduleConfig.value.fixedWeekdays[dayOfWeek];
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const skipCycleToday = autoScheduleConfig.value.skipWeekend && isWeekend;

                    // --- Clear existing shifts for this doctor on this day before applying new auto-schedule ---
                    clearDoctorDayShifts(doctor.id, dateStr, { silent: true });

                    // 如果设置了跳过周末且当前是周末，且没有固定门诊，则跳过
                    if (autoScheduleConfig.value.skipWeekend && (dayOfWeek === 0 || dayOfWeek === 6) && !fixedClinicShiftId) {
                        currentDate.setDate(currentDate.getDate() + 1);
                        continue;
                    }

                    // 1. 先落固定门诊/教学等规则 (二线、三线)
                    if (isSecondThirdCategory(doctor.category) && fixedClinicShiftId) {
                        if (addShiftEntry(dateStr, doctor.id, doctor.category, fixedClinicShiftId, { silent: true })) {
                            assignedCount++;
                        }
                    }

                    // 2. 填充循环班次
                    if (hasCycle && !skipCycleToday) {
                        // 整组模式以开始日期为基点，当天补齐所有人的班次；
                        // 单人模式则按日期顺序直接推进循环。
                        const len = autoScheduleConfig.value.cycleShiftIds.length;
                        const cycleIndex = isGroupMode
                            ? (((cycleEligibleDayIndex - doctorIndex) % len) + len) % len
                            : cycleEligibleDayIndex % len;
                        const cycleShiftId = autoScheduleConfig.value.cycleShiftIds[cycleIndex];

                        if (addShiftEntry(dateStr, doctor.id, doctor.category, cycleShiftId, { silent: true })) {
                            assignedCount++;
                        }
                        cycleEligibleDayIndex++;
                    }

                    currentDate.setDate(currentDate.getDate() + 1);
                }
            });

            showAlert(autoScheduleConfig.value.mode === 'group' ? `整组排班生成成功，共写入 ${assignedCount} 条班次` : `排班生成成功，共写入 ${assignedCount} 条班次`);
            showAutoSchedule.value = false;
        }

        // --- Export ---
        function buildExportTableData() {
            const days = calendarDays.value;
            const header1 = ['人员类别', '姓名', '职称'];
            days.forEach(day => header1.push(day.dateStr));

            const header2 = ['', '', ''];
            days.forEach(day => header2.push(day.dayOfWeek));

            const bodyRows = [];
            Object.keys(groupedDoctors.value).forEach(groupName => {
                groupedDoctors.value[groupName].forEach(doc => {
                    const row = [
                        getCategoryName(doc.category),
                        doc.name,
                        doc.title
                    ];

                    days.forEach(day => {
                        const shiftNames = getShifts(doc.id, day.dateStr)
                            .map(shift => getExportShiftName(shift.type))
                            .filter(Boolean);
                        row.push(shiftNames.join(' + '));
                    });
                    bodyRows.push(row);
                });
            });

            return {
                days,
                headerRows: [header1, header2],
                bodyRows
            };
        }

        function getExportFileBaseName() {
            return `排班表_${displayDateRange.value.replace(/\s+/g, '_')}`;
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function buildExportHtmlTable() {
            const { headerRows, bodyRows } = buildExportTableData();
            const renderRow = (row, isHeader = false) => {
                const tag = isHeader ? 'th' : 'td';
                return `<tr>${row.map(cell => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('')}</tr>`;
            };

            return `
                <div class="export-sheet">
                    <div class="export-title">临床医生排班表</div>
                    <div class="export-subtitle">${escapeHtml(displayDateRange.value)}</div>
                    <table class="export-table">
                        <thead>
                            ${headerRows.map(row => renderRow(row, true)).join('')}
                        </thead>
                        <tbody>
                            ${bodyRows.map(row => renderRow(row, false)).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function getExportStyleText() {
            return `
                .export-page {
                    font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
                    color: #1f2937;
                    background: #ffffff;
                    padding: 20px;
                    box-sizing: border-box;
                }
                .export-title {
                    text-align: center;
                    font-size: 22px;
                    font-weight: 700;
                    margin-bottom: 8px;
                }
                .export-subtitle {
                    text-align: center;
                    font-size: 13px;
                    color: #475569;
                    margin-bottom: 14px;
                }
                .export-table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                    font-size: 11px;
                    background: #ffffff;
                }
                .export-table th,
                .export-table td {
                    border: 1px solid #94a3b8;
                    padding: 6px 4px;
                    text-align: center;
                    vertical-align: middle;
                    word-break: break-all;
                }
                .export-table thead th {
                    background: #e2e8f0;
                    font-weight: 700;
                }
            `;
        }

        function buildExportPrintableMarkup() {
            return `
                <div class="export-page">
                    ${buildExportHtmlTable()}
                </div>
            `;
        }

        function getExportDocumentHtml() {
            return `
                <!DOCTYPE html>
                <html lang="zh-CN">
                <head>
                    <meta charset="UTF-8">
                    <title>临床医生排班表</title>
                    <style>
                        body { margin: 0; background: #ffffff; }
                        ${getExportStyleText()}
                    </style>
                </head>
                <body>
                    ${buildExportPrintableMarkup()}
                </body>
                </html>
            `;
        }

        function downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        function exportIcal(doctorId = '') {
            if (!authToken.value && !currentUser.value) { showAlert('请先登录后再导出', 'error'); return; }
            const targetDoctors = doctorId
                ? doctors.value.filter(d => d.id === doctorId)
                : doctors.value.filter(d => isModuleEnabled(d.category));
            if (!targetDoctors.length) { showAlert('没有可导出的人员', 'error'); return; }
            const lines = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//PaiBan//Schedule//ZH',
                'CALSCALE:GREGORIAN',
                'METHOD:PUBLISH'
            ];
            const deptName = departments.value.find(d => d.id === currentDepartmentId.value)?.name || '排班';
            const toIcalDate = str => str.replace(/-/g, '');
            const nextDayStr = dateStr => {
                const d = new Date(dateStr);
                d.setDate(d.getDate() + 1);
                return formatDate(d);
            };
            Object.entries(scheduleData.value).forEach(([dateStr, dayData]) => {
                targetDoctors.forEach(doc => {
                    const shiftIds = dayData?.[doc.id] || [];
                    shiftIds.filter(id => id !== BLANK_SHIFT_ID).forEach(shiftId => {
                        const shift = getShiftDefinition(shiftId);
                        if (!shift) return;
                        const uid = `${dateStr}-${doc.id}-${shiftId}@paiban`;
                        const dtStamp = toIcalDate(new Date().toISOString().slice(0, 10)) + 'T000000Z';
                        lines.push(
                            'BEGIN:VEVENT',
                            `UID:${uid}`,
                            `DTSTAMP:${dtStamp}`,
                            `DTSTART;VALUE=DATE:${toIcalDate(dateStr)}`,
                            `DTEND;VALUE=DATE:${toIcalDate(nextDayStr(dateStr))}`,
                            `SUMMARY:${doc.name} — ${shift.name}`,
                            `DESCRIPTION:${deptName} · ${doc.title}`,
                            'END:VEVENT'
                        );
                    });
                });
            });
            lines.push('END:VCALENDAR');
            const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
            const suffix = doctorId ? (targetDoctors[0]?.name || doctorId) : '全员';
            downloadBlob(blob, `${deptName}_排班_${suffix}.ics`);
            showAlert('iCal 日历导出成功');
        }

        function exportExcel() {
            if (!ensureCanEdit('仅管理员及以上可导出排班')) return;
            const { headerRows, bodyRows } = buildExportTableData();
            const data = [...headerRows, ...bodyRows];
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "排班表");
            XLSX.writeFile(wb, `${getExportFileBaseName()}.xlsx`);
            showAlert('Excel 导出成功');
        }

        function exportWord() {
            if (!ensureCanEdit('仅管理员及以上可导出排班')) return;
            const html = getExportDocumentHtml();
            const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
            downloadBlob(blob, `${getExportFileBaseName()}.doc`);
            showAlert('Word 导出成功');
        }

        async function exportPDF() {
            if (!ensureCanEdit('仅管理员及以上可导出排班')) return;
            if (!window.html2pdf) {
                showAlert('PDF 导出组件加载失败，请刷新页面后重试', 'error');
                return;
            }

            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.left = '-99999px';
            container.style.top = '0';
            container.style.width = '1400px';
            container.style.background = '#ffffff';
            container.innerHTML = `<style>${getExportStyleText()}</style>${buildExportPrintableMarkup()}`;
            document.body.appendChild(container);

            try {
                await window.html2pdf()
                    .set({
                        margin: [8, 8, 8, 8],
                        filename: `${getExportFileBaseName()}.pdf`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
                        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                    })
                    .from(container)
                    .save();
                showAlert('PDF 导出成功');
            } catch (error) {
                console.error('Error exporting PDF:', error);
                showAlert('PDF 导出失败，请稍后重试', 'error');
            } finally {
                document.body.removeChild(container);
            }
        }

        function exportDoctorsExcel() {
            if (!ensureCanEdit('仅管理员及以上可导出人员信息')) return;
            const header = ['姓名', '职称/职务', '人员类别', '联系电话', '备注'];
            const rows = doctors.value.map(doc => [
                doc.name || '',
                doc.title || '',
                getCategoryName(doc.category),
                doc.phone || '',
                doc.notes || ''
            ]);
            const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
            ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 24 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '人员信息');
            XLSX.writeFile(wb, `人员信息_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`);
            showAlert('人员信息 Excel 导出成功');
        }

        // --- Module UX Helpers ---
        function isModuleSidebarRuleEnabled(module) {
            const mode = module?.sidebarMode || '';
            return mode !== 'hidden' && mode !== 'default';
        }

        function isModuleSidebarRuleDefault(module) {
            return module?.sidebarMode === 'default';
        }

        function isModuleSidebarRuleHidden(module) {
            return module?.sidebarMode === 'hidden';
        }

        function isModuleSidebarPhoneModeEnabled(module) {
            return isModuleSidebarRuleEnabled(module) && !!module?.sidebarShowPhone;
        }

        function shouldShowModuleSidebarAdvancedSettings(module) {
            return !isModuleSidebarRuleHidden(module) && !isModuleSidebarRuleDefault(module);
        }

        function shouldShowModuleSidebarPhoneModeEditor(module) {
            return shouldShowModuleSidebarAdvancedSettings(module) && !!module?.sidebarShowPhone;
        }

        function shouldShowModuleSidebarKeywordEditor(module) {
            return module?.sidebarMode === 'module_keyword';
        }

        function shouldShowModuleSidebarWhitelistEditor(module) {
            return module?.sidebarMode === 'module_shift_whitelist';
        }

        function getModuleSidebarRuleHint(module) {
            if (isModuleSidebarRuleDefault(module)) {
                return '沿用系统默认提取规则：二线值班进“值班”行，教学门诊进“门诊”行。';
            }
            if (isModuleSidebarRuleHidden(module)) {
                return '此模块所有排班将不会出现在右侧“当日排班人员”概览中。';
            }
            return '';
        }

        function getModuleSidebarInactiveHint(module) {
            if (isModuleSidebarRuleDefault(module)) {
                return '当前为“默认规则”，右侧标题、排序、样式等高级设置暂不生效。';
            }
            if (isModuleSidebarRuleHidden(module)) {
                return '当前为“不在右侧展示”，下方所有显示控制均已停用。';
            }
            const mode = module?.sidebarMode || '';
            if (mode === 'module_keyword') {
                return '仅提取名称或简称命中关键字的班次。';
            }
            if (mode === 'module_shift_whitelist') {
                return '仅提取已勾选到白名单内的班次。';
            }
            return '当前模块会以单独模块行显示在右侧，可继续细化展示方式。';
        }

        function getModuleSidebarValidationMessages(module) {
            const messages = [];
            if (module.sidebarMode === 'module_keyword' && !String(module.sidebarKeywordsText || '').trim()) {
                messages.push('关键字匹配规则下，请至少输入一个关键字');
            }
            if (module.sidebarMode === 'module_shift_whitelist' && (!Array.isArray(module.sidebarShiftIds) || module.sidebarShiftIds.length === 0)) {
                messages.push('白名单匹配规则下，请至少勾选一个指定班次');
            }
            return messages;
        }

        const newModuleSidebarValidationMessages = computed(() => {
            return getModuleSidebarValidationMessages(newModule.value);
        });

        const canCreateNewModule = computed(() => {
            const doctorLabel = String(newModule.value.doctorLabel || '').trim();
            const groupName = String(newModule.value.groupName || '').trim();
            return !!doctorLabel && 
                   !!groupName && 
                   newModuleSidebarValidationMessages.value.length === 0;
        });

        function getModuleToggleDisabledReason(moduleId) {
            const module = getModuleMeta(moduleId);
            if (!module) return '';
            const enabledCount = modules.value.filter(item => item.enabled !== false).length;
            if (module.enabled !== false && enabledCount <= 1) {
                return '至少需要保留一个启用模块';
            }
            return '';
        }

        function getModuleDeleteDisabledReason(moduleId) {
            if (modules.value.length <= 1) {
                return '至少需要保留一个模块';
            }
            const remainingEnabledCount = modules.value.filter(item => item.id !== moduleId && item.enabled !== false).length;
            const targetModule = getModuleMeta(moduleId);
            if (targetModule?.enabled !== false && remainingEnabledCount <= 0) {
                return '删除后至少需要保留一个启用模块';
            }
            return '';
        }

        // --- Utils ---
        function showAlert(msg, type = 'success') {
            alert.value = { show: true, message: msg, type };
            setTimeout(() => {
                alert.value.show = false;
            }, 3000);
        }

        return {
            authReady, showLoginPanel, loginForm, showLoginPassword, isSubmittingLogin, currentUser, roleLabel,
            canEditData, canManageAdmins, handleLogin, logout, toggleLoginPanel, closeLoginPanel,
            departments, currentDepartmentId, currentDepartment, showDepartmentManager, departmentDraftNames, newDepartmentName, duplicateDepartmentName, isSubmittingDepartment,
            openDepartmentManager, closeDepartmentManager, switchDepartment, createDepartment, canDeleteDepartment, canMoveDepartmentUp, canMoveDepartmentDown, renameDepartment, moveDepartment, deleteDepartment,
            showModuleManager, showNewModuleForm, openModuleManager, closeModuleManager, toggleNewModuleForm, allModulesSorted, moduleManagerSelectedModuleId, moduleManagerVisibleModules, newModule, expandedModuleRules, toggleModuleRules, createModule,
            moveModule, toggleModuleEnabled, deleteModule, normalizeModuleEditableFields,
            canMoveModuleUp, canMoveModuleDown, isDefaultModule, getModuleUsage, sidebarModeOptions, sidebarAccentOptions, sidebarGroupModeOptions, sidebarPhoneModeOptions, sidebarTitleModeOptions, sidebarDensityOptions, sidebarCountModeOptions, getSidebarRuleTargetShifts,
            isModuleSidebarRuleEnabled, isModuleSidebarRuleDefault, isModuleSidebarRuleHidden, isModuleSidebarPhoneModeEnabled, getModuleSidebarRuleHint,
            canCreateNewModule, newModuleSidebarValidationMessages, shouldShowModuleSidebarAdvancedSettings, shouldShowModuleSidebarKeywordEditor,
            shouldShowModuleSidebarWhitelistEditor, shouldShowModuleSidebarPhoneModeEditor, getModuleSidebarInactiveHint, getModuleSidebarValidationMessages,
            getModuleToggleDisabledReason, getModuleDeleteDisabledReason,
            showAdminManager, adminAccounts, newAdmin, editingAdminId, isEditingAdminAccount, departmentOptions, canSubmitAdminForm, getAdminDepartmentNames, openAdminManager, editAdminAccount, cancelAdminEdit, createAdminAccount, deleteAdminAccount,
            showHistoryManager, historyRecords, isLoadingHistory, openHistoryManager, restoreHistoryRecord, deleteHistoryRecord, formatHistoryTime,
            doctors, enabledDoctors, showDoctorModal, newDoctor, addDoctor, fillDefaultDoctorsForModules, deleteDoctor, moveDoctor, canMoveDoctorUp, canMoveDoctorDown, normalizeDoctorEditableFields, doctorTitleOptions,
            copyDoctorPopup, openCopyDoctorPopup, closeCopyDoctorPopup, copyDoctorToModule,
            holidays, showHolidayManager, newHolidayDate, openHolidayManager, addHoliday, removeHoliday,
            lockedMonths, currentViewMonths, isCurrentPeriodLocked, isDateLocked, toggleCurrentMonthLock,
            scheduleTemplates, showTemplateManager, newTemplateName, openTemplateManager, saveCurrentCycleAsTemplate, applyTemplate, deleteTemplate,
            showStatsModal, periodStats, openStatsModal,
            prevSidebarDay, nextSidebarDay, resetSidebarDateToToday,
            viewMode, filterCategory, currentMonth, displayDateRange, calendarDays,
            compactMode,
            groupedDoctors, doctorCategoryOptions, clearableModules, autoScheduleModules, getGroupName, getCategoryName,
            prevPeriod, nextPeriod, clearCurrentView,
            getShift, getShiftName, getScheduleCellShiftName, getShiftColorClass, getScheduleCellShiftClass,
            popup, closePopup, getAvailableShifts, getAvailableShiftGroups, assignShift, savePopupAssignments, handleScheduleCellClick,
            getShifts, getMainScheduleShifts, hasShiftAssigned, clearDoctorDayShifts,
            exportExcel, exportWord, exportPDF, exportIcal, exportDoctorsExcel,
            shiftTypes, sortedShiftTypes, colorOptions, showShiftManager, editingShift,
            saveShift, editShift, deleteShift, resetEditingShift, openShiftManager,
            showAutoSchedule, autoScheduleConfig, weekdayOptions, selectedAutoDoctor, activePrimaryManager,
            activeAutoCategory, selectedAutoTargets, availableShiftsForAuto, availableClinicShiftsForAuto, availableFixedWeeklyShiftsForAuto,
            availableGroupDoctors, addShiftToCycle, removeCycleShift, clearCycleSequence, generateAutoSchedule, openAutoScheduleModal, activateGroupAutoSchedule,
            toggleGroupDoctorSelection, setAllGroupDoctorsSelected,
            clearGroupSchedule, clearCurrentView, clearAllSchedule, recentClearAction, undoRecentClearAction, showClearMenu, toggleClearMenu, closeClearMenu,
            alert, notices, selectedSidebarDate, todayDutyRows,
            openDoctorManager, getSidebarGroupNames, getSidebarGroupDisplayText, getSidebarMemberDisplayText, getSidebarGroupPhones, getSidebarRowPhones, getSidebarRowStyle, getSidebarRowLabelStyle, getSidebarRowEmptyText, shouldShowSidebarGroupCount, getSidebarGroupCountText, shouldShowSidebarMemberTitleBadge, shouldShowSidebarMemberPhoneBadge,
            showDisplaySettings, uiSettings, enforceUiSettingsBounds, scheduleGroupHeaderStyle, scheduleDoctorNameStyle,
            scheduleDoctorTitleStyle, scheduleShiftTextStyle, sidebarWidthStyle, getNoticeEditorStyle,
            getNoticeTextLength, getNoticeLastUpdatedLabel, isNoticeEmpty, focusNoticeEditor, copyNotice, appendNoticeTimestamp, clearNotice,
            showNoticeHistory, noticeHistoryField, noticeHistoryList, noticeHistorySearchQuery, filteredNoticeHistoryList, isLoadingNoticeHistory, selectedNoticeHistoryRecord, openNoticeHistory, rollbackNotice, deleteNoticeHistoryRecord, clearNoticeHistory, previewNoticeHistory,
            getNoticeHistoryPreviewText, getNoticeHistoryContentLength, getNoticeHistoryEntryLabel, getNoticeHistoryHighlightedPreviewHtml, getNoticeHistoryHighlightedMetaHtml, getNoticeHistoryMatchSnippetHtml,
            hasDraft, restoreDraft, insertTable
        };
    }
});

app.mount('#app');
