/**
 * ระบบบันทึกส่งงานนักเรียน (The Modern Educator Platform)
 * รองรับ ม.4 (11 ห้อง: ม.4/1 - ม.4/11), ม.5 (2 ห้อง: ม.5/1, ม.5/2) รวม 13 ห้องเรียน
 * และรองรับการสอน 5 รายวิชา พร้อมระบบ Smart Bulk Import จาก Excel
 */

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxkrB2zP2g-gEpHd32yI4RQ4pf_QE-b_YqD-BA_yYcnxWqPE5NOBXjii_jYIrlAsQKz/exec';
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

let appState = {
  currentTab: 'overview',
  activeClassroom: 'ม.4/1',
  activeSubject: 'ส31101',
  selectedAssignmentId: '',
  selectedStudentId: '',
  filterStatus: 'all', // 'all', 'submitted', 'pending'
  autoAdvance: true,
  isSyncing: false,
  settings: {
    gasUrl: DEFAULT_GAS_URL,
    spreadsheetUrl: SPREADSHEET_URL,
    schoolName: 'โรงเรียนสาธิตพัฒนาปัญญา',
    academicYear: '2569',
    term: '2',
    teacherName: 'คุณครูผู้สอน',
    subjects: DEFAULT_SUBJECTS,
    classrooms: DEFAULT_CLASSROOMS
  },
  students: [],
  assignments: [],
  submissions: {} // key: `${assignmentId}_${studentId}`
};

// State สำหรับหน้าต่าง Import
let importPreviewData = [];

// ----------------- Initialization -----------------
document.addEventListener('DOMContentLoaded', () => {
  loadLocalState();
  if (appState.students.length === 0 || appState.assignments.length === 0) {
    seedDefaultState();
  }
  setupEventListeners();
  renderHeaderControls();
  renderApp();

  if (navigator.onLine && appState.settings.gasUrl) {
    trySilentFetch();
  }
});

function loadLocalState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appState = { ...appState, ...parsed };
    }
  } catch (e) {
    console.error('Error loading local state:', e);
  }
}

