/**
 * ระบบบันทึกส่งงานนักเรียน (The Modern Educator Platform)
 * รองรับ ม.4 (11 ห้อง: ม.4/1 - ม.4/11), ม.5 (2 ห้อง: ม.5/1, ม.5/2) รวม 13 ห้องเรียน
 * และรองรับการสอน 5 รายวิชา พร้อมระบบ Smart Bulk Import จาก Excel
 */

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyGhv4Xzj1OFV0h7ckHx10UE4CdApjMcMInIkc-ZQJOvXqoWVqvFIYj1nytiRap8nsx/exec';
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1fP4g1aedTiymV9ZTIer0gWjTWZeewOrk6gJo2qfWjpU/edit';

const STORAGE_KEY = 'educator_app_state_v2';

const DEFAULT_CLASSROOMS = [
  'ม.4/1', 'ม.4/2', 'ม.4/3', 'ม.4/4', 'ม.4/5', 'ม.4/6',
  'ม.4/7', 'ม.4/8', 'ม.4/9', 'ม.4/10', 'ม.4/11',
  'ม.5/1', 'ม.5/2'
];

const DEFAULT_SUBJECTS = [
  { code: 'ส31101', name: 'สังคมศึกษา 1 (ม.4)' },
  { code: 'ส31102', name: 'ประวัติศาสตร์ไทย 1 (ม.4)' },
  { code: 'ส30226', name: 'กฎหมายที่ประชาชนควรรู้ (ม.ปลาย)' },
  { code: 'ส32101', name: 'สังคมศึกษา 3 (ม.5)' },
  { code: 'ส32102', name: 'ประวัติศาสตร์ไทย 2 (ม.5)' }
];

/**
 * ป้องกัน XSS และ Escape ตัวอักษรพิเศษก่อนแสดงผลลงใน HTML
 */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let appState = {
  currentTab: 'overview',
  activeClassroom: 'ม.4/1',
  activeSubject: 'ส31101',
  selectedAssignmentId: '',
  selectedStudentId: '',
  filterStatus: 'all', // 'all', 'submitted', 'pending'
  gradingMode: 'detailed', // 'detailed' or 'rapid'
  reportPage: 0, // 0 = หน้า 1 (งาน 1-10), 1 = หน้า 2, 'all' = แสดงทุกหน้า
  autoAdvance: true,
  isSyncing: false,
  isDirty: false, // ติดธงเมื่อมีข้อมูลในเครื่องที่ยังไม่ได้บันทึกลง Google Sheets
  settings: {
    gasUrl: DEFAULT_GAS_URL,
    spreadsheetUrl: SPREADSHEET_URL,
    schoolName: 'โรงเรียนสาธิตพัฒนาปัญญา',
    academicYear: '2569',
    term: '2',
    teacherName: 'คุณครูผู้สอน',
    apiToken: '',
    subjects: DEFAULT_SUBJECTS,
    classrooms: DEFAULT_CLASSROOMS
  },
  students: [],
  assignments: [],
  submissions: {} // key: `${assignmentId}_${studentId}`
};

// Undo stack สำหรับการตรวจงานล่าสุด
let lastGradingAction = null;

// State สำหรับหน้าต่าง Import
let importPreviewData = [];

let hasSavedLocalState = false;

// ----------------- Initialization -----------------
document.addEventListener('DOMContentLoaded', () => {
  loadLocalState();
  if (!hasSavedLocalState && (appState.students.length === 0 || appState.assignments.length === 0)) {
    seedDefaultState();
  }
  setupEventListeners();
  renderHeaderControls();
  renderApp();

  if (navigator.onLine && appState.settings.gasUrl) {
    trySilentFetch();
  }

  // ลงทะเบียน Service Worker สำหรับการใช้งานแบบ Offline และ PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('SW registration note:', err);
      });
    });
  }
});

function loadLocalState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appState = { ...appState, ...parsed };
      hasSavedLocalState = true;
    }
  } catch (e) {
    console.error('Error loading local state:', e);
  }

  // ป้องกัน URL เก่าที่อาจค้างใน Browser Cache
  if (!appState.settings.gasUrl || appState.settings.gasUrl.includes('AKfycbxkrB2zP2g-gEpHd32yI4RQ4pf_QE-b_YqD-BA_yYcnxWqPE5NOBXjii_jYIrlAsQKz')) {
    appState.settings.gasUrl = DEFAULT_GAS_URL;
  }
}

function saveLocalState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeClassroom: appState.activeClassroom,
      activeSubject: appState.activeSubject,
      selectedAssignmentId: appState.selectedAssignmentId,
      filterStatus: appState.filterStatus,
      gradingMode: appState.gradingMode,
      reportPage: appState.reportPage,
      autoAdvance: appState.autoAdvance,
      isDirty: appState.isDirty,
      settings: appState.settings,
      students: appState.students,
      assignments: appState.assignments,
      submissions: appState.submissions
    }));
  } catch (e) {
    console.error('Error saving local state:', e);
  }
}

// ----------------- Default Sample Data -----------------
function seedDefaultState() {
  appState.settings.subjects = DEFAULT_SUBJECTS;
  appState.settings.classrooms = DEFAULT_CLASSROOMS;
  appState.activeClassroom = 'ม.4/1';
  appState.activeSubject = 'ส31101';

  // ตัวอย่าง ม.4/1 (35 คน) และ ม.4/2 (35 คน)
  appState.students = [];
  const firstNames = ['กิตติภพ', 'กัญจน์', 'ขจรศักดิ์', 'ชนนิกานต์', 'ญาณิศา', 'ณัฐดนัย', 'ธัญญลักษณ์', 'ธีรภัทร', 'นภัสสร', 'บวรนันท์', 'ปรียาพร', 'ภัทรกร', 'วรรณวิสาข์', 'ศุภวิชญ์', 'สลิลลา', 'อัครพงศ์', 'กานต์พิชชา', 'จักรภพ', 'จิดาภา', 'ชัยวัฒน์', 'ณิชาภา', 'ธนกร', 'ปานรพี', 'ภูริพัฒน์', 'วรินทร', 'ศิรดา', 'สหรัฐ', 'อนันต์', 'เปมิกา', 'มิ่งขวัญ', 'ศุภโชค', 'สุกัญญา', 'อภิชญา', 'ภาณุพงศ์', 'ธนดล'];
  const lastNames = ['กัลยาณมิตร', 'ปรีชาชาญ', 'สุขประเสริฐ', 'รัตนากร', 'วิจิตรศิลป์', 'สมบูรณ์ทรัพย์', 'บุญชู', 'ชาญวิทย์', 'สุทธิธรรม', 'มั่นคง', 'อริยทรัพย์', 'ศรีสวัสดิ์', 'มิ่งขวัญ', 'เกียรติไพบูลย์', 'ทองทาบ', 'เจริญผล', 'ภิรมย์รักษ์', 'ชัยชูเกียรติ', 'ประเสริฐยิ่ง', 'ภักดีชน', 'เกษมสุข', 'พงษ์ศิริ', 'ศศิประภา', 'จันทร์กระจ่าง', 'ดิลกคุณ', 'สิริโชค', 'มั่งคั่ง', 'กมลรัตน์', 'โชคประเสริฐ', 'วัฒนากูล', 'เตชะกุล', 'เลิศประเสริฐ', 'สุขเกษม', 'บริรักษ์', 'ทวีโชค'];

  for (let i = 0; i < 35; i++) {
    const prefix = i % 2 === 0 ? 'ด.ช. ' : 'ด.ญ. ';
    appState.students.push({
      no: i + 1,
      studentId: String(41001 + i),
      fullName: prefix + firstNames[i] + ' ' + lastNames[i],
      classroom: 'ม.4/1',
      status: 'ปกติ'
    });
  }

  for (let i = 0; i < 35; i++) {
    const prefix = i % 2 === 0 ? 'ด.ช. ' : 'ด.ญ. ';
    appState.students.push({
      no: i + 1,
      studentId: String(42001 + i),
      fullName: prefix + firstNames[34 - i] + ' ' + lastNames[i],
      classroom: 'ม.4/2',
      status: 'ปกติ'
    });
  }

  // ตัวอย่างงานสำหรับ ม.4/1 วิชา ส31101
  appState.assignments = [
    { id: 'A01', title: '01 ใบงานโครงสร้างสังคมและการขัดเกลา', fullScore: 10, dueDate: '2026-11-10', subject: 'ส31101', classroom: 'ม.4/1' },
    { id: 'A02', title: '02 แผนผังความคิดสิทธิมนุษยชน', fullScore: 10, dueDate: '2026-11-17', subject: 'ส31101', classroom: 'ม.4/1' },
    { id: 'A03', title: '03 แบบฝึกหัดการปกครองระบอบประชาธิปไตย', fullScore: 10, dueDate: '2026-11-24', subject: 'ส31101', classroom: 'ม.4/1' },
    { id: 'A04', title: '04 รายงานวิเคราะห์คดีตัวอย่างทางกฎหมาย', fullScore: 10, dueDate: '2026-12-01', subject: 'ส31101', classroom: 'ม.4/1' },
    { id: 'A05', title: '05 ชิ้นงานสรุปหลักธรรมสากล', fullScore: 10, dueDate: '2026-12-08', subject: 'ส31101', classroom: 'ม.4/1' }
  ];

  appState.selectedAssignmentId = 'A01';
  appState.selectedStudentId = '41001';

  // จำลองข้อมูลส่งงาน
  appState.submissions = {};
  appState.assignments.forEach((assign, aIdx) => {
    appState.students.filter(s => s.classroom === assign.classroom).forEach((st, sIdx) => {
      const key = `${assign.id}_${st.studentId}`;
      const isSub = (sIdx + aIdx) % 4 !== 0;
      if (isSub) {
        appState.submissions[key] = { status: 'ส่งแล้ว', score: 8 + (sIdx % 3) };
      } else {
        appState.submissions[key] = { status: 'ค้างส่ง', score: null };
      }
    });
  });

  saveLocalState();
}

// ----------------- Header & Context Control -----------------
function renderHeaderControls() {
  const container = document.getElementById('context-selector-container');
  if (!container) return;

  const subjectOpts = appState.settings.subjects.map(s => 
    `<option value="${esc(s.code)}" ${s.code === appState.activeSubject ? 'selected' : ''}>${esc(s.code)} ${esc(s.name)}</option>`
  ).join('');

  const classOpts = appState.settings.classrooms.map(c => 
    `<option value="${esc(c)}" ${c === appState.activeClassroom ? 'selected' : ''}>${esc(c)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="context-selector-bar">
      <span class="context-label">📖 วิชา:</span>
      <select class="context-select" onchange="changeActiveSubject(this.value)">
        ${subjectOpts}
      </select>
    </div>
    <div class="context-selector-bar">
      <span class="context-label">🏫 ห้อง:</span>
      <select class="context-select" onchange="changeActiveClassroom(this.value)">
        ${classOpts}
      </select>
    </div>
  `;
}

function changeActiveSubject(subCode) {
  appState.activeSubject = subCode;
  saveLocalState();
  renderApp();
}

function changeActiveClassroom(className) {
  appState.activeClassroom = className;
  
  // ปรับงานและนักเรียนที่เลือกให้ตรงกับห้องใหม่
  const classAssignments = getFilteredAssignments();
  if (classAssignments.length > 0) {
    appState.selectedAssignmentId = classAssignments[0].id;
  }
  const classStudents = getFilteredStudents();
  if (classStudents.length > 0) {
    appState.selectedStudentId = classStudents[0].studentId;
  }

  saveLocalState();
  renderHeaderControls();
  renderApp();
}

function setupEventListeners() {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  const syncBtn = document.getElementById('manual-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', triggerManualSync);
  }

  // แป้นพิมพ์ลัดสำหรับคอมพิวเตอร์และ iPad ที่ต่อคีย์บอร์ด
  window.addEventListener('keydown', handleGlobalKeydown);

  // ตรวจจับเมื่ออุปกรณ์กลับมาต่อเน็ต ให้ Push ข้อมูลที่ค้างอยู่ขึ้นชีท
  window.addEventListener('online', () => {
    if (appState.isDirty && appState.settings.gasUrl) {
      showToast('📶 ตรวจพบสัญญาณอินเทอร์เน็ต กำลังซิงค์ข้อมูลค้างขึ้น Google Sheets...');
      pushFullStateToBackend().then(() => {
        showToast('✓ ซิงค์ข้อมูลค้างขึ้น Google Sheets เรียบร้อย');
      }).catch(() => {});
    }
  });

  // เมื่อสลับกลับมาที่หน้าเว็บนี้ และมีข้อมูลค้างอยู่ ให้ส่งขึ้น Google Sheets ทันที
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && appState.isDirty && appState.settings.gasUrl) {
      pushFullStateToBackend().catch(() => {});
    }
  });
}

