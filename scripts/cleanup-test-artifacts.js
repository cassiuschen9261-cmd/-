const fs = require('fs');
const path = require('path');
const http = require('http');
const { resolveCliBaseUrl } = require('./lib/project-paths');

const TEST_ID_PATTERNS = [
  /^verify_sidebar_/,
  /^custom_sidebar_/,
  /^sidebar_advanced_/,
  /^sidebar_verify_/,
  /^sidebar_mode_/,
  /^verify_module_/,
  /^verify-disabled-module_/,
  /^verify-disabled-module-/
];

function resolveBaseUrl() {
  return resolveCliBaseUrl();
}

function isTestArtifactId(value) {
  const text = String(value || '').trim();
  return TEST_ID_PATTERNS.some(pattern => pattern.test(text));
}

function requestJson(baseUrl, requestPath, { method = 'GET', token = '', body } = {}) {
  const url = new URL(requestPath, baseUrl);
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }

    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      headers
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
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function cleanupScheduleData(scheduleData, allowedDoctorIds, allowedShiftIds) {
  const next = {};
  Object.entries(scheduleData || {}).forEach(([date, assignments]) => {
    const nextAssignments = {};
    Object.entries(assignments || {}).forEach(([doctorId, shiftIds]) => {
      if (!allowedDoctorIds.has(doctorId)) return;
      const filteredShiftIds = (Array.isArray(shiftIds) ? shiftIds : []).filter(shiftId => allowedShiftIds.has(shiftId));
      if (filteredShiftIds.length > 0) {
        nextAssignments[doctorId] = filteredShiftIds;
      }
    });
    if (Object.keys(nextAssignments).length > 0) {
      next[date] = nextAssignments;
    }
  });
  return next;
}

function containsTestArtifactsInDepartment(data) {
  const modules = Array.isArray(data.modules) ? data.modules : [];
  const doctors = Array.isArray(data.doctors) ? data.doctors : [];
  const shiftTypes = Array.isArray(data.shiftTypes) ? data.shiftTypes : [];

  if (modules.some(module => isTestArtifactId(module.id))) return true;
  if (doctors.some(doctor => isTestArtifactId(doctor.id) || isTestArtifactId(doctor.category))) return true;
  if (shiftTypes.some(shift => isTestArtifactId(shift.id) || (Array.isArray(shift.categories) && shift.categories.some(isTestArtifactId)))) return true;

  return Object.values(data.scheduleData || {}).some(assignments => {
    return Object.entries(assignments || {}).some(([doctorId, shiftIds]) => {
      return isTestArtifactId(doctorId) || (Array.isArray(shiftIds) && shiftIds.some(isTestArtifactId));
    });
  });
}

function cleanupDepartmentPayload(data) {
  const modules = (Array.isArray(data.modules) ? data.modules : []).filter(module => !isTestArtifactId(module.id));
  const allowedModuleIds = new Set(modules.map(module => module.id));

  const doctors = (Array.isArray(data.doctors) ? data.doctors : []).filter(doctor => {
    if (isTestArtifactId(doctor.id)) return false;
    if (isTestArtifactId(doctor.category)) return false;
    return allowedModuleIds.has(doctor.category);
  });
  const allowedDoctorIds = new Set(doctors.map(doctor => doctor.id));

  const shiftTypes = (Array.isArray(data.shiftTypes) ? data.shiftTypes : []).filter(shift => {
    if (isTestArtifactId(shift.id)) return false;
    const categories = Array.isArray(shift.categories) ? shift.categories : [];
    if (categories.some(isTestArtifactId)) return false;
    return categories.every(category => allowedModuleIds.has(category));
  });
  const allowedShiftIds = new Set(shiftTypes.map(shift => shift.id));

  const scheduleData = cleanupScheduleData(data.scheduleData || {}, allowedDoctorIds, allowedShiftIds);

  const scheduleHistory = (Array.isArray(data.scheduleHistory) ? data.scheduleHistory : []).filter(entry => {
    return !containsTestArtifactsInDepartment(entry.data || {});
  });

  return {
    modules,
    doctors,
    shiftTypes,
    scheduleData,
    notices: data.notices || {},
    uiSettings: data.uiSettings || {},
    scheduleHistory
  };
}