function saveLocalState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeClassroom: appState.activeClassroom,
      activeSubject: appState.activeSubject,
      selectedAssignmentId: appState.selectedAssignmentId,
      autoAdvance: appState.autoAdvance,
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
    `<option value="${s.code}" ${s.code === appState.activeSubject ? 'selected' : ''}>${s.code} ${s.name}</option>`
  ).join('');

  const classOpts = appState.settings.classrooms.map(c => 
    `<option value="${c}" ${c === appState.activeClassroom ? 'selected' : ''}>${c}</option>`
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

// ----------------- Views Router -----------------
function renderApp() {
  const container = document.getElementById('app-view-container');
  if (!container) return;

  switch (appState.currentTab) {
    case 'overview': renderOverview(container); break;
    case 'grading': renderGrading(container); break;
    case 'report': renderReport(container); break;
    case 'students': renderStudents(container); break;
    case 'assignments': renderAssignments(container); break;
    case 'settings': renderSettings(container); break;
    default: renderOverview(container);
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

  // แถบห้องเรียนด่วน
  const classPillsHtml = appState.settings.classrooms.map(c => {
    const count = appState.students.filter(s => s.classroom === c).length;
    const isActive = c === appState.activeClassroom;
    return `
      <button class="class-pill ${isActive ? 'active' : ''}" onclick="changeActiveClassroom('${c}')">
        ${c} <span class="badge">${count} คน</span>
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
              <h2 class="card-title">${subjectObj.code} ${subjectObj.name} • ห้อง ${appState.activeClassroom}</h2>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                ภาคเรียนที่ ${appState.settings.term} ปีการศึกษา ${appState.settings.academicYear} | ${appState.settings.schoolName}
              </p>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" onclick="openImportModal('${appState.activeClassroom}')">
                📥 นำเข้ารายชื่อ ${appState.activeClassroom}
              </button>
              <button class="btn btn-primary" onclick="switchTab('grading')">
                ✏️ เช็กส่งงานห้องนี้
              </button>
            </div>
          </div>

          <div class="stats-ribbon">
            <div class="stat-box">
              <div class="stat-label">นักเรียนห้อง ${appState.activeClassroom}</div>
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
                <div class="tile-title">ตรวจงานห้อง ${appState.activeClassroom}</div>
                <div class="tile-desc">แผงตัวเลขด่วนบนไอแพด</div>
              </div>
            </button>
            <button class="action-tile-btn" onclick="openImportModal('${appState.activeClassroom}')">
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
          <div style="margin-top: 1.25rem; width: 100%; border-top: 1px solid var(--border-light); padding-top: 1rem; text-align: center;">
            <a href="${appState.settings.spreadsheetUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 0.85rem; color: var(--primary); text-decoration: none; font-weight: 500; display: inline-flex; align-items: center; gap: 0.35rem;">
              <span>📊 เปิดดูชีทจริงใน Google Drive</span> ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ----------------- View: Grading (Touch & Numpad) -----------------
function renderGrading(container) {
  const currentStudents = getFilteredStudents();
  const currentAssignments = getFilteredAssignments();

  if (currentAssignments.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2rem;">
        <h3>ยังไม่มีรายการงานสำหรับวิชา ${appState.activeSubject} ในห้อง ${appState.activeClassroom}</h3>
        <p style="color: var(--text-secondary); margin: 0.75rem 0;">คุณสามารถเพิ่มงานใหม่สำหรับห้องนี้ได้ทันที</p>
        <button class="btn btn-primary" onclick="switchTab('assignments')">+ เพิ่มงานใหม่</button>
      </div>
    `;
    return;
  }

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

  container.innerHTML = `
    <div class="assignment-bar">
      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="font-weight: 600; font-size: 0.95rem;">เลือกงาน:</span>
        <select class="select-control" id="assignment-select" onchange="changeAssignment(this.value)">
          ${currentAssignments.map(a => `
            <option value="${a.id}" ${a.id === currentAssignment.id ? 'selected' : ''}>
              ${a.title} (เต็ม ${a.fullScore})
            </option>
          `).join('')}
        </select>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" onclick="navigateAssignment(-1)">◀ ก่อนหน้า</button>
          <button class="btn btn-secondary btn-sm" onclick="navigateAssignment(1)">ถัดไป ▶</button>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 0.85rem; color: var(--text-secondary);">
          ส่งแล้ว <strong>${submittedCount}</strong> / ค้าง <strong>${pendingCount}</strong> (ห้อง ${appState.activeClassroom})
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
            แตะนักเรียนเพื่อให้คะแนน
          </span>
        </div>

        <div class="student-list">
          ${filteredStudents.length > 0 ? filteredStudents.map(st => {
            const key = `${currentAssignment.id}_${st.studentId}`;
            const sub = appState.submissions[key] || { status: 'ค้างส่ง', score: null };
            const isSelected = activeStudent && st.studentId === activeStudent.studentId;
            const isSubmitted = sub.status === 'ส่งแล้ว';

            return `
              <div class="student-row ${isSelected ? 'selected' : ''}" onclick="selectStudent('${st.studentId}')">
                <span class="student-no">${st.no}</span>
                <span class="student-code col-code">${st.studentId}</span>
                <span class="student-name">${st.fullName}</span>
                <div>
                  <span class="status-badge ${isSubmitted ? 'submitted' : 'pending'}" onclick="toggleStudentStatus(event, '${st.studentId}')">
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
              ไม่พบนักเรียนในห้อง ${appState.activeClassroom}
              <br><button class="btn btn-primary btn-sm" style="margin-top: 0.75rem;" onclick="openImportModal('${appState.activeClassroom}')">📥 นำเข้ารายชื่อห้องนี้</button>
            </div>
          `}
        </div>
      </div>

      <!-- แป้นตัวเลขบนหน้าจอ (Touch Numpad สำหรับ iPad) -->
      <div>
        <div class="keypad-panel">
          ${activeStudent ? `
            <div class="active-student-card">
              <div class="active-student-no">เลขที่ ${activeStudent.no} • รหัส ${activeStudent.studentId} • ห้อง ${activeStudent.classroom}</div>
              <div class="active-student-title">${activeStudent.fullName}</div>
              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
                สถานะ: <strong>${activeSubmission.status}</strong> 
                ${activeSubmission.score !== null && activeSubmission.score !== '' ? `| คะแนน: <strong style="color: var(--primary); font-size: 1.15rem;">${activeSubmission.score}</strong>` : ''}
              </div>
            </div>

            <div class="status-toggle-row">
              <button class="toggle-opt-btn ${activeSubmission.status === 'ส่งแล้ว' ? 'active-submitted' : ''}"
                onclick="setStudentStatus('${activeStudent.studentId}', 'ส่งแล้ว')">
                ✓ ส่งแล้ว
              </button>
              <button class="toggle-opt-btn ${activeSubmission.status === 'ค้างส่ง' ? 'active-pending' : ''}"
                onclick="setStudentStatus('${activeStudent.studentId}', 'ค้างส่ง')">
                ✕ ค้างส่ง
              </button>
            </div>

            <div class="quick-score-grid">
              <button class="numpad-btn full-score" onclick="applyScore(${currentAssignment.fullScore})">
                🌟 คะแนนเต็ม (${currentAssignment.fullScore})
              </button>
              <button class="numpad-btn" onclick="applyScore(10)">10</button>
              <button class="numpad-btn" onclick="applyScore(9)">9</button>
              <button class="numpad-btn" onclick="applyScore(8)">8</button>
              <button class="numpad-btn" onclick="applyScore(7)">7</button>
              <button class="numpad-btn" onclick="applyScore(6)">6</button>
              <button class="numpad-btn" onclick="applyScore(5)">5</button>
              <button class="numpad-btn" onclick="applyScore(4)">4</button>
              <button class="numpad-btn" onclick="applyScore(3)">3</button>
              <button class="numpad-btn" onclick="applyScore(0)">0</button>
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
  const currentIdx = currentStudents.findIndex(s => s.studentId === appState.selectedStudentId);
  const nextIdx = currentIdx + step;
  if (nextIdx >= 0 && nextIdx < currentStudents.length) {
    selectStudent(currentStudents[nextIdx].studentId);
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

function toggleStudentStatus(event, studentId) {
  event.stopPropagation();
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment) return;

  const key = `${currentAssignment.id}_${studentId}`;
  const current = appState.submissions[key] || { status: 'ค้างส่ง', score: null };
  const nextStatus = current.status === 'ส่งแล้ว' ? 'ค้างส่ง' : 'ส่งแล้ว';

  appState.submissions[key] = {
    ...current,
    status: nextStatus,
    score: nextStatus === 'ส่งแล้ว' ? (current.score !== null ? current.score : currentAssignment.fullScore) : null
  };

  saveLocalState();
  scheduleAutoSync();
  renderGrading(document.getElementById('app-view-container'));
}

function setStudentStatus(studentId, status) {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment) return;

  const key = `${currentAssignment.id}_${studentId}`;
  const current = appState.submissions[key] || {};

  appState.submissions[key] = {
    ...current,
    status: status,
    score: status === 'ส่งแล้ว' ? (current.score !== null ? current.score : currentAssignment.fullScore) : null
  };

  saveLocalState();
  scheduleAutoSync();
  renderGrading(document.getElementById('app-view-container'));
}

function applyScore(score) {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment || !appState.selectedStudentId) return;

  const key = `${currentAssignment.id}_${appState.selectedStudentId}`;
  appState.submissions[key] = {
    status: 'ส่งแล้ว',
    score: Number(score)
  };

  saveLocalState();
  scheduleAutoSync();

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

  saveLocalState();
  scheduleAutoSync();
  showToast(`บันทึกส่งแล้ว ${count} คนในห้อง ${appState.activeClassroom} เรียบร้อย`);
  renderGrading(document.getElementById('app-view-container'));
}

// ----------------- View: Report (A4 Landscape Matrix) -----------------
function renderReport(container) {
  const currentAssignments = getFilteredAssignments().slice(0, 10);
  const currentStudents = getFilteredStudents();
  const subjectObj = getActiveSubjectObj();

  container.innerHTML = `
    <div class="report-view-container">
      <div class="report-controls">
        <div>
          <h2 style="font-size: 1.15rem; font-weight: 600;">รายงานสรุปการส่งงาน ห้อง ${appState.activeClassroom}</h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">
            วิชา ${subjectObj.code} ${subjectObj.name} • จัดรูปแบบ A4 แนวนอน พร้อมพิมพ์ส่งฝ่ายวิชาการ
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary" onclick="exportToCSV()">
            📥 ส่งออก Excel (CSV)
          </button>
          <button class="btn btn-primary" onclick="window.print()">
            🖨️ พิมพ์ / บันทึก PDF (ห้อง ${appState.activeClassroom})
          </button>
        </div>
      </div>

      <div class="printable-sheet">
        <div class="sheet-header-text">
          <h2>${appState.settings.schoolName}</h2>
          <p>
            รายวิชา ${subjectObj.name} (${subjectObj.code}) &nbsp;|&nbsp; 
            ชั้นมัธยมศึกษาปีที่ ${appState.activeClassroom} &nbsp;|&nbsp; 
            ภาคเรียนที่ ${appState.settings.term} ปีการศึกษา ${appState.settings.academicYear}
          </p>
          <p style="margin-top: 2px;">ครูผู้สอน: ${appState.settings.teacherName}</p>
        </div>

        <table class="matrix-table">
          <thead>
            <tr>
              <th rowspan="2" style="width: 35px;">เลขที่</th>
              <th rowspan="2" style="width: 55px;">รหัส</th>
              <th rowspan="2" style="width: 140px; text-align: left;">ชื่อ-นามสกุล</th>
              ${currentAssignments.map(a => `
                <th colspan="2" class="task-header" title="${a.title}">
                  ${a.title}
                </th>
              `).join('')}
              <th colspan="3">สรุปทั้งรายวิชา</th>
            </tr>
            <tr>
              ${currentAssignments.map(() => `
                <th style="width: 32px;">ส่ง</th>
                <th style="width: 32px;">คะแนน</th>
              `).join('')}
              <th style="width: 32px;">ส่ง</th>
              <th style="width: 32px;">ค้าง</th>
              <th style="width: 48px;">รวม</th>
            </tr>
          </thead>
          <tbody>
            ${currentStudents.map(st => {
              let submittedSum = 0;
              let pendingSum = 0;
              let scoreSum = 0;
              let maxScoreSum = 0;

              const taskCols = currentAssignments.map(a => {
                maxScoreSum += a.fullScore;
                const key = `${a.id}_${st.studentId}`;
                const sub = appState.submissions[key];
                if (sub && sub.status === 'ส่งแล้ว') {
                  submittedSum++;
                  const sc = sub.score !== null && sub.score !== '' ? sub.score : 0;
                  scoreSum += sc;
                  return `<td class="tag-done">ส่ง</td><td>${sc}</td>`;
                } else {
                  pendingSum++;
                  return `<td class="tag-missing">ค้าง</td><td>-</td>`;
                }
              }).join('');

              return `
                <tr>
                  <td>${st.no}</td>
                  <td>${st.studentId}</td>
                  <td class="col-name">${st.fullName}</td>
                  ${taskCols}
                  <td style="font-weight: 600;">${submittedSum}</td>
                  <td style="color: #DC2626; font-weight: 600;">${pendingSum}</td>
                  <td style="font-weight: 700; background: #F8FAFC;">${scoreSum}/${maxScoreSum}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="sheet-signature-box">
          <div>
            <div class="signature-line"></div>
            <div>ลงชื่อ (${appState.settings.teacherName})</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">ครูประจำวิชา</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function exportToCSV() {
  const currentAssignments = getFilteredAssignments().slice(0, 10);
  const currentStudents = getFilteredStudents();
  let csvContent = '\uFEFF';

  let headerRow = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน'];
  currentAssignments.forEach(a => {
    headerRow.push(`${a.title}_สถานะ`, `${a.title}_คะแนน`);
  });
  headerRow.push('ส่งแล้วรวม', 'ค้างส่งรวม', 'คะแนนรวม');
  csvContent += headerRow.map(h => `"${h}"`).join(',') + '\r\n';

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
        const sc = sub.score !== null ? sub.score : 0;
        scoreSum += sc;
        row.push('ส่งแล้ว', sc);
      } else {
        pendingSum++;
        row.push('ค้างส่ง', '');
      }
    });

    row.push(submittedSum, pendingSum, scoreSum);
    csvContent += row.map(cell => `"${cell}"`).join(',') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `สรุปส่งงาน_${appState.activeClassroom}_${appState.activeSubject}.csv`);
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
      <button class="class-pill ${c === appState.activeClassroom ? 'active' : ''}" onclick="changeActiveClassroom('${c}')">
        ${c} <span class="badge">${count} คน</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <!-- แถบสลับห้อง -->
    <div class="classroom-pill-strip">
      <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); white-space: nowrap;">เลือกดูห้อง:</span>
      ${classPillsHtml}
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">รายชื่อนักเรียน ห้อง ${appState.activeClassroom} (${currentStudents.length} คน)</h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">
            นักเรียนทั้งหมดในระบบ (ทุกห้อง): <strong>${totalAllClasses} คน</strong> ใน 13 ห้องเรียน
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="openImportModal('${appState.activeClassroom}')">
            📥 นำเข้ารายชื่อจาก Excel (Import)
          </button>
          <button class="btn btn-secondary" onclick="exportClassroomTemplate('${appState.activeClassroom}')">
            📄 ดาวน์โหลดแม่แบบ Excel
          </button>
        </div>
      </div>

      <div style="max-height: 520px; overflow-y: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-light); text-align: left;">
              <th style="padding: 0.5rem;">เลขที่</th>
              <th style="padding: 0.5rem;">รหัสนักเรียน</th>
              <th style="padding: 0.5rem;">ชื่อ-นามสกุล</th>
              <th style="padding: 0.5rem;">ห้องเรียน</th>
              <th style="padding: 0.5rem; text-align: right;">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${currentStudents.length > 0 ? currentStudents.map(st => `
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 0.5rem; font-weight: 600;">${st.no}</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${st.studentId}</td>
                <td style="padding: 0.5rem; font-weight: 500;">${st.fullName}</td>
                <td style="padding: 0.5rem;">${st.classroom}</td>
                <td style="padding: 0.5rem; text-align: right;">
                  <button class="btn btn-sm btn-secondary" onclick="deleteStudent('${st.studentId}')">ลบ</button>
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="5" style="padding: 2.5rem; text-align: center; color: var(--text-secondary);">
                  ยังไม่มีรายชื่อนักเรียนในห้อง ${appState.activeClassroom}
                  <br><br>
                  <button class="btn btn-primary" onclick="openImportModal('${appState.activeClassroom}')">
                    📥 นำเข้ารายชื่อห้อง ${appState.activeClassroom} ทันที
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
  if (confirm('คุณแน่ใจว่าต้องการลบนักเรียนคนนี้หรือไม่?')) {
    appState.students = appState.students.filter(s => s.studentId !== studentId);
    saveLocalState();
    scheduleAutoSync();
    renderStudents(document.getElementById('app-view-container'));
  }
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
                  <option value="${c}" ${c === targetClass ? 'selected' : ''}>${c}</option>
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
              <td style="padding: 4px 8px;">${s.studentId}</td>
              <td style="padding: 4px 8px;">${s.fullName}</td>
              <td style="padding: 4px 8px;">${s.classroom}</td>
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
        mode: mode,
        classroom: targetClass,
        students: studentsList
      }),
      mode: 'no-cors'
    });
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
          <h2 class="card-title">รายการงานที่มอบหมาย: วิชา ${subjectObj.name} (${subjectObj.code})</h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">ห้อง ${appState.activeClassroom} (มี ${currentAssignments.length} งาน)</p>
        </div>
      </div>

      <div style="background: var(--bg-subtle); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.25rem;">
        <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.75rem;">+ สร้างงานใหม่สำหรับห้อง ${appState.activeClassroom}</h4>
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; align-items: end;">
          <div>
            <label class="form-label">ชื่องาน / รายละเอียด</label>
            <input type="text" id="new-assign-title" class="form-input" placeholder="เช่น 06 แบบฝึกหัดการเมืองการปกครอง" />
          </div>
          <div>
            <label class="form-label">คะแนนเต็ม</label>
            <input type="number" id="new-assign-score" class="form-input" value="10" />
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
                <td style="padding: 0.5rem; font-weight: 600; color: var(--primary);">${a.id}</td>
                <td style="padding: 0.5rem; font-weight: 500;">${a.title}</td>
                <td style="padding: 0.5rem;">${a.fullScore} คะแนน</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${a.dueDate || '-'}</td>
                <td style="padding: 0.5rem;">${a.subject || appState.activeSubject}</td>
                <td style="padding: 0.5rem; text-align: right;">
                  <button class="btn btn-sm btn-secondary" onclick="deleteAssignment('${a.id}')">ลบ</button>
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
  const fullScore = parseInt(document.getElementById('new-assign-score').value) || 10;
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

  saveLocalState();
  scheduleAutoSync();
  showToast(`เพิ่มงาน "${title}" สำเร็จ`);
  renderAssignments(document.getElementById('app-view-container'));
}

function deleteAssignment(assignId) {
  if (confirm('คุณแน่ใจว่าต้องการลบงานนี้หรือไม่?')) {
    appState.assignments = appState.assignments.filter(a => a.id !== assignId);
    saveLocalState();
    scheduleAutoSync();
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
        <input type="text" id="cfg-school" class="form-input" value="${appState.settings.schoolName}" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">ภาคเรียนที่</label>
          <input type="text" id="cfg-term" class="form-input" value="${appState.settings.term}" />
        </div>
        <div class="form-group">
          <label class="form-label">ปีการศึกษา</label>
          <input type="text" id="cfg-year" class="form-input" value="${appState.settings.academicYear}" />
        </div>
        <div class="form-group">
          <label class="form-label">ชื่อครูผู้สอน</label>
          <input type="text" id="cfg-teacher" class="form-input" value="${appState.settings.teacherName}" />
        </div>
      </div>

      <!-- รายชื่อ 5 วิชา -->
      <div style="margin-top: 1rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem;">📚 5 รายวิชาที่สอน</h4>
        <div id="subject-list-config">
          ${appState.settings.subjects.map((sub, idx) => `
            <div style="display: grid; grid-template-columns: 110px 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
              <input type="text" class="form-input cfg-sub-code" value="${sub.code}" />
              <input type="text" class="form-input cfg-sub-name" value="${sub.name}" />
            </div>
          `).join('')}
        </div>
      </div>

      <div class="form-group" style="margin-top: 1rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <label class="form-label">Google Apps Script Web App API URL</label>
        <input type="text" id="cfg-gas-url" class="form-input" value="${appState.settings.gasUrl}" />
      </div>

      <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button class="btn btn-primary" onclick="saveSettings()">💾 บันทึกการตั้งค่า</button>
        <button class="btn btn-secondary" onclick="triggerManualSync()">🔄 ซิงค์ข้อมูลกับ Google Sheets</button>
      </div>

      <div style="margin-top: 2rem; border-top: 1px solid var(--border-light); padding-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
        <a href="${appState.settings.spreadsheetUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: none; font-size: 0.85rem; font-weight: 500;">
          📊 เปิดดูชีทจริงใน Google Drive
        </a>
        <button class="btn btn-secondary btn-sm" onclick="resetToSampleData()" style="color: #DC2626;">
          ⚠️ รีเซ็ตข้อมูลเริ่มต้น (ม.4 & ม.5)
        </button>
      </div>
    </div>
  `;
}

function saveSettings() {
  appState.settings.schoolName = document.getElementById('cfg-school').value;
  appState.settings.term = document.getElementById('cfg-term').value;
  appState.settings.academicYear = document.getElementById('cfg-year').value;
  appState.settings.teacherName = document.getElementById('cfg-teacher').value;
  appState.settings.gasUrl = document.getElementById('cfg-gas-url').value;

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
  showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว');
}

function resetToSampleData() {
  if (confirm('คุณต้องการรีเซ็ตข้อมูลตัวอย่าง ม.4 (11 ห้อง) และ ม.5 (2 ห้อง) หรือไม่?')) {
    seedDefaultState();
    showToast('รีเซ็ตข้อมูลตัวอย่างเรียบร้อยแล้ว');
    renderHeaderControls();
    renderApp();
  }
}

// ----------------- Google Apps Script Sync Engine -----------------
let syncDebounceTimer = null;

function scheduleAutoSync() {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  updateSyncIndicator('syncing');

  syncDebounceTimer = setTimeout(() => {
    pushSubmissionsToBackend();
  }, 2500);
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
        submissions: list
      }),
      mode: 'no-cors'
    });

    updateSyncIndicator('online');
  } catch (err) {
    updateSyncIndicator('online');
  }
}

async function trySilentFetch() {
  if (!appState.settings.gasUrl) return;
  try {
    const res = await fetch(`${appState.settings.gasUrl}?action=getInitialData`);
    const json = await res.json();
    if (json.success && json.data) {
      if (json.data.students && json.data.students.length > 0) {
        appState.students = json.data.students;
      }
      if (json.data.assignments && json.data.assignments.length > 0) {
        appState.assignments = json.data.assignments;
      }
      if (json.data.submissions) {
        appState.submissions = { ...appState.submissions, ...json.data.submissions };
      }
      if (json.data.classes && json.data.classes.length > 0) {
        appState.settings.classrooms = json.data.classes;
      }
      saveLocalState();
      renderHeaderControls();
      renderApp();
    }
  } catch (e) {}
}

async function triggerManualSync() {
  showToast('กำลังเชื่อมต่อกับ Google Sheets...');
  updateSyncIndicator('syncing');

  try {
    await pushSubmissionsToBackend();
    showToast('✓ บันทึกข้อมูลขึ้น Google Sheets สำเร็จ');
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