function handleGlobalKeydown(e) {
  if (appState.currentTab !== 'grading') return;
  // หากกำลังพิมพ์ในช่องค้นหาหรือช่องกรอกตัวเลข ไม่ดักจับปุ่มลัด
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateStudent(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateStudent(1);
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (appState.selectedStudentId) {
      toggleStudentStatusById(appState.selectedStudentId);
    }
  } else if (e.key >= '0' && e.key <= '9') {
    const currentAssignments = getFilteredAssignments();
    const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
    const score = Number(e.key);
    if (currentAssignment && score <= (currentAssignment.fullScore || 5)) {
      e.preventDefault();
      applyScore(score);
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoLastGrading();
  }
}

function switchTab(tabName) {
  appState.currentTab = tabName;
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  renderApp();
}

// ----------------- Filter Utilities -----------------
function getFilteredStudents() {
  return appState.students.filter(s => s.classroom === appState.activeClassroom);
}

function getFilteredAssignments() {
  return appState.assignments.filter(a => 
    (a.classroom === appState.activeClassroom || !a.classroom) &&
    (a.subject === appState.activeSubject || !a.subject)
  );
}

function getActiveSubjectObj() {
  return appState.settings.subjects.find(s => s.code === appState.activeSubject) || { code: appState.activeSubject, name: '' };
}

// ----------------- Views Router (พร้อม Error Boundary) -----------------
function renderApp() {
  const container = document.getElementById('app-view-container');
  if (!container) return;

  try {
    switch (appState.currentTab) {
      case 'overview': renderOverview(container); break;
      case 'grading': renderGrading(container); break;
      case 'report': renderReport(container); break;
      case 'students': renderStudents(container); break;
      case 'assignments': renderAssignments(container); break;
      case 'settings': renderSettings(container); break;
      default: renderOverview(container);
    }
  } catch (err) {
    console.error('Fatal rendering error:', err);
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.5rem; max-width: 600px; margin: 2rem auto;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
        <h3 style="color: var(--danger); margin-bottom: 0.5rem;">เกิดข้อผิดพลาดในการแสดงผล</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
          ${err.message || 'ไม่สามารถโหลดหน้าจอนี้ได้ ข้อมูลของคุณยังปลอดภัยอยู่ในเครื่อง'}
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center;">
          <button class="btn btn-primary" onclick="window.location.reload()">🔄 โหลดหน้าเว็บใหม่</button>
          <button class="btn btn-secondary" onclick="pullFromGoogleSheets(true)">☁️ ดึงข้อมูลจากชีท</button>
        </div>
      </div>
    `;
  }
}

// ----------------- View: Overview / Dashboard -----------------
function renderOverview(container) {
  const currentStudents = getFilteredStudents();
  const currentAssignments = getFilteredAssignments();
  const subjectObj = getActiveSubjectObj();

  const totalStudents = currentStudents.length;
  const totalAssignments = currentAssignments.length;
  const totalExpected = totalStudents * totalAssignments;

  let totalSubmitted = 0;
  let totalPending = 0;

  currentAssignments.forEach(assign => {
    currentStudents.forEach(st => {
      const key = `${assign.id}_${st.studentId}`;
      const sub = appState.submissions[key];
      if (sub && sub.status === 'ส่งแล้ว') totalSubmitted++;
      else totalPending++;
    });
  });

  const percentage = totalExpected > 0 ? Math.round((totalSubmitted / totalExpected) * 100) : 0;
  const strokeDashoffset = 283 - (283 * percentage) / 100;

  // คำนวณรายชื่อนักเรียนที่ค้างส่งสะสมสูงสุดในห้องนี้ (Top 5)
  const studentPendingCounts = currentStudents.map(st => {
    let pending = 0;
    currentAssignments.forEach(assign => {
      const key = `${assign.id}_${st.studentId}`;
      const sub = appState.submissions[key];
      if (!sub || sub.status !== 'ส่งแล้ว') pending++;
    });
    return { ...st, pendingCount: pending };
  }).filter(s => s.pendingCount > 0)
    .sort((a, b) => b.pendingCount - a.pendingCount)
    .slice(0, 5);

  let riskCardHtml = '';
  if (currentAssignments.length > 0 && studentPendingCounts.length > 0) {
    const itemsHtml = studentPendingCounts.map(st => `
      <div class="risk-student-item">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-weight: 700; color: var(--text-muted); width: 28px;">#${st.no}</span>
          <div>
            <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">${esc(st.fullName)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">รหัส ${esc(st.studentId)} • ห้อง ${esc(st.classroom)}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span class="risk-badge">⚠️ ค้าง ${st.pendingCount} งาน</span>
          <button class="btn btn-secondary btn-sm" onclick="quickJumpToGrade('${esc(st.studentId)}')" style="padding: 0.25rem 0.65rem; font-size: 0.8rem;">
            ✏️ ตรวจงาน
          </button>
        </div>
      </div>
    `).join('');

    riskCardHtml = `
      <div class="card" style="margin-top: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.875rem; flex-wrap: wrap; gap: 0.5rem;">
          <h3 style="font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; color: var(--text-main); margin: 0;">
            <span>⚠️</span> นักเรียนที่ค้างส่งสะสมสูงสุด (ห้อง ${esc(appState.activeClassroom)})
          </h3>
          <span style="font-size: 0.8rem; color: var(--text-muted);">ลำดับความสำคัญในการติดตามงานก่อนตัดเกรด</span>
        </div>
        <div>
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  // แถบห้องเรียนด่วน
  const classPillsHtml = appState.settings.classrooms.map(c => {
    const count = appState.students.filter(s => s.classroom === c).length;
    const isActive = c === appState.activeClassroom;
    return `
      <button class="class-pill ${isActive ? 'active' : ''}" onclick="changeActiveClassroom('${esc(c)}')">
        ${esc(c)} <span class="badge">${count} คน</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <!-- แถบเลือกห้องเรียนด่วน (13 ห้อง) -->
    <div class="classroom-pill-strip">
      <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); white-space: nowrap;">เลือกระดับชั้น:</span>
      ${classPillsHtml}
    </div>

    <div class="overview-grid">
      <div>
        <div class="card" style="margin-bottom: 1.25rem;">
          <div class="card-header">
            <div>
              <h2 class="card-title">${esc(subjectObj.code)} ${esc(subjectObj.name)} • ห้อง ${esc(appState.activeClassroom)}</h2>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                ภาคเรียนที่ ${esc(appState.settings.term)} ปีการศึกษา ${esc(appState.settings.academicYear)} | ${esc(appState.settings.schoolName)}
              </p>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" onclick="openImportModal('${esc(appState.activeClassroom)}')">
                📥 นำเข้ารายชื่อ ${esc(appState.activeClassroom)}
              </button>
              <button class="btn btn-primary" onclick="switchTab('grading')">
                ✏️ เช็กส่งงานห้องนี้
              </button>
            </div>
          </div>

          <div class="stats-ribbon">
            <div class="stat-box">
              <div class="stat-label">นักเรียนห้อง ${esc(appState.activeClassroom)}</div>
              <div class="stat-value">${totalStudents} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-secondary);">คน</span></div>
            </div>
            <div class="stat-box">
              <div class="stat-label">งานในห้องนี้</div>
              <div class="stat-value">${totalAssignments} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-secondary);">ชิ้น</span></div>
            </div>
            <div class="stat-box success">
              <div class="stat-label">ส่งแล้ว</div>
              <div class="stat-value">${totalSubmitted} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-secondary);">ครั้ง</span></div>
            </div>
            <div class="stat-box warning">
              <div class="stat-label">ค้างส่ง</div>
              <div class="stat-value">${totalPending} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-secondary);">ครั้ง</span></div>
            </div>
          </div>

          <h3 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem;">เมนูดำเนินการด่วน</h3>
          <div class="quick-action-grid">
            <button class="action-tile-btn" onclick="switchTab('grading')">
              <span class="tile-icon">📝</span>
              <div>
                <div class="tile-title">ตรวจงานห้อง ${esc(appState.activeClassroom)}</div>
                <div class="tile-desc">แผงตัวเลขด่วนบนไอแพด</div>
              </div>
            </button>
            <button class="action-tile-btn" onclick="openImportModal('${esc(appState.activeClassroom)}')">
              <span class="tile-icon">📋</span>
              <div>
                <div class="tile-title">นำเข้ารายชื่อจาก Excel</div>
                <div class="tile-desc">วางรายชื่อ ม.4 และ ม.5 ทีละห้อง</div>
              </div>
            </button>
            <button class="action-tile-btn" onclick="switchTab('report')">
              <span class="tile-icon">📄</span>
              <div>
                <div class="tile-title">พิมพ์รายงาน A4 แนวนอน</div>
                <div class="tile-desc">10 งานต่อหน้า แยกรายห้อง</div>
              </div>
            </button>
            <button class="action-tile-btn" onclick="switchTab('students')">
              <span class="tile-icon">👥</span>
              <div>
                <div class="tile-title">ดูนักเรียนทั้งหมด (${appState.students.length} คน)</div>
                <div class="tile-desc">ครอบคลุม 13 ห้องเรียน</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div>
        <div class="card donut-container">
          <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem;">สัดส่วนส่งงานห้อง ${appState.activeClassroom}</h3>
          <div style="position: relative; width: 160px; height: 160px;">
            <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; transform: rotate(-90deg);">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#FEE2E2" stroke-width="10" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="#10B981" stroke-width="10"
                stroke-dasharray="283" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" />
            </svg>
            <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <span style="font-size: 1.85rem; font-weight: 700; color: var(--text-main);">${percentage}%</span>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">ส่งครบ</span>
            </div>
          </div>
          <div class="chart-legend">
            <div class="legend-item">
              <span class="legend-dot" style="background: #10B981;"></span>
              <span>ส่งแล้ว (${totalSubmitted})</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #EF4444;"></span>
              <span>ค้างส่ง (${totalPending})</span>
            </div>
          </div>
          <div style="margin-top: 1.25rem; width: 100%; border-top: 1px solid var(--border-light); padding-top: 1rem; text-align: center; display: flex; flex-direction: column; gap: 0.5rem;">
            <button class="btn btn-secondary btn-sm" onclick="pullFromGoogleSheets(true)" style="width: 100%;">
              ☁️ ดึงข้อมูลล่าสุดจาก Google Sheets
            </button>
            <a href="${appState.settings.spreadsheetUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 0.85rem; color: var(--primary); text-decoration: none; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
              <span>📊 เปิดดูชีทจริงใน Google Drive</span> ↗
            </a>
          </div>
        </div>
      </div>
    </div>

    ${riskCardHtml}
  `;
}

function quickJumpToGrade(studentId) {
  appState.selectedStudentId = studentId;
  switchTab('grading');
}

// ----------------- View: Grading (Touch & Numpad) -----------------
function renderGrading(container) {
  const currentStudents = getFilteredStudents();
  const currentAssignments = getFilteredAssignments();

  if (currentAssignments.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2rem;">
        <h3>ยังไม่มีรายการงานสำหรับวิชา ${esc(appState.activeSubject)} ในห้อง ${esc(appState.activeClassroom)}</h3>
        <p style="color: var(--text-secondary); margin: 0.75rem 0;">คุณสามารถเพิ่มงานใหม่สำหรับห้องนี้ได้ทันที</p>
        <button class="btn btn-primary" onclick="switchTab('assignments')">+ เพิ่มงานใหม่</button>
      </div>
    `;
    return;
  }

  // จำตำแหน่ง Scroll เดิมของรายชื่อนักเรียน เพื่อไม่ให้เด้งไปบนสุดเวลาแตะให้คะแนน
  const studentListEl = container.querySelector('.student-list');
  const savedScrollTop = studentListEl ? studentListEl.scrollTop : 0;

  let currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  appState.selectedAssignmentId = currentAssignment.id;

  let submittedCount = 0;
  let pendingCount = 0;
  currentStudents.forEach(st => {
    const key = `${currentAssignment.id}_${st.studentId}`;
    const sub = appState.submissions[key];
    if (sub && sub.status === 'ส่งแล้ว') submittedCount++;
    else pendingCount++;
  });

  const filteredStudents = currentStudents.filter(st => {
    const key = `${currentAssignment.id}_${st.studentId}`;
    const sub = appState.submissions[key] || { status: 'ค้างส่ง' };
    if (appState.filterStatus === 'submitted') return sub.status === 'ส่งแล้ว';
    if (appState.filterStatus === 'pending') return sub.status === 'ค้างส่ง';
    return true;
  });

  let activeStudent = currentStudents.find(s => s.studentId === appState.selectedStudentId) || currentStudents[0];
  if (activeStudent) appState.selectedStudentId = activeStudent.studentId;

  const activeSubmissionKey = activeStudent ? `${currentAssignment.id}_${activeStudent.studentId}` : '';
  const activeSubmission = activeStudent ? (appState.submissions[activeSubmissionKey] || { status: 'ค้างส่ง', score: null }) : null;

  // สร้างปุ่ม Numpad แบบไดนามิกตามคะแนนเต็มจริง (fullScore)
  const maxScore = currentAssignment.fullScore || 5;
  let numpadButtonsHtml = '';
  if (maxScore <= 10) {
    const btns = [];
    for (let s = maxScore; s >= 0; s--) {
      btns.push(`<button class="numpad-btn ${s === maxScore ? 'full-score' : ''}" onclick="applyScore(${s})">${s === maxScore ? '🌟 ' : ''}${s}</button>`);
    }
    numpadButtonsHtml = btns.join('');
  } else {
    const steps = [maxScore, Math.round(maxScore * 0.9), Math.round(maxScore * 0.8), Math.round(maxScore * 0.7), Math.round(maxScore * 0.6), Math.round(maxScore * 0.5), Math.round(maxScore * 0.4), 0];
    const uniqueSteps = [...new Set(steps)].sort((a,b) => b - a);
    numpadButtonsHtml = uniqueSteps.map(s => `
      <button class="numpad-btn ${s === maxScore ? 'full-score' : ''}" onclick="applyScore(${s})">
        ${s === maxScore ? '🌟 ' : ''}${s}
      </button>
    `).join('');
  }

  container.innerHTML = `
    <div class="assignment-bar">
      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="font-weight: 600; font-size: 0.95rem;">เลือกงาน:</span>
        <select class="select-control" id="assignment-select" onchange="changeAssignment(this.value)">
          ${currentAssignments.map(a => `
            <option value="${esc(a.id)}" ${a.id === currentAssignment.id ? 'selected' : ''}>
              ${esc(a.title)} (เต็ม ${a.fullScore})
            </option>
          `).join('')}
        </select>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" onclick="navigateAssignment(-1)">◀ ก่อนหน้า</button>
          <button class="btn btn-secondary btn-sm" onclick="navigateAssignment(1)">ถัดไป ▶</button>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <div class="mode-toggle-group">
          <button class="mode-btn ${appState.gradingMode === 'rapid' ? 'active' : ''}" onclick="setGradingMode('rapid')" title="แตะชื่อนักเรียน = ส่งแล้วและได้คะแนนเต็มทันที">
            ⚡ ตรวจด่วน
          </button>
          <button class="mode-btn ${appState.gradingMode === 'detailed' ? 'active' : ''}" onclick="setGradingMode('detailed')" title="แตะเลือกนักเรียน แล้วกดให้คะแนนบนแป้นตัวเลข">
            📝 ตรวจละเอียด
          </button>
        </div>
        <span style="font-size: 0.85rem; color: var(--text-secondary);">
          ส่งแล้ว <strong>${submittedCount}</strong> / ค้าง <strong>${pendingCount}</strong> (ห้อง ${esc(appState.activeClassroom)})
        </span>
        <button class="btn btn-success btn-sm" onclick="markAllRemainingAsSubmitted()">
          ⚡ ส่งแล้วทุกคนที่เหลือ
        </button>
      </div>
    </div>

    <div class="grading-layout">
      <!-- รายชื่อนักเรียน -->
      <div class="student-table-container">
        <div class="table-action-bar">
          <div class="filter-pills">
            <button class="pill-btn ${appState.filterStatus === 'all' ? 'active' : ''}" onclick="setFilter('all')">
              ทั้งหมด (${currentStudents.length})
            </button>
            <button class="pill-btn ${appState.filterStatus === 'submitted' ? 'active' : ''}" onclick="setFilter('submitted')">
              ส่งแล้ว (${submittedCount})
            </button>
            <button class="pill-btn ${appState.filterStatus === 'pending' ? 'active' : ''}" onclick="setFilter('pending')">
              ค้างส่ง (${pendingCount})
            </button>
          </div>
          <span style="font-size: 0.8rem; color: var(--text-secondary);">
            ${appState.gradingMode === 'rapid' ? '⚡ โหมดตรวจด่วน: แตะแถวนักเรียนเพื่อเช็คส่งเต็มคะแนน' : '📝 แตะนักเรียนเพื่อให้คะแนน'}
          </span>
        </div>

        <div class="student-list">
          ${filteredStudents.length > 0 ? filteredStudents.map(st => {
            const key = `${currentAssignment.id}_${st.studentId}`;
            const sub = appState.submissions[key] || { status: 'ค้างส่ง', score: null };
            const isSelected = activeStudent && st.studentId === activeStudent.studentId;
            const isSubmitted = sub.status === 'ส่งแล้ว';
            const rowClickAction = appState.gradingMode === 'rapid'
              ? `quickGradeStudent('${esc(st.studentId)}')`
              : `selectStudent('${esc(st.studentId)}')`;

            return `
              <div class="student-row ${isSelected ? 'selected' : ''}" onclick="${rowClickAction}">
                <span class="student-no">${st.no}</span>
                <span class="student-code col-code">${esc(st.studentId)}</span>
                <span class="student-name">${esc(st.fullName)}</span>
                <div>
                  <span class="status-badge ${isSubmitted ? 'submitted' : 'pending'}" onclick="toggleStudentStatus(event, '${esc(st.studentId)}')">
                    ${isSubmitted ? '✓ ส่งแล้ว' : '✕ ค้างส่ง'}
                  </span>
                </div>
                <div class="score-display ${sub.score !== null && sub.score !== '' ? '' : 'empty'}">
                  ${sub.score !== null && sub.score !== '' ? sub.score : '-'}
                </div>
              </div>
            `;
          }).join('') : `
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
              ไม่พบนักเรียนในห้อง ${esc(appState.activeClassroom)}
              <br><button class="btn btn-primary btn-sm" style="margin-top: 0.75rem;" onclick="openImportModal('${esc(appState.activeClassroom)}')">📥 นำเข้ารายชื่อห้องนี้</button>
            </div>
          `}
        </div>
      </div>

      <!-- แป้นตัวเลขบนหน้าจอ (Touch Numpad สำหรับ iPad และมือถือ) -->
      <div>
        <div class="keypad-panel">
          ${activeStudent ? `
            <div class="active-student-card">
              <div class="active-student-no">เลขที่ ${activeStudent.no} • รหัส ${esc(activeStudent.studentId)} • ห้อง ${esc(activeStudent.classroom)}</div>
              <div class="active-student-title">${esc(activeStudent.fullName)}</div>
              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
                สถานะ: <strong>${activeSubmission.status}</strong> 
                ${activeSubmission.score !== null && activeSubmission.score !== '' ? `| คะแนน: <strong style="color: var(--primary); font-size: 1.15rem;">${activeSubmission.score}</strong>` : ''}
              </div>
            </div>

            <div class="status-toggle-row">
              <button class="toggle-opt-btn ${activeSubmission.status === 'ส่งแล้ว' ? 'active-submitted' : ''}"
                onclick="setStudentStatus('${esc(activeStudent.studentId)}', 'ส่งแล้ว')">
                ✓ ส่งแล้ว
              </button>
              <button class="toggle-opt-btn ${activeSubmission.status === 'ค้างส่ง' ? 'active-pending' : ''}"
                onclick="setStudentStatus('${esc(activeStudent.studentId)}', 'ค้างส่ง')">
                ✕ ค้างส่ง
              </button>
            </div>

            <div class="quick-score-grid">
              ${numpadButtonsHtml}
            </div>

            <div style="display: flex; gap: 0.35rem; margin-top: 0.5rem; align-items: center;">
              <input type="number" id="custom-score-input" class="form-input" style="padding: 0.35rem 0.5rem; font-size: 0.85rem;" placeholder="ระบุคะแนนเอง (เช่น 7.5)" step="0.5" min="0" max="${maxScore}" onkeydown="if(event.key==='Enter') applyCustomScore(${maxScore})" />
              <button class="btn btn-secondary btn-sm" onclick="applyCustomScore(${maxScore})" style="white-space: nowrap;">✓ ให้คะแนน</button>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
              <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="navigateStudent(-1)">
                ▲ คนก่อนหน้า
              </button>
              <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="navigateStudent(1)">
                ▼ คนถัดไป
              </button>
            </div>

            <div class="advance-toggle-container">
              <span>ข้ามไปคนถัดไปอัตโนมัติ</span>
              <input type="checkbox" ${appState.autoAdvance ? 'checked' : ''} onchange="toggleAutoAdvance(this.checked)">
            </div>
          ` : `
            <p style="color: var(--text-muted); text-align: center;">แตะเลือกนักเรียนในตารางเพื่อบันทึกคะแนน</p>
          `}
        </div>
      </div>
    </div>
  `;

  // คืนตำแหน่ง Scroll ให้คงที่ ไม่เด้งกลับไปบนสุด
  const newStudentListEl = container.querySelector('.student-list');
  if (newStudentListEl && savedScrollTop > 0) {
    newStudentListEl.scrollTop = savedScrollTop;
  }
}

function applyCustomScore(max) {
  const input = document.getElementById('custom-score-input');
  if (!input || input.value === '') return;
  let val = parseFloat(input.value);
  if (isNaN(val)) return;
  if (val < 0) val = 0;
  if (max !== undefined && val > max) val = max;
  applyScore(val);
}

// ----------------- Grading Actions -----------------
function changeAssignment(assignId) {
  appState.selectedAssignmentId = assignId;
  saveLocalState();
  renderGrading(document.getElementById('app-view-container'));
}

function navigateAssignment(step) {
  const currentAssignments = getFilteredAssignments();
  const currentIdx = currentAssignments.findIndex(a => a.id === appState.selectedAssignmentId);
  const nextIdx = currentIdx + step;
  if (nextIdx >= 0 && nextIdx < currentAssignments.length) {
    changeAssignment(currentAssignments[nextIdx].id);
  }
}

function selectStudent(studentId) {
  appState.selectedStudentId = studentId;
  renderGrading(document.getElementById('app-view-container'));
}

function navigateStudent(step) {
  const currentStudents = getFilteredStudents();
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];

  // เลื่อนตาม Filter ที่กำลังเปิดดูอยู่จริง (ทั้งหมด, ส่งแล้ว, ค้างส่ง)
  const visibleStudents = currentStudents.filter(st => {
    if (!currentAssignment) return true;
    const key = `${currentAssignment.id}_${st.studentId}`;
    const sub = appState.submissions[key] || { status: 'ค้างส่ง' };
    if (appState.filterStatus === 'submitted') return sub.status === 'ส่งแล้ว';
    if (appState.filterStatus === 'pending') return sub.status === 'ค้างส่ง';
    return true;
  });

  if (visibleStudents.length === 0) {
    renderGrading(document.getElementById('app-view-container'));
    return;
  }

  const currentIdx = visibleStudents.findIndex(s => s.studentId === appState.selectedStudentId);
  const nextIdx = currentIdx + step;

  if (nextIdx >= 0 && nextIdx < visibleStudents.length) {
    selectStudent(visibleStudents[nextIdx].studentId);
  } else {
    // หากถึงคนสุดท้ายของห้อง ให้อัปเดตตารางแสดงผลทันที เพื่อแสดงคะแนนที่เพิ่งให้ไป
    renderGrading(document.getElementById('app-view-container'));
  }
}

function setFilter(filter) {
  appState.filterStatus = filter;
  renderGrading(document.getElementById('app-view-container'));
}

function toggleAutoAdvance(checked) {
  appState.autoAdvance = checked;
  saveLocalState();
}

function setGradingMode(mode) {
  appState.gradingMode = mode;
  saveLocalState();
  renderGrading(document.getElementById('app-view-container'));
  if (mode === 'rapid') {
    showToast('⚡ เปิดโหมดตรวจด่วน: แตะชื่อนักเรียนเพื่อเช็คส่งเต็มคะแนนทันที');
  } else {
    showToast('📝 เปิดโหมดตรวจละเอียด: เลือกนักเรียนแล้วกดให้คะแนนบนแป้นตัวเลข');
  }
}

function quickGradeStudent(studentId) {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment) return;

  const currentStudents = getFilteredStudents();
  const student = currentStudents.find(s => s.studentId === studentId);
  const studentName = student ? student.fullName : `รหัส ${studentId}`;

  const key = `${currentAssignment.id}_${studentId}`;
  const prevSub = appState.submissions[key] ? { ...appState.submissions[key] } : { status: 'ค้างส่ง', score: null };

  // บันทึกข้อมูลสำหรับเลิกทำ (Undo)
  lastGradingAction = {
    studentId: studentId,
    studentName: studentName,
    assignmentId: currentAssignment.id,
    previousState: prevSub
  };

  const nextStatus = prevSub.status === 'ส่งแล้ว' ? 'ค้างส่ง' : 'ส่งแล้ว';
  const fullScore = currentAssignment.fullScore || 5;
  const nextScore = nextStatus === 'ส่งแล้ว' ? fullScore : null;

  appState.submissions[key] = {
    ...prevSub,
    status: nextStatus,
    score: nextScore,
    updatedAt: new Date().toISOString()
  };

  appState.selectedStudentId = studentId;
  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync();

  if (nextStatus === 'ส่งแล้ว') {
    showToastWithAction(`✓ ${studentName} ได้ ${nextScore}/${fullScore} คะแนน`, '↩️ เลิกทำ', undoLastGrading);
  } else {
    showToastWithAction(`✕ ${studentName} ปรับเป็นค้างส่ง`, '↩️ เลิกทำ', undoLastGrading);
  }

  if (appState.autoAdvance && nextStatus === 'ส่งแล้ว') {
    navigateStudent(1);
  } else {
    renderGrading(document.getElementById('app-view-container'));
  }
}

function undoLastGrading() {
  if (!lastGradingAction) return;
  const { studentId, studentName, assignmentId, previousState } = lastGradingAction;
  const key = `${assignmentId}_${studentId}`;

  appState.submissions[key] = { ...previousState };
  appState.selectedStudentId = studentId;
  appState.selectedAssignmentId = assignmentId;
  lastGradingAction = null;
  appState.isDirty = true;

  saveLocalState();
  scheduleAutoSync();
  renderGrading(document.getElementById('app-view-container'));
  showToast(`↩️ คืนสถานะเดิมของ ${studentName} เรียบร้อยแล้ว`);
}

function toggleStudentStatusById(studentId) {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment) return;

  const currentStudents = getFilteredStudents();
  const student = currentStudents.find(s => s.studentId === studentId);
  const studentName = student ? student.fullName : `รหัส ${studentId}`;

  const key = `${currentAssignment.id}_${studentId}`;
  const current = appState.submissions[key] || { status: 'ค้างส่ง', score: null };
  const nextStatus = current.status === 'ส่งแล้ว' ? 'ค้างส่ง' : 'ส่งแล้ว';

  lastGradingAction = {
    studentId: studentId,
    studentName: studentName,
    assignmentId: currentAssignment.id,
    previousState: { ...current }
  };

  appState.submissions[key] = {
    ...current,
    status: nextStatus,
    score: nextStatus === 'ส่งแล้ว' ? (current.score != null ? current.score : currentAssignment.fullScore) : null,
    updatedAt: new Date().toISOString()
  };

  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync();
  showToastWithAction(`${nextStatus === 'ส่งแล้ว' ? '✓' : '✕'} ${studentName} (${nextStatus})`, '↩️ เลิกทำ', undoLastGrading);
  renderGrading(document.getElementById('app-view-container'));
}

function toggleStudentStatus(event, studentId) {
  event.stopPropagation();
  toggleStudentStatusById(studentId);
}

function setStudentStatus(studentId, status) {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment) return;

  const currentStudents = getFilteredStudents();
  const student = currentStudents.find(s => s.studentId === studentId);
  const studentName = student ? student.fullName : `รหัส ${studentId}`;

  const key = `${currentAssignment.id}_${studentId}`;
  const current = appState.submissions[key] || {};

  lastGradingAction = {
    studentId: studentId,
    studentName: studentName,
    assignmentId: currentAssignment.id,
    previousState: { ...current }
  };

  appState.submissions[key] = {
    ...current,
    status: status,
    score: status === 'ส่งแล้ว' ? (current.score != null ? current.score : currentAssignment.fullScore) : null,
    updatedAt: new Date().toISOString()
  };

  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync();
  showToastWithAction(`${status === 'ส่งแล้ว' ? '✓' : '✕'} ${studentName} (${status})`, '↩️ เลิกทำ', undoLastGrading);
  renderGrading(document.getElementById('app-view-container'));
}

function applyScore(score) {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment || !appState.selectedStudentId) return;

  const currentStudents = getFilteredStudents();
  const student = currentStudents.find(s => s.studentId === appState.selectedStudentId);
  const studentName = student ? student.fullName : `รหัส ${appState.selectedStudentId}`;

  const key = `${currentAssignment.id}_${appState.selectedStudentId}`;
  const prevSub = appState.submissions[key] ? { ...appState.submissions[key] } : { status: 'ค้างส่ง', score: null };

  lastGradingAction = {
    studentId: appState.selectedStudentId,
    studentName: studentName,
    assignmentId: currentAssignment.id,
    previousState: prevSub
  };

  appState.submissions[key] = {
    ...prevSub,
    status: 'ส่งแล้ว',
    score: Number(score),
    updatedAt: new Date().toISOString()
  };

  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync();

  showToastWithAction(`✓ ${studentName} ได้ ${score} คะแนน`, '↩️ เลิกทำ', undoLastGrading);

  if (appState.autoAdvance) {
    navigateStudent(1);
  } else {
    renderGrading(document.getElementById('app-view-container'));
  }
}

function markAllRemainingAsSubmitted() {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment) return;

  let count = 0;
  getFilteredStudents().forEach(st => {
    const key = `${currentAssignment.id}_${st.studentId}`;
    const sub = appState.submissions[key];
    if (!sub || sub.status !== 'ส่งแล้ว') {
      appState.submissions[key] = {
        status: 'ส่งแล้ว',
        score: currentAssignment.fullScore
      };
      count++;
    }
  });

  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync();
  showToast(`บันทึกส่งแล้ว ${count} คนในห้อง ${appState.activeClassroom} เรียบร้อย`);
  renderGrading(document.getElementById('app-view-container'));
}

// ----------------- View: Report (A4 Landscape Matrix with Pagination) -----------------
function setReportPage(page) {
  appState.reportPage = page;
  saveLocalState();
  const container = document.getElementById('app-view-container');
  if (container) renderReport(container);
}

function handlePrintReport(all = false) {
  if (all) {
    appState.reportPage = 'all';
    saveLocalState();
    const container = document.getElementById('app-view-container');
    if (container) renderReport(container);
    setTimeout(() => {
      window.print();
    }, 150);
  } else {
    window.print();
  }
}

function renderReport(container) {
  const currentAssignments = getFilteredAssignments();
  const currentStudents = getFilteredStudents();
  const subjectObj = getActiveSubjectObj();

  if (currentAssignments.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.5rem;">
        <h3>ยังไม่มีรายการงานสำหรับห้อง ${esc(appState.activeClassroom)}</h3>
        <p style="color: var(--text-secondary); margin: 0.75rem 0;">กรุณาเพิ่มงานในเมนู "งานที่สั่ง" ก่อนพิมพ์รายงาน</p>
        <button class="btn btn-primary" onclick="switchTab('assignments')">+ เพิ่มงานใหม่</button>
      </div>
    `;
    return;
  }

  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(currentAssignments.length / PAGE_SIZE) || 1;

  // ตรวจสอบค่า appState.reportPage
  let activePage = appState.reportPage;
  if (activePage !== 'all') {
    if (typeof activePage !== 'number' || activePage < 0 || activePage >= totalPages) {
      activePage = 0;
      appState.reportPage = 0;
    }
  }

  // สร้าง tabs เลือกหน้า หากมีงานมากกว่า 10 รายการ
  let tabsHtml = '';
  if (totalPages > 1) {
    const tabButtons = [];
    for (let p = 0; p < totalPages; p++) {
      const start = p * PAGE_SIZE + 1;
      const end = Math.min((p + 1) * PAGE_SIZE, currentAssignments.length);
      const isActive = activePage === p;
      tabButtons.push(`
        <button class="report-page-btn ${isActive ? 'active' : ''}" onclick="setReportPage(${p})">
          📄 หน้า ${p + 1} (งานที่ ${start}-${end})
        </button>
      `);
    }
    const isAllActive = activePage === 'all';
    tabButtons.push(`
      <button class="report-page-btn ${isAllActive ? 'active' : ''}" onclick="setReportPage('all')">
        📑 แสดงทุกหน้า A4 (${totalPages} หน้า)
      </button>
    `);

    tabsHtml = `
      <div class="report-page-tabs">
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); align-self: center; margin-right: 0.25rem;">
          📑 เลือกชุดงาน (A4 ละ 10 งาน):
        </span>
        ${tabButtons.join('')}
      </div>
    `;
  }

  // กำหนดว่าแผ่นงานไหนบ้างที่จะ render
  const pagesToRender = [];
  if (activePage === 'all') {
    for (let p = 0; p < totalPages; p++) pagesToRender.push(p);
  } else {
    pagesToRender.push(activePage);
  }

  const sheetsHtml = pagesToRender.map(pIdx => {
    const startIdx = pIdx * PAGE_SIZE;
    const pageAssignments = currentAssignments.slice(startIdx, startIdx + PAGE_SIZE);
    const startNum = startIdx + 1;
    const endNum = Math.min(startIdx + PAGE_SIZE, currentAssignments.length);

    let maxScorePageSum = 0;
    pageAssignments.forEach(a => { maxScorePageSum += (Number(a.fullScore) || 0); });

    return `
      <div class="printable-sheet" style="margin-bottom: 2rem;">
        <div class="sheet-header-text">
          <h2>${esc(appState.settings.schoolName)}</h2>
          <p>
            รายวิชา ${esc(subjectObj.name)} (${esc(subjectObj.code)}) &nbsp;|&nbsp; 
            ชั้นมัธยมศึกษาปีที่ ${esc(appState.activeClassroom)} &nbsp;|&nbsp; 
            ภาคเรียนที่ ${esc(appState.settings.term)} ปีการศึกษา ${esc(appState.settings.academicYear)}
          </p>
          <p style="margin-top: 2px;">
            ครูผู้สอน: ${esc(appState.settings.teacherName)}
            ${totalPages > 1 ? `&nbsp;|&nbsp; <strong>แผ่นที่ ${pIdx + 1}/${totalPages} (งานที่ ${startNum}-${endNum})</strong>` : ''}
          </p>
        </div>

        <table class="matrix-table">
          <thead>
            <tr>
              <th rowspan="2" style="width: 36px; text-align: center;">เลขที่</th>
              <th rowspan="2" style="width: 58px; text-align: center;">รหัส</th>
              <th rowspan="2" style="width: 150px; text-align: left; padding-left: 10px;">ชื่อ-นามสกุล</th>
              ${pageAssignments.map(a => `
                <th rowspan="2" class="task-header" title="${esc(a.title)}">
                  <div style="font-weight: 700; font-size: 0.82rem; color: var(--primary);">${esc(a.id)}</div>
                  <div style="font-size: 0.68rem; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72px; margin: 1px auto;">${esc(a.title)}</div>
                  <div style="font-size: 0.65rem; color: #64748B; font-weight: normal;">(เต็ม ${a.fullScore})</div>
                </th>
              `).join('')}
              <th colspan="3" style="text-align: center; background: #F1F5F9;">สรุป</th>
            </tr>
            <tr>
              <th style="width: 34px; text-align: center; font-size: 0.75rem;">ส่ง</th>
              <th style="width: 34px; text-align: center; font-size: 0.75rem;">ค้าง</th>
              <th style="width: 50px; text-align: center; font-size: 0.75rem;">รวม</th>
            </tr>
          </thead>
          <tbody>
            ${currentStudents.map(st => {
              let submittedSum = 0;
              let pendingSum = 0;
              let scoreSum = 0;

              const taskCols = pageAssignments.map(a => {
                const key = `${a.id}_${st.studentId}`;
                const sub = appState.submissions[key];
                if (sub && sub.status === 'ส่งแล้ว') {
                  submittedSum++;
                  const sc = sub.score !== null && sub.score !== undefined && sub.score !== '' ? Number(sub.score) : 0;
                  scoreSum += sc;
                  return `<td class="cell-score" style="text-align: center;">${sc}</td>`;
                } else {
                  pendingSum++;
                  return `<td class="cell-missing" style="text-align: center;">ค้าง</td>`;
                }
              }).join('');

              return `
                <tr>
                  <td style="text-align: center; font-weight: 600; color: #64748B;">${st.no}</td>
                  <td style="text-align: center; font-family: monospace; font-size: 0.82rem; color: #475569;">${esc(st.studentId)}</td>
                  <td class="col-name" style="text-align: left;">${esc(st.fullName)}</td>
                  ${taskCols}
                  <td style="font-weight: 600; text-align: center; color: #16A34A;">${submittedSum}</td>
                  <td style="font-weight: 600; text-align: center; ${pendingSum > 0 ? 'color: #DC2626;' : 'color: #94A3B8;'}">${pendingSum}</td>
                  <td style="font-weight: 700; background: #F8FAFC; text-align: center; color: var(--primary);">${scoreSum}/${maxScorePageSum}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- คำอธิบายชื่องานใต้ตาราง (Assignment Legend) -->
        <div class="report-legend" style="margin-top: 12px; font-size: 0.74rem; color: #475569; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; padding: 8px 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px;">
          ${pageAssignments.map(a => `
            <div style="display: flex; gap: 4px; align-items: baseline;">
              <span style="font-weight: 700; color: var(--primary); min-width: 28px;">${esc(a.id)}:</span>
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(a.title)} <span style="color: #64748B;">(เต็ม ${a.fullScore})</span></span>
            </div>
          `).join('')}
        </div>

        <div class="sheet-signature-box">
          <div>
            <div class="signature-line"></div>
            <div>ลงชื่อ (${esc(appState.settings.teacherName)})</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">ครูประจำวิชา</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="report-view-container">
      <div class="report-controls">
        <div>
          <h2 style="font-size: 1.15rem; font-weight: 600;">รายงานสรุปการส่งงาน ห้อง ${esc(appState.activeClassroom)}</h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">
            วิชา ${esc(subjectObj.code)} ${esc(subjectObj.name)} • จัดรูปแบบ A4 แนวนอน พร้อมพิมพ์ส่งฝ่ายวิชาการ (${currentAssignments.length} งาน)
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-secondary" onclick="exportToCSV()">
            📥 ส่งออก Excel (CSV)
          </button>
          <button class="btn btn-secondary" onclick="handlePrintReport(false)" title="พิมพ์เฉพาะหน้างานที่กำลังเลือกดูอยู่">
            🖨️ พิมพ์หน้านี้
          </button>
          <button class="btn btn-primary" onclick="handlePrintReport(true)" title="พิมพ์รายงานทั้งหมด แยก A4 หน้าละ 10 งาน">
            🖨️ พิมพ์ทุกหน้า (${totalPages} แผ่น A4)
          </button>
        </div>
      </div>

      ${tabsHtml}
      ${sheetsHtml}
    </div>
  `;
}

function exportToCSV() {
  const currentAssignments = getFilteredAssignments();
  const currentStudents = getFilteredStudents();
  let csvContent = '\uFEFF';

  let headerRow = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน'];
  currentAssignments.forEach(a => {
    headerRow.push(`${a.id} ${a.title} (เต็ม ${a.fullScore})`);
  });
  headerRow.push('ส่งแล้วรวม', 'ค้างส่งรวม', 'คะแนนรวม');
  csvContent += headerRow.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',') + '\r\n';

  currentStudents.forEach(st => {
    let row = [st.no, st.studentId, st.fullName, st.classroom];
    let submittedSum = 0;
    let pendingSum = 0;
    let scoreSum = 0;

    currentAssignments.forEach(a => {
      const key = `${a.id}_${st.studentId}`;
      const sub = appState.submissions[key];
      if (sub && sub.status === 'ส่งแล้ว') {
        submittedSum++;
        const sc = sub.score !== null && sub.score !== '' ? sub.score : 0;
        scoreSum += sc;
        row.push(sc);
      } else {
        pendingSum++;
        row.push('ค้าง');
      }
    });

    row.push(submittedSum, pendingSum, scoreSum);
    csvContent += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeClass = appState.activeClassroom.replace(/\//g, '-');
  link.setAttribute('href', url);
  link.setAttribute('download', `สรุปส่งงาน_${safeClass}_${appState.activeSubject}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ----------------- View: Student Roster (จัดการรายชื่อ) -----------------
function renderStudents(container) {
  const currentStudents = getFilteredStudents();
  const totalAllClasses = appState.students.length;

  const classPillsHtml = appState.settings.classrooms.map(c => {
    const count = appState.students.filter(s => s.classroom === c).length;
    return `
      <button class="class-pill ${c === appState.activeClassroom ? 'active' : ''}" onclick="changeActiveClassroom('${esc(c)}')">
        ${esc(c)} <span class="badge">${count} คน</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <!-- แถบสลับห้อง + ปุ่มจัดการห้อง -->
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
      <div class="classroom-pill-strip" style="margin-bottom: 0; flex: 1;">
        <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); white-space: nowrap; margin-right: 0.25rem;">
          🏫 เลือกดูห้อง:
        </span>
        ${classPillsHtml}
      </div>
      <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
        <button class="btn btn-secondary btn-sm" onclick="openAddClassroomModal()">
          ➕ เพิ่มห้องใหม่
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openClassroomManagerModal()">
          ⚙️ จัดการห้องเรียน
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="align-items: center; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--border-light); padding-bottom: 1rem; margin-bottom: 1rem;">
        <div>
          <h2 class="card-title" style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.15rem; margin-bottom: 0.25rem;">
            <span>👥 รายชื่อนักเรียน ห้อง <strong>${esc(appState.activeClassroom)}</strong></span>
            <span class="badge" style="background: var(--primary-light); color: var(--primary); font-size: 0.8rem; padding: 0.2rem 0.6rem; border-radius: var(--radius-full); font-weight: 600;">
              ${currentStudents.length} คน
            </span>
          </h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">
            นักเรียนทั้งหมดในระบบ: <strong>${totalAllClasses} คน</strong> ใน ${appState.settings.classrooms.length} ห้องเรียน
          </p>
        </div>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          <button class="btn btn-primary btn-sm" onclick="openInsertStudentModal('${esc(appState.activeClassroom)}')">
            ➕ แทรกนักเรียนในห้องนี้
          </button>
          <button class="btn btn-secondary btn-sm" onclick="reindexClassroomStudents('${esc(appState.activeClassroom)}')" title="จัดเรียงเลขที่ใหม่ 1, 2, 3... ตามลำดับ">
            🔢 จัดเรียงเลขที่ใหม่ (1..N)
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openImportModal('${esc(appState.activeClassroom)}')">
            📥 นำเข้าจาก Excel
          </button>
          <button class="btn btn-secondary btn-sm" onclick="exportClassroomTemplate('${esc(appState.activeClassroom)}')">
            📄 แม่แบบ Excel
          </button>
        </div>
      </div>

      <div style="max-height: 540px; overflow-y: auto; border: 1px solid var(--border-light); border-radius: var(--radius-md);">
        <table class="roster-table" style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-light); text-align: left; background: var(--bg-subtle); position: sticky; top: 0; z-index: 10;">
              <th style="padding: 0.65rem 0.75rem; width: 65px; text-align: center;">เลขที่</th>
              <th style="padding: 0.65rem 0.75rem; width: 100px;">รหัสนักเรียน</th>
              <th style="padding: 0.65rem 0.75rem;">ชื่อ - นามสกุล</th>
              <th style="padding: 0.65rem 0.75rem; text-align: right; width: 200px; white-space: nowrap;">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${currentStudents.length > 0 ? currentStudents.map(st => `
              <tr class="roster-row" style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 0.55rem 0.75rem; text-align: center; font-weight: 600; color: var(--primary);">${st.no}</td>
                <td style="padding: 0.55rem 0.75rem; color: var(--text-secondary); font-family: monospace; font-size: 0.88rem;">${esc(st.studentId)}</td>
                <td style="padding: 0.55rem 0.75rem; font-weight: 500; color: var(--text-main);">${esc(st.fullName)}</td>
                <td style="padding: 0.55rem 0.75rem; text-align: right; white-space: nowrap;">
                  <div class="roster-actions">
                    <button class="btn btn-sm btn-secondary" onclick="openInsertStudentModal('${esc(st.classroom)}', ${st.no + 1})" title="แทรกนักเรียนใหม่ต่อจากคนนี้เป็นเลขที่ ${st.no + 1}">
                      ➕ แทรกต่อ
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="openEditStudentModal('${esc(st.studentId)}')" title="แก้ไขข้อมูลนักเรียน">
                      ✏️ แก้ไข
                    </button>
                    <button class="btn btn-sm btn-danger-soft" onclick="deleteStudent('${esc(st.studentId)}')" title="ลบนักเรียนคนนี้">
                      🗑️ ลบ
                    </button>
                  </div>
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="4" style="padding: 3rem 1rem; text-align: center; color: var(--text-secondary);">
                  <div style="font-size: 2rem; margin-bottom: 0.5rem;">📂</div>
                  <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">ยังไม่มีรายชื่อนักเรียนในห้อง ${esc(appState.activeClassroom)}</div>
                  <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">คุณครูสามารถเพิ่มนักเรียนทีละคน หรือวางข้อมูลจาก Excel ได้ทันที</p>
                  <button class="btn btn-primary btn-sm" onclick="openInsertStudentModal('${esc(appState.activeClassroom)}', 1)">
                    ➕ เพิ่มนักเรียนคนแรก (เลขที่ 1)
                  </button>
                  &nbsp;
                  <button class="btn btn-secondary btn-sm" onclick="openImportModal('${esc(appState.activeClassroom)}')">
                    📥 วางจาก Excel
                  </button>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function deleteStudent(studentId) {
  const st = appState.students.find(s => s.studentId === studentId);
  if (!st) return;

  if (confirm(`คุณแน่ใจว่าต้องการลบ "เลขที่ ${st.no} ${st.fullName}" หรือไม่? ข้อมูลการส่งงานของนักเรียนคนนี้จะถูกลบออกด้วย`)) {
    const className = st.classroom;
    appState.students = appState.students.filter(s => s.studentId !== studentId);

    // ลบข้อมูล Submissions ของนักเรียนคนนี้เพื่อไม่ให้มีข้อมูลกำพร้า
    Object.keys(appState.submissions).forEach(k => {
      if (k.endsWith(`_${studentId}`)) delete appState.submissions[k];
    });
    
    // ถามว่าต้องการรันเลขที่คนที่เหลือต่อเลยไหม
    if (confirm('ต้องการจัดเรียงเลขที่ของนักเรียนคนถัดไปให้ชิดขึ้นมาแทนที่โดยอัตโนมัติหรือไม่?')) {
      const classStudents = appState.students.filter(s => s.classroom === className);
      classStudents.sort((a, b) => a.no - b.no);
      classStudents.forEach((s, idx) => { s.no = idx + 1; });
    }

    appState.isDirty = true;
    saveLocalState();
    scheduleAutoSync('full');
    renderStudents(document.getElementById('app-view-container'));
  }
}

// ----------------- Modal: แทรกนักเรียนในห้อง & แต่ละเลขที่ -----------------
function openInsertStudentModal(defaultClass, defaultNo) {
  const targetClass = defaultClass || appState.activeClassroom;
  const classStudents = appState.students.filter(s => s.classroom === targetClass);
  const nextNo = defaultNo !== undefined ? defaultNo : (classStudents.length > 0 ? Math.max(...classStudents.map(s => s.no)) + 1 : 1);
  const suggestedId = String(40000 + (classStudents.length + 1));

  const modalHtml = `
    <div class="modal-overlay" id="insert-student-modal">
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 600;">➕ แทรกนักเรียนในห้องเรียน</h3>
          <button style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer;" onclick="closeModal('insert-student-modal')">✕</button>
        </div>

        <div class="modal-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
            <div>
              <label class="form-label">ห้องเรียน:</label>
              <select id="insert-st-class" class="form-input">
                ${appState.settings.classrooms.map(c => `
                  <option value="${esc(c)}" ${c === targetClass ? 'selected' : ''}>${esc(c)}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="form-label">แทรกที่เลขที่:</label>
              <input type="number" id="insert-st-no" class="form-input" value="${nextNo}" min="1" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">รหัสประจำตัวนักเรียน:</label>
            <input type="text" id="insert-st-id" class="form-input" value="${esc(suggestedId)}" placeholder="เช่น 41025" />
          </div>

          <div class="form-group">
            <label class="form-label">ชื่อ - นามสกุล (พร้อมคำนำหน้า):</label>
            <input type="text" id="insert-st-name" class="form-input" placeholder="เช่น ด.ช. ศักดิ์สิทธิ์ ยิ่งเจริญ" autofocus />
          </div>

          <div style="background: var(--bg-subtle); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light); margin-top: 0.5rem;">
            <label style="display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; font-size: 0.85rem; line-height: 1.3;">
              <input type="checkbox" id="insert-st-autoshift" checked style="margin-top: 3px;" />
              <div>
                <strong>เลื่อนเลขที่คนถัดไป +1 อัตโนมัติ (Auto-Shift)</strong>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                  หากแทรกคั่นกลาง เช่น แทรกที่เลขที่ ${nextNo} คนเดิมที่เลขที่ ${nextNo} ขึ้นไป จะขยับเลื่อนเป็น ${nextNo + 1}, ${nextNo + 2}... ให้อัตโนมัติ
                </div>
              </div>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('insert-student-modal')">ยกเลิก</button>
          <button class="btn btn-primary" onclick="executeInsertStudent()">✓ บันทึกการแทรก</button>
        </div>
      </div>
    </div>
  `;

  closeModal('insert-student-modal');
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  setTimeout(() => {
    const input = document.getElementById('insert-st-name');
    if (input) input.focus();
  }, 100);
}

function executeInsertStudent() {
  const targetClass = document.getElementById('insert-st-class').value;
  const insertNo = parseInt(document.getElementById('insert-st-no').value) || 1;
  const studentId = document.getElementById('insert-st-id').value.trim();
  const fullName = document.getElementById('insert-st-name').value.trim();
  const autoShift = document.getElementById('insert-st-autoshift').checked;

  if (!fullName) {
    alert('กรุณากรอกชื่อ-นามสกุลนักเรียน');
    return;
  }

  // เลื่อนเลขที่คนถัดไป +1 ถ้าเลือก Auto-Shift
  if (autoShift) {
    appState.students.forEach(s => {
      if (s.classroom === targetClass && s.no >= insertNo) {
        s.no += 1;
      }
    });
  }

  // เพิ่มนักเรียนใหม่
  appState.students.push({
    no: insertNo,
    studentId: studentId || String(40000 + insertNo),
    fullName: fullName,
    classroom: targetClass,
    status: 'ปกติ'
  });

  // จัดเรียง
  appState.students.sort((a, b) => {
    if (a.classroom !== b.classroom) return a.classroom.localeCompare(b.classroom, 'th');
    return a.no - b.no;
  });

  appState.activeClassroom = targetClass;
  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync('full');
  closeModal('insert-student-modal');
  showToast(`แทรก "${fullName}" ที่เลขที่ ${insertNo} (ห้อง ${targetClass}) เรียบร้อย`);
  renderApp();
}

// ----------------- Modal: แก้ไขข้อมูลนักเรียน -----------------
function openEditStudentModal(studentId) {
  const st = appState.students.find(s => s.studentId === studentId);
  if (!st) return;

  const modalHtml = `
    <div class="modal-overlay" id="edit-student-modal">
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 600;">✏️ แก้ไขข้อมูลนักเรียน</h3>
          <button style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer;" onclick="closeModal('edit-student-modal')">✕</button>
        </div>

        <div class="modal-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
            <div>
              <label class="form-label">เลขที่:</label>
              <input type="number" id="edit-st-no" class="form-input" value="${st.no}" min="1" />
            </div>
            <div>
              <label class="form-label">ห้องเรียน:</label>
              <select id="edit-st-class" class="form-input">
                ${appState.settings.classrooms.map(c => `
                  <option value="${esc(c)}" ${c === st.classroom ? 'selected' : ''}>${esc(c)}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">รหัสประจำตัว:</label>
            <input type="text" id="edit-st-id" class="form-input" value="${esc(st.studentId)}" />
          </div>

          <div class="form-group">
            <label class="form-label">ชื่อ - นามสกุล:</label>
            <input type="text" id="edit-st-name" class="form-input" value="${esc(st.fullName)}" />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('edit-student-modal')">ยกเลิก</button>
          <button class="btn btn-primary" onclick="executeEditStudent('${esc(studentId)}')">✓ บันทึกการแก้ไข</button>
        </div>
      </div>
    </div>
  `;

  closeModal('edit-student-modal');
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function executeEditStudent(originalStudentId) {
  const st = appState.students.find(s => s.studentId === originalStudentId);
  if (!st) return;

  st.no = parseInt(document.getElementById('edit-st-no').value) || st.no;
  st.classroom = document.getElementById('edit-st-class').value;
  st.studentId = document.getElementById('edit-st-id').value.trim() || st.studentId;
  st.fullName = document.getElementById('edit-st-name').value.trim() || st.fullName;

  // เรียงลำดับใหม่
  appState.students.sort((a, b) => {
    if (a.classroom !== b.classroom) return a.classroom.localeCompare(b.classroom, 'th');
    return a.no - b.no;
  });

  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync('full');
  closeModal('edit-student-modal');
  showToast('บันทึกข้อมูลเรียบร้อย');
  renderApp();
}

// ----------------- ฟังก์ชันจัดเรียงเลขที่ใหม่ 1 ถึง N -----------------
function reindexClassroomStudents(className) {
  const classStudents = appState.students.filter(s => s.classroom === className);
  if (classStudents.length === 0) return;

  if (confirm(`คุณต้องการจัดเรียงเลขที่นักเรียนห้อง ${className} ใหม่ทั้งหมด (${classStudents.length} คน) เป็นเลขที่ 1 ถึง ${classStudents.length} หรือไม่?`)) {
    classStudents.sort((a, b) => a.no - b.no);
    classStudents.forEach((s, idx) => {
      s.no = idx + 1;
    });

    appState.isDirty = true;
    saveLocalState();
    scheduleAutoSync('full');
    showToast(`จัดเรียงเลขที่ห้อง ${className} ใหม่ (1-${classStudents.length}) เรียบร้อย`);
    renderStudents(document.getElementById('app-view-container'));
  }
}

// ----------------- Modal: จัดการห้องเรียน (เพิ่ม / ลบ / เปลี่ยนชื่อ) -----------------
function openAddClassroomModal() {
  const name = prompt('กรุณาระบุชื่อห้องเรียนใหม่ที่ต้องการเพิ่ม (เช่น ม.4/12 หรือ ม.6/1):');
  if (name && name.trim()) {
    const trimmed = name.trim();
    if (appState.settings.classrooms.includes(trimmed)) {
      alert('มีห้องเรียนนี้อยู่ในระบบแล้ว');
      return;
    }
    appState.settings.classrooms.push(trimmed);
    appState.activeClassroom = trimmed;
    appState.isDirty = true;
    saveLocalState();
    scheduleAutoSync('full');
    renderHeaderControls();
    showToast(`เพิ่มห้อง ${trimmed} เรียบร้อยแล้ว`);
    renderApp();
  }
}

function openClassroomManagerModal() {
  const modalHtml = `
    <div class="modal-overlay" id="classroom-manager-modal">
      <div class="modal-content" style="max-width: 550px;">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 600;">⚙️ จัดการห้องเรียนทั้งหมด (${appState.settings.classrooms.length} ห้อง)</h3>
          <button style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer;" onclick="closeModal('classroom-manager-modal')">✕</button>
        </div>

        <div class="modal-body">
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <input type="text" id="new-room-input" class="form-input" placeholder="พิมพ์ชื่อห้องใหม่ เช่น ม.4/12" />
            <button class="btn btn-primary" onclick="handleAddRoomFromManager()">+ เพิ่มห้อง</button>
          </div>

          <div style="max-height: 380px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
              <thead>
                <tr style="background: var(--bg-subtle); border-bottom: 2px solid var(--border-light); text-align: left;">
                  <th style="padding: 0.5rem;">ชื่อห้องเรียน</th>
                  <th style="padding: 0.5rem;">จำนวนนักเรียน</th>
                  <th style="padding: 0.5rem; text-align: right;">การกระทำ</th>
                </tr>
              </thead>
              <tbody>
                ${appState.settings.classrooms.map(c => {
                  const count = appState.students.filter(s => s.classroom === c).length;
                  return `
                    <tr style="border-bottom: 1px solid var(--border-light);">
                      <td style="padding: 0.5rem; font-weight: 600;">${esc(c)}</td>
                      <td style="padding: 0.5rem; color: var(--text-secondary);">${count} คน</td>
                      <td style="padding: 0.5rem; text-align: right;">
                        <button class="btn btn-sm btn-secondary" onclick="renameClassroom('${esc(c)}')">เปลี่ยนชื่อ</button>
                        <button class="btn btn-sm btn-secondary" style="color: #DC2626;" onclick="deleteClassroom('${esc(c)}')">ลบห้อง</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-primary" onclick="closeModal('classroom-manager-modal')">ปิดหน้าต่าง</button>
        </div>
      </div>
    </div>
  `;

  closeModal('classroom-manager-modal');
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function handleAddRoomFromManager() {
  const input = document.getElementById('new-room-input');
  if (!input || !input.value.trim()) return;

  const name = input.value.trim();
  if (appState.settings.classrooms.includes(name)) {
    alert('มีห้องนี้อยู่แล้ว');
    return;
  }

  appState.settings.classrooms.push(name);
  appState.isDirty = true;
  saveLocalState();
  renderHeaderControls();
  openClassroomManagerModal(); // refresh
  showToast(`เพิ่มห้อง ${name} สำเร็จ`);
  renderApp();
  pushFullStateToBackend().catch(err => {
    console.error('Error syncing after classroom addition:', err);
  });
}

function renameClassroom(oldName) {
  const newName = prompt(`เปลี่ยนชื่อห้อง "${oldName}" เป็น:`, oldName);
  if (newName && newName.trim() && newName.trim() !== oldName) {
    const trimmed = newName.trim();
    const idx = appState.settings.classrooms.indexOf(oldName);
    if (idx !== -1) {
      appState.settings.classrooms[idx] = trimmed;
    }
    // อัปเดตห้องของนักเรียนในห้องนี้ด้วย
    appState.students.forEach(s => {
      if (s.classroom === oldName) s.classroom = trimmed;
    });
    // อัปเดตห้องของงาน
    appState.assignments.forEach(a => {
      if (a.classroom === oldName) a.classroom = trimmed;
    });
    if (appState.activeClassroom === oldName) appState.activeClassroom = trimmed;

    appState.isDirty = true;
    saveLocalState();
    renderHeaderControls();
    openClassroomManagerModal();
    showToast(`เปลี่ยนชื่อห้องเป็น ${trimmed} เรียบร้อย`);
    renderApp();
    pushFullStateToBackend().catch(err => {
      console.error('Error syncing after classroom rename:', err);
    });
  }
}

function deleteClassroom(className) {
  const count = appState.students.filter(s => s.classroom === className).length;
  if (appState.settings.classrooms.length <= 1) {
    alert('ระบบต้องมีห้องเรียนอย่างน้อย 1 ห้อง');
    return;
  }

  let confirmMsg = `คุณแน่ใจว่าต้องการลบห้อง "${className}" หรือไม่?`;
  if (count > 0) {
    confirmMsg += `\n⚠️ ห้องนี้มีนักเรียนอยู่ ${count} คน การลบจะทำให้นักเรียนในห้องนี้ถูกลบออกจากระบบด้วย!`;
  }

  if (confirm(confirmMsg)) {
    appState.settings.classrooms = appState.settings.classrooms.filter(c => c !== className);
    appState.students = appState.students.filter(s => s.classroom !== className);
    appState.assignments = appState.assignments.filter(a => a.classroom !== className);

    if (appState.activeClassroom === className) {
      appState.activeClassroom = appState.settings.classrooms[0] || 'ม.4/1';
    }

    appState.isDirty = true;
    saveLocalState();
    renderHeaderControls();
    openClassroomManagerModal();
    showToast(`ลบห้อง ${className} เรียบร้อย`);
    renderApp();
    pushFullStateToBackend().catch(err => {
      console.error('Error syncing after classroom deletion:', err);
    });
  }
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.remove();
}


// ----------------- Smart Import Modal (ระบบนำเข้ารายชื่อ) -----------------
function openImportModal(defaultClass) {
  const targetClass = defaultClass || appState.activeClassroom;
  importPreviewData = [];

  const modalHtml = `
    <div class="modal-overlay" id="import-modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3 style="font-size: 1.1rem; font-weight: 600;">📥 นำเข้ารายชื่อนักเรียนจาก Excel / SGS</h3>
          <button style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer;" onclick="closeImportModal()">✕</button>
        </div>

        <div class="modal-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.875rem;">
            <div>
              <label class="form-label">เลือกห้องเรียนปลายทาง:</label>
              <select id="import-target-class" class="form-input" onchange="updateImportPreview()">
                ${appState.settings.classrooms.map(c => `
                  <option value="${esc(c)}" ${c === targetClass ? 'selected' : ''}>${esc(c)}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="form-label">รูปแบบการบันทึก:</label>
              <select id="import-mode" class="form-input">
                <option value="replace_classroom">เขียนทับเฉพาะห้องนี้ (แนะนำ)</option>
                <option value="append">เพิ่มต่อท้ายจากเดิม</option>
                <option value="replace_all">เขียนทับนักเรียนทุกห้อง</option>
              </select>
            </div>
          </div>

          <label class="form-label">
            คัดลอก (Copy) ข้อมูลจาก Excel โรงเรียนแล้วกดวาง (Ctrl+V) ที่นี่:
          </label>
          <textarea id="import-raw-text" class="import-textarea" 
            placeholder="ตัวอย่างการวาง (คัดลอกจาก Excel ได้โดยตรง):
1	41001	ด.ช. กิตติภพ กัลยาณมิตร
2	41002	ด.ช. กัญจน์ ปรีชาชาญ
3	41003	ด.ญ. ชนนิกานต์ รัตนากร

* รองรับทั้งแบบ: เลขที่ [tab] รหัส [tab] ชื่อ-นามสกุล หรือ รหัส [tab] ชื่อ-สกุล"
            oninput="handleRawTextInput(this.value)"></textarea>

          <div id="import-preview-container" style="margin-top: 0.75rem;">
            <!-- แสดงตัวอย่างตารางที่ระบบตัดคำได้ -->
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeImportModal()">ยกเลิก</button>
          <button class="btn btn-primary" id="confirm-import-btn" onclick="executeImport()" disabled>
            ✓ ยืนยันนำเข้ารายชื่อ
          </button>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById('import-modal-overlay');
  if (existing) existing.remove();

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeImportModal() {
  const modal = document.getElementById('import-modal-overlay');
  if (modal) modal.remove();
}

/**
 * Smart Parser: ตัดคำอัจฉริยะจากข้อมูลที่ Copy มาจาก Excel / SGS / Word
 */
function parseRawStudentText(text, fallbackClass) {
  if (!text || !text.trim()) return [];

  const lines = text.trim().split(/\r?\n/);
  const parsed = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // ตัดด้วย Tab (\t) ก่อน หากไม่มีให้ตัดด้วยช่องว่าง 2 เคาะขึ้นไป หรือ comma
    let cols = trimmed.split('\t');
    if (cols.length === 1) {
      cols = trimmed.split(/,\s*|\s{2,}/);
    }
    if (cols.length === 1) {
      cols = trimmed.split(/\s+/);
    }

    cols = cols.map(c => c.trim()).filter(c => c);
    if (cols.length === 0) return;

    let no = idx + 1;
    let studentId = '';
    let fullName = '';
    let classroom = fallbackClass;

    // ตรวจสอบว่ามีคอลัมน์ห้องเรียนหรือไม่ (เช่น ม.4/1, 4/1)
    if (cols[0].includes('ม.') || cols[0].includes('/')) {
      classroom = cols.shift();
    }

    // กรณีมี 3 คอลัมน์ขึ้นไป: [เลขที่, รหัส, ชื่อ-สกุล]
    if (cols.length >= 3 && !isNaN(cols[0])) {
      no = parseInt(cols[0]);
      studentId = cols[1];
      fullName = cols.slice(2).join(' ');
    }
    // กรณีมี 2 คอลัมน์: [รหัส, ชื่อ-สกุล]
    else if (cols.length === 2 && !isNaN(cols[0])) {
      studentId = cols[0];
      fullName = cols[1];
    }
    // กรณีมี 2 คอลัมน์: [เลขที่, ชื่อ-สกุล]
    else if (cols.length === 2) {
      no = parseInt(cols[0]) || (idx + 1);
      fullName = cols[1];
      studentId = String(40000 + no);
    } else {
      fullName = cols.join(' ');
      studentId = String(40000 + no);
    }

    if (fullName) {
      parsed.push({
        no: no,
        studentId: studentId,
        fullName: fullName,
        classroom: classroom,
        status: 'ปกติ'
      });
    }
  });

  return parsed;
}

function handleRawTextInput(text) {
  const targetClass = document.getElementById('import-target-class').value;
  importPreviewData = parseRawStudentText(text, targetClass);
  updateImportPreview();
}

function updateImportPreview() {
  const container = document.getElementById('import-preview-container');
  const confirmBtn = document.getElementById('confirm-import-btn');
  const targetClass = document.getElementById('import-target-class').value;

  if (!container) return;

  if (importPreviewData.length === 0) {
    container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center;">ยังไม่มีข้อมูล</p>`;
    if (confirmBtn) confirmBtn.disabled = true;
    return;
  }

  // อัปเดตห้องถ้าข้อมูลไม่ได้ระบุห้องมา
  importPreviewData.forEach(st => {
    if (!st.classroom || st.classroom === 'ม.4/1') st.classroom = targetClass;
  });

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerText = `✓ ยืนยันนำเข้า ${importPreviewData.length} คน (ห้อง ${targetClass})`;
  }

  container.innerHTML = `
    <div style="font-size: 0.85rem; font-weight: 600; color: var(--primary); margin-bottom: 0.35rem;">
      🔍 ตรวจพบข้อมูลนักเรียน: ${importPreviewData.length} คน
    </div>
    <div class="import-preview-box">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
        <thead>
          <tr style="background: var(--bg-subtle); border-bottom: 1px solid var(--border-light);">
            <th style="padding: 4px 8px;">เลขที่</th>
            <th style="padding: 4px 8px;">รหัส</th>
            <th style="padding: 4px 8px;">ชื่อ-นามสกุล</th>
            <th style="padding: 4px 8px;">ห้อง</th>
          </tr>
        </thead>
        <tbody>
          ${importPreviewData.slice(0, 15).map(s => `
            <tr style="border-bottom: 1px solid var(--border-light);">
              <td style="padding: 4px 8px;">${s.no}</td>
              <td style="padding: 4px 8px;">${esc(s.studentId)}</td>
              <td style="padding: 4px 8px;">${esc(s.fullName)}</td>
              <td style="padding: 4px 8px;">${esc(s.classroom)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${importPreviewData.length > 15 ? `
        <div style="padding: 4px 8px; font-size: 0.75rem; color: var(--text-secondary); text-align: center; background: var(--bg-subtle);">
          ...และอีก ${importPreviewData.length - 15} คน
        </div>
      ` : ''}
    </div>
  `;
}

function executeImport() {
  if (importPreviewData.length === 0) return;

  const mode = document.getElementById('import-mode').value;
  const targetClass = document.getElementById('import-target-class').value;

  if (mode === 'replace_classroom') {
    // ลบเฉพาะห้องนี้ แล้วแทนที่ด้วยข้อมูลใหม่
    appState.students = appState.students.filter(s => s.classroom !== targetClass).concat(importPreviewData);
  } else if (mode === 'replace_all') {
    appState.students = importPreviewData;
  } else {
    appState.students = appState.students.concat(importPreviewData);
  }

  // เรียงลำดับ
  appState.students.sort((a, b) => {
    if (a.classroom !== b.classroom) return a.classroom.localeCompare(b.classroom, 'th');
    return a.no - b.no;
  });

  appState.activeClassroom = targetClass;
  appState.isDirty = true;
  saveLocalState();
  closeImportModal();
  showToast(`นำเข้ารายชื่อห้อง ${targetClass} สำเร็จ ${importPreviewData.length} คน!`);

  // ส่งขึ้น Google Sheets
  pushImportToBackend(mode, targetClass, importPreviewData);

  renderHeaderControls();
  renderApp();
}

async function pushImportToBackend(mode, targetClass, studentsList) {
  if (!appState.settings.gasUrl) return;
  updateSyncIndicator('syncing');
  try {
    await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'importStudents',
        token: appState.settings.apiToken || '',
        mode: mode,
        classroom: targetClass,
        students: studentsList
      }),
      mode: 'no-cors'
    });
    appState.isDirty = false;
    saveLocalState();
    updateSyncIndicator('online');
  } catch (e) {
    updateSyncIndicator('offline');
  }
}

function exportClassroomTemplate(className) {
  let csv = '\uFEFFเลขที่,รหัสนักเรียน,ชื่อ-นามสกุล,ห้องเรียน\r\n';
  for (let i = 1; i <= 35; i++) {
    csv += `${i},${40000 + i},ชื่อนักเรียนตัวอย่าง ${i},${className}\r\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `แม่แบบรายชื่อ_${className}.csv`;
  a.click();
}

// ----------------- View: Assignments Management -----------------
function renderAssignments(container) {
  const currentAssignments = getFilteredAssignments();
  const subjectObj = getActiveSubjectObj();

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">รายการงานที่มอบหมาย: วิชา ${esc(subjectObj.name)} (${esc(subjectObj.code)})</h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">ห้อง ${esc(appState.activeClassroom)} (มี ${currentAssignments.length} งาน)</p>
        </div>
      </div>

      <div style="background: var(--bg-subtle); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.25rem;">
        <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.75rem;">+ สร้างงานใหม่สำหรับห้อง ${esc(appState.activeClassroom)}</h4>
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; align-items: end;">
          <div>
            <label class="form-label">ชื่องาน / รายละเอียด</label>
            <input type="text" id="new-assign-title" class="form-input" placeholder="เช่น 06 แบบฝึกหัดการเมืองการปกครอง" />
          </div>
          <div>
            <label class="form-label">คะแนนเต็ม</label>
            <input type="number" id="new-assign-score" class="form-input" value="5" />
          </div>
          <div>
            <label class="form-label">กำหนดส่ง</label>
            <input type="date" id="new-assign-date" class="form-input" />
          </div>
          <button class="btn btn-primary" onclick="handleAddAssignment()">เพิ่มงาน</button>
        </div>
      </div>

      <div style="max-height: 500px; overflow-y: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-light); text-align: left;">
              <th style="padding: 0.5rem;">รหัสงาน</th>
              <th style="padding: 0.5rem;">ชื่องาน</th>
              <th style="padding: 0.5rem;">คะแนนเต็ม</th>
              <th style="padding: 0.5rem;">กำหนดส่ง</th>
              <th style="padding: 0.5rem;">วิชา</th>
              <th style="padding: 0.5rem; text-align: right;">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            ${currentAssignments.map(a => `
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 0.5rem; font-weight: 600; color: var(--primary);">${esc(a.id)}</td>
                <td style="padding: 0.5rem; font-weight: 500;">${esc(a.title)}</td>
                <td style="padding: 0.5rem;">${a.fullScore} คะแนน</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${esc(a.dueDate || '-')}</td>
                <td style="padding: 0.5rem;">${esc(a.subject || appState.activeSubject)}</td>
                <td style="padding: 0.5rem; text-align: right;">
                  <button class="btn btn-sm btn-danger-soft" onclick="deleteAssignment('${esc(a.id)}')">🗑️ ลบ</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function handleAddAssignment() {
  const title = document.getElementById('new-assign-title').value.trim();
  const fullScore = parseInt(document.getElementById('new-assign-score').value) || 5;
  const dueDate = document.getElementById('new-assign-date').value;

  if (!title) {
    alert('กรุณากรอกชื่องาน');
    return;
  }

  const nextNum = appState.assignments.length + 1;
  const id = 'A' + (nextNum < 10 ? '0' + nextNum : nextNum);

  appState.assignments.push({
    id: id,
    title: title,
    fullScore: fullScore,
    dueDate: dueDate,
    subject: appState.activeSubject,
    classroom: appState.activeClassroom
  });

  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync('full');
  showToast(`เพิ่มงาน "${title}" สำเร็จ`);
  renderAssignments(document.getElementById('app-view-container'));
}

function deleteAssignment(assignId) {
  if (confirm('คุณแน่ใจว่าต้องการลบงานนี้หรือไม่? ข้อมูลการส่งงานและคะแนนของงานนี้จะถูกลบออกด้วย')) {
    appState.assignments = appState.assignments.filter(a => a.id !== assignId);

    // ลบข้อมูล Submissions ของงานนี้ออกด้วย
    Object.keys(appState.submissions).forEach(k => {
      if (k.startsWith(`${assignId}_`)) delete appState.submissions[k];
    });

    appState.isDirty = true;
    saveLocalState();
    scheduleAutoSync('full');
    renderAssignments(document.getElementById('app-view-container'));
  }
}

// ----------------- View: Settings -----------------
function renderSettings(container) {
  container.innerHTML = `
    <div class="card" style="max-width: 720px; margin: 0 auto;">
      <h2 class="card-title" style="margin-bottom: 1.25rem;">การตั้งค่าโรงเรียน & 5 รายวิชา</h2>

      <div class="form-group">
        <label class="form-label">ชื่อโรงเรียน</label>
        <input type="text" id="cfg-school" class="form-input" value="${esc(appState.settings.schoolName)}" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">ภาคเรียนที่</label>
          <input type="text" id="cfg-term" class="form-input" value="${esc(appState.settings.term)}" />
        </div>
        <div class="form-group">
          <label class="form-label">ปีการศึกษา</label>
          <input type="text" id="cfg-year" class="form-input" value="${esc(appState.settings.academicYear)}" />
        </div>
        <div class="form-group">
          <label class="form-label">ชื่อครูผู้สอน</label>
          <input type="text" id="cfg-teacher" class="form-input" value="${esc(appState.settings.teacherName)}" />
        </div>
      </div>

      <!-- รายชื่อ 5 วิชา -->
      <div style="margin-top: 1rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem;">📚 5 รายวิชาที่สอน</h4>
        <div id="subject-list-config">
          ${appState.settings.subjects.map((sub, idx) => `
            <div style="display: grid; grid-template-columns: 110px 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
              <input type="text" class="form-input cfg-sub-code" value="${esc(sub.code)}" />
              <input type="text" class="form-input cfg-sub-name" value="${esc(sub.name)}" />
            </div>
          `).join('')}
        </div>
      </div>

      <div class="form-group" style="margin-top: 1rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <label class="form-label">Google Apps Script Web App API URL</label>
        <input type="text" id="cfg-gas-url" class="form-input" value="${esc(appState.settings.gasUrl)}" />
      </div>

      <div class="form-group" style="margin-top: 1rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <label class="form-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>🔒 รหัสความปลอดภัย (Security PIN / Token)</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">(ไม่บังคับ - ป้องกันบุคคลอื่นเข้าถึงชีท)</span>
        </label>
        <div style="display: flex; gap: 0.5rem;">
          <input type="password" id="cfg-token" class="form-input" value="${esc(appState.settings.apiToken || '')}" placeholder="ระบุ PIN หรือรหัสผ่านป้องกัน (เว้นว่างไว้หากไม่ใช้)" />
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleTokenVisibility()" style="white-space: nowrap;">👁️ แสดง</button>
        </div>
      </div>

      <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button class="btn btn-primary" onclick="saveSettings()">💾 บันทึกการตั้งค่า</button>
        <button class="btn btn-secondary" onclick="triggerManualSync()">⬆️ ส่งข้อมูลขึ้น Google Sheets</button>
      </div>

      <!-- Cloud Recovery / Pull Data จากฐานข้อมูลจริง -->
      <div style="margin-top: 1.5rem; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-md); padding: 1rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h4 style="font-size: 0.95rem; font-weight: 600; color: #166534;">☁️ คืนค่า & ดึงข้อมูลจริงจาก Google Sheets</h4>
            <p style="font-size: 0.8rem; color: #15803D; margin-top: 2px;">
              ใช้เมื่อเปิดบนอุปกรณ์ใหม่ (iPad/มือถือ) หรือเมื่อข้อมูลในหน้าเว็บเครื่องนี้หาย ระบบจะดึงนักเรียน คะแนน และงานทั้งหมดจากชีทกลับมาแสดงทันที
            </p>
          </div>
          <button class="btn btn-success" onclick="pullFromGoogleSheets(true)">
            📥 ดึงข้อมูลจาก Google Sheets เดี๋ยวนี้
          </button>
        </div>
      </div>

      <div style="margin-top: 1.5rem; border-top: 1px solid var(--border-light); padding-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
        <a href="${appState.settings.spreadsheetUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: none; font-size: 0.85rem; font-weight: 500;">
          📊 เปิดดูชีทจริงใน Google Drive
        </a>
      </div>
    </div>
  `;
}

function toggleTokenVisibility() {
  const input = document.getElementById('cfg-token');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function saveSettings() {
  appState.settings.schoolName = document.getElementById('cfg-school').value;
  appState.settings.term = document.getElementById('cfg-term').value;
  appState.settings.academicYear = document.getElementById('cfg-year').value;
  appState.settings.teacherName = document.getElementById('cfg-teacher').value;
  appState.settings.gasUrl = document.getElementById('cfg-gas-url').value.trim() || DEFAULT_GAS_URL;
  appState.settings.apiToken = document.getElementById('cfg-token') ? document.getElementById('cfg-token').value.trim() : (appState.settings.apiToken || '');

  const codes = document.querySelectorAll('.cfg-sub-code');
  const names = document.querySelectorAll('.cfg-sub-name');
  const newSubs = [];
  codes.forEach((codeEl, i) => {
    if (codeEl.value.trim()) {
      newSubs.push({ code: codeEl.value.trim(), name: names[i].value.trim() });
    }
  });
  if (newSubs.length > 0) appState.settings.subjects = newSubs;

  saveLocalState();
  renderHeaderControls();
  showToast('💾 บันทึกในเครื่องแล้ว กำลังส่งการตั้งค่าขึ้น Google Sheets...');
  await pushSettingsToBackend();
}

// ----------------- Cloud Restore: ดึงข้อมูลจริงจาก Google Sheets -----------------
async function pullFromGoogleSheets(isManual = false) {
  if (!appState.settings.gasUrl) {
    if (isManual) alert('กรุณาระบุ Google Apps Script Web App URL ในหน้าตั้งค่า');
    return;
  }

  // หากมีข้อมูลที่ค้างอยู่ในเครื่องยังไม่ได้ส่งขึ้น Google Sheets (isDirty) ให้สำรองขึ้นไปก่อน
  if (appState.isDirty) {
    try {
      if (isManual) showToast('⏳ กำลังสำรองข้อมูลล่าสุดในเครื่องขึ้น Google Sheets ก่อนดึง...');
      await pushFullStateToBackend();
      appState.isDirty = false;
      saveLocalState();
    } catch (e) {
      console.warn('Could not flush dirty state before pull:', e);
      if (isManual) {
        const proceed = confirm('⚠️ มีข้อมูลคะแนนใหม่ในเครื่องที่ยังส่งขึ้นชีทไม่สำเร็จ หากดึงข้อมูลตอนนี้ ข้อมูลในเครื่องอาจถูกแทนที่ ยืนยันจะดึงข้อมูลหรือไม่?');
        if (!proceed) {
          updateSyncIndicator('offline');
          return;
        }
      }
    }
  }

  if (isManual) {
    showToast('⏳ กำลังดึงข้อมูลล่าสุดจาก Google Sheets...');
  }
  updateSyncIndicator('syncing');

  try {
    const tokenParam = appState.settings.apiToken ? `&token=${encodeURIComponent(appState.settings.apiToken)}` : '';
    const res = await fetch(`${appState.settings.gasUrl}?action=getInitialData${tokenParam}`);
    const json = await res.json();

    if (json.success && json.data) {
      const data = json.data;
      
      if (data.students && data.students.length > 0) {
        appState.students = data.students;
      }
      if (data.assignments && data.assignments.length > 0) {
        appState.assignments = data.assignments;
      }
      if (data.submissions) {
        appState.submissions = data.submissions;
      }
      if (data.settings && data.settings.classrooms && Array.isArray(data.settings.classrooms) && data.settings.classrooms.length > 0) {
        appState.settings.classrooms = data.settings.classrooms;
      } else if (data.classes && data.classes.length > 0) {
        appState.settings.classrooms = data.classes;
      }
      if (data.settings && data.settings.subjects && Array.isArray(data.settings.subjects) && data.settings.subjects.length > 0) {
        appState.settings.subjects = data.settings.subjects;
      } else if (data.subjects && data.subjects.length > 0) {
        appState.settings.subjects = data.subjects;
      }
      if (data.settings) {
        if (data.settings.schoolName) appState.settings.schoolName = data.settings.schoolName;
        if (data.settings.teacherName) appState.settings.teacherName = data.settings.teacherName;
        if (data.settings.academicYear) appState.settings.academicYear = data.settings.academicYear;
        if (data.settings.term) appState.settings.term = data.settings.term;
      }

      appState.isDirty = false;
      saveLocalState();
      renderHeaderControls();
      renderApp();
      updateSyncIndicator('online');

      if (isManual) {
        showToast(`✓ ดึงข้อมูลสำเร็จ: พบนักเรียน ${appState.students.length} คน, ${appState.assignments.length} งาน`);
      }
    } else {
      throw new Error(json.error || json.message || 'Data structure invalid');
    }
  } catch (err) {
    console.error('Error pulling from Google Sheets:', err);
    updateSyncIndicator('offline');
    if (isManual) {
      showToast(`⚠️ ${err.message || 'ไม่สามารถดึงข้อมูลได้ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'}`);
    }
  }
}

// ----------------- Google Apps Script Sync Engine -----------------
let syncDebounceTimer = null;

function scheduleAutoSync(type = 'submissions') {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  updateSyncIndicator('syncing');

  syncDebounceTimer = setTimeout(() => {
    if (type === 'full') {
      pushFullStateToBackend();
    } else {
      pushSubmissionsToBackend();
    }
  }, 2500);
}

async function pushSettingsToBackend() {
  if (!appState.settings.gasUrl) return;
  updateSyncIndicator('syncing');

  try {
    await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateSettings',
        token: appState.settings.apiToken || '',
        settings: {
          schoolName: appState.settings.schoolName,
          academicYear: appState.settings.academicYear,
          term: appState.settings.term,
          teacherName: appState.settings.teacherName,
          activeSubject: appState.activeSubject,
          activeClassroom: appState.activeClassroom,
          subjects: appState.settings.subjects,
          classrooms: appState.settings.classrooms
        }
      }),
      mode: 'no-cors'
    });

    updateSyncIndicator('online');
    showToast('✓ บันทึกการตั้งค่าลง Google Sheets สำเร็จแล้ว');
  } catch (err) {
    console.error('Error saving settings to GAS:', err);
    updateSyncIndicator('offline');
    showToast('⚠️ ไม่สามารถเชื่อมต่อกับ Google Sheets ได้ (บันทึกในเครื่องแล้ว)');
  }
}

async function pushFullStateToBackend() {
  if (!appState.settings.gasUrl) return;
  updateSyncIndicator('syncing');

  try {
    const list = [];
    Object.keys(appState.submissions).forEach(key => {
      const parts = key.split('_');
      if (parts.length === 2) {
        const sub = appState.submissions[key];
        list.push({
          assignmentId: parts[0],
          studentId: parts[1],
          status: sub.status,
          score: sub.score
        });
      }
    });

    await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'syncFullState',
        token: appState.settings.apiToken || '',
        settings: {
          schoolName: appState.settings.schoolName,
          academicYear: appState.settings.academicYear,
          term: appState.settings.term,
          teacherName: appState.settings.teacherName,
          activeSubject: appState.activeSubject,
          activeClassroom: appState.activeClassroom,
          subjects: appState.settings.subjects,
          classrooms: appState.settings.classrooms
        },
        students: appState.students,
        assignments: appState.assignments,
        submissions: list
      }),
      mode: 'no-cors'
    });

    appState.isDirty = false;
    saveLocalState();
    updateSyncIndicator('online');
  } catch (err) {
    console.error('Error in pushFullStateToBackend:', err);
    updateSyncIndicator('offline');
    throw err;
  }
}

async function pushSubmissionsToBackend() {
  if (!appState.settings.gasUrl) return;

  try {
    const list = [];
    Object.keys(appState.submissions).forEach(key => {
      const parts = key.split('_');
      if (parts.length === 2) {
        const sub = appState.submissions[key];
        list.push({
          assignmentId: parts[0],
          studentId: parts[1],
          status: sub.status,
          score: sub.score
        });
      }
    });

    await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'batchSaveSubmissions',
        token: appState.settings.apiToken || '',
        submissions: list
      }),
      mode: 'no-cors'
    });

    appState.isDirty = false;
    saveLocalState();
    updateSyncIndicator('online');
  } catch (err) {
    updateSyncIndicator('online');
  }
}

async function trySilentFetch() {
  // หากมีข้อมูลที่ค้างอยู่ในเครื่องยังไม่ได้ส่งขึ้นชีท อย่าดึงข้อมูลมาทับ
  if (!appState.isDirty) {
    await pullFromGoogleSheets(false);
  } else {
    console.log('Skipping silent fetch because local state has un-synced changes (isDirty=true)');
  }
}

async function triggerManualSync() {
  if (!appState.settings.gasUrl) {
    alert('กรุณาระบุ Web App URL ในหน้าตั้งค่า');
    return;
  }

  showToast('⏳ กำลังส่งข้อมูลทั้งหมดขึ้น Google Sheets...');
  updateSyncIndicator('syncing');

  try {
    await pushFullStateToBackend();
    showToast('✓ ส่งข้อมูลทั้งหมดขึ้น Google Sheets สำเร็จเรียบร้อยแล้ว');
    updateSyncIndicator('online');
  } catch (e) {
    showToast('⚠️ ไม่สามารถเชื่อมต่อกับ Google Sheets ได้ในขณะนี้ (บันทึกในเครื่องแล้ว)');
    updateSyncIndicator('offline');
  }
}

function updateSyncIndicator(status) {
  const dot = document.getElementById('sync-indicator-dot');
  const label = document.getElementById('sync-indicator-label');
  if (!dot || !label) return;

  if (status === 'syncing') {
    dot.className = 'status-dot syncing';
    label.innerText = 'กำลังซิงค์...';
  } else if (status === 'offline') {
    dot.className = 'status-dot offline';
    label.innerText = 'ออฟไลน์ (บันทึกในเครื่อง)';
  } else {
    dot.className = 'status-dot';
    label.innerText = 'บันทึกล่าสุดแล้ว';
  }
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function showToastWithAction(message, actionLabel, actionCallback) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast toast-with-action';

  const textSpan = document.createElement('span');
  textSpan.innerText = message;
  toast.appendChild(textSpan);

  if (actionLabel && actionCallback) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action-btn';
    actionBtn.innerText = actionLabel;
    actionBtn.onclick = (e) => {
      e.stopPropagation();
      actionCallback();
      toast.remove();
    };
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