function getHistoryIdsToDelete(data) {
  return (Array.isArray(data.scheduleHistory) ? data.scheduleHistory : [])
    .filter(entry => containsTestArtifactsInDepartment(entry.data || {}))
    .map(entry => String(entry.id || '').trim())
    .filter(Boolean);
}

async function login(baseUrl) {
  const response = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: {
      username: '2203408',
      password: 'zyyfy666'
    }
  });
  if (response.status !== 200 || !response.data.token) {
    throw new Error(`Login failed: ${response.status}`);
  }
  return response.data.token;
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const token = await login(baseUrl);
  const departmentListResponse = await requestJson(baseUrl, '/api/data', { token });
  if (departmentListResponse.status !== 200) {
    throw new Error(`Read department list failed: ${departmentListResponse.status}`);
  }

  const departments = Array.isArray(departmentListResponse.data.departments) ? departmentListResponse.data.departments : [];
  const result = {
    baseUrl,
    cleanedDepartments: [],
    skippedDepartments: []
  };

  for (const department of departments) {
    const departmentId = String(department.id || '').trim();
    const auditResponse = await requestJson(
      baseUrl,
      `/api/audit/department?departmentId=${encodeURIComponent(departmentId)}`,
      { token }
    );
    if (auditResponse.status !== 200) {
      throw new Error(`Read audit department ${departmentId} failed: ${auditResponse.status}`);
    }

    const detail = auditResponse.data;
    const cleaned = cleanupDepartmentPayload(detail);
    const historyIdsToDelete = getHistoryIdsToDelete(detail);
    const changed = JSON.stringify({
      modules: detail.modules || [],
      doctors: detail.doctors || [],
      shiftTypes: detail.shiftTypes || [],
      scheduleData: detail.scheduleData || {},
      scheduleHistory: detail.scheduleHistory || []
    }) !== JSON.stringify({
      modules: cleaned.modules,
      doctors: cleaned.doctors,
      shiftTypes: cleaned.shiftTypes,
      scheduleData: cleaned.scheduleData,
      scheduleHistory: cleaned.scheduleHistory
    });

    if (!changed && historyIdsToDelete.length === 0) {
      result.skippedDepartments.push({ id: departmentId, name: department.name || '' });
      continue;
    }

    if (changed) {
      const saveResponse = await requestJson(baseUrl, '/api/data', {
        method: 'POST',
        token,
        body: {
          departmentId,
          modules: cleaned.modules,
          doctors: cleaned.doctors,
          scheduleData: cleaned.scheduleData,
          shiftTypes: cleaned.shiftTypes,
          notices: cleaned.notices,
          uiSettings: cleaned.uiSettings,
          scheduleHistory: cleaned.scheduleHistory,
          skipAutoHistorySnapshot: true
        }
      });

      if (saveResponse.status !== 200) {
        throw new Error(`Save department ${departmentId} failed: ${saveResponse.status}`);
      }
    }

    for (const historyId of historyIdsToDelete) {
      const deleteResponse = await requestJson(
        baseUrl,
        `/api/history/${encodeURIComponent(historyId)}?departmentId=${encodeURIComponent(departmentId)}`,
        {
          method: 'DELETE',
          token
        }
      );

      if (deleteResponse.status !== 200) {
        throw new Error(`Delete history ${historyId} in ${departmentId} failed: ${deleteResponse.status}`);
      }
    }

    result.cleanedDepartments.push({
      id: departmentId,
      name: department.name || '',
      remainingModuleCount: cleaned.modules.length,
      remainingDoctorCount: cleaned.doctors.length,
      remainingShiftTypeCount: cleaned.shiftTypes.length,
      remainingHistoryCount: Math.max(0, cleaned.scheduleHistory.length - historyIdsToDelete.length),
      removedHistoryCount: historyIdsToDelete.length
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exit(1);
});
