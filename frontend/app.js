/**
 * ระบบบันทึกส่งงานนักเรียน (The Modern Educator Web App)
 * Core Application Logic & State Management
 */

// ค่าเริ่มต้นระบบ
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyGhv4Xzj1OFV0h7ckHx10UE4CdApjMcMInIkc-ZQJOvXqoWVqvFIYj1nytiRap8nsx/exec';
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1fP4g1aedTiymV9ZTIer0gWjTWZeewOrk6gJo2qfWjpU/edit';

const STORAGE_KEYS = {
  STATE: 'educator_app_state_v1',
  SETTINGS: 'educator_settings_v1'
};

// Application State
let appState = {
  currentTab: 'overview',
  selectedAssignmentId: 'A01',
  selectedStudentId: '25001',
  filterStatus: 'all', // 'all', 'submitted', 'pending'
  autoAdvance: true,
  isSyncing: false,
  settings: {
    gasUrl: DEFAULT_GAS_URL,
    spreadsheetUrl: SPREADSHEET_URL,
    schoolName: 'โรงเรียนสาธิตพัฒนาปัญญา',
    academicYear: '2569',
    term: '2',
    teacherName: 'คุณครูผู้สอนตัวอย่าง',
    subjectName: 'คณิตศาสตร์ [ค15101]',
    classroom: 'ป.4/1'
  },
  students: [],
  assignments: [],
  submissions: {} // key: `${assignmentId}_${studentId}` -> { status, score, note }
};

// ----------------- Initialization -----------------
document.addEventListener('DOMContentLoaded', () => {
  loadLocalState();
  if (appState.students.length === 0 || appState.assignments.length === 0) {
    seedDefaultState();
  }
  setupEventListeners();
  renderApp();
  
  // ซิงค์เบื้องหลังหากมีเน็ตเวิร์ก
  if (navigator.onLine && appState.settings.gasUrl) {
    trySilentFetch();
  }
});

function loadLocalState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.STATE);
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
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify({
      settings: appState.settings,
      students: appState.students,
      assignments: appState.assignments,
      submissions: appState.submissions,
      selectedAssignmentId: appState.selectedAssignmentId,
      autoAdvance: appState.autoAdvance
    }));
  } catch (e) {
    console.error('Error saving local state:', e);
  }
}

// ----------------- Default Sample Data -----------------
function seedDefaultState() {
  appState.students = [
    { no: 1, studentId: '25001', fullName: 'ด.ช. กิตติภพ กัลยาณมิตร', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 2, studentId: '25002', fullName: 'ด.ช. กัญจน์ ปรีชาชาญ', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 3, studentId: '25003', fullName: 'ด.ช. ขจรศักดิ์ สุขประเสริฐ', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 4, studentId: '25004', fullName: 'ด.ญ. ชนนิกานต์ รัตนากร', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 5, studentId: '25005', fullName: 'ด.ญ. ญาณิศา วิจิตรศิลป์', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 6, studentId: '25006', fullName: 'ด.ช. ณัฐดนัย สมบูรณ์ทรัพย์', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 7, studentId: '25007', fullName: 'ด.ญ. ธัญญลักษณ์ บุญชู', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 8, studentId: '25008', fullName: 'ด.ช. ธีรภัทร ชาญวิทย์', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 9, studentId: '25009', fullName: 'ด.ญ. นภัสสร สุทธิธรรม', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 10, studentId: '25010', fullName: 'ด.ช. บวรนันท์ มั่นคง', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 11, studentId: '25011', fullName: 'ด.ญ. ปรียาพร อริยทรัพย์', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 12, studentId: '25012', fullName: 'ด.ช. ภัทรกร ศรีสวัสดิ์', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 13, studentId: '25013', fullName: 'ด.ญ. วรรณวิสาข์ มิ่งขวัญ', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 14, studentId: '25014', fullName: 'ด.ช. ศุภวิชญ์ เกียรติไพบูลย์', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 15, studentId: '25015', fullName: 'ด.ญ. สลิลลา ทองทาบ', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 16, studentId: '25016', fullName: 'ด.ช. อัครพงศ์ เจริญผล', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 17, studentId: '25017', fullName: 'ด.ญ. กานต์พิชชา ภิรมย์รักษ์', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 18, studentId: '25018', fullName: 'ด.ช. จักรภพ ชัยชูเกียรติ', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 19, studentId: '25019', fullName: 'ด.ญ. จิดาภา ประเสริฐยิ่ง', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 20, studentId: '25020', fullName: 'ด.ช. ชัยวัฒน์ ภักดีชน', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 21, studentId: '25021', fullName: 'ด.ญ. ณิชาภา เกษมสุข', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 22, studentId: '25022', fullName: 'ด.ช. ธนกร พงษ์ศิริ', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 23, studentId: '25023', fullName: 'ด.ญ. ปานรพี ศศิประภา', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 24, studentId: '25024', fullName: 'ด.ช. ภูริพัฒน์ จันทร์กระจ่าง', classroom: 'ป.4/1', status: 'ปกติ' },
    { no: 25, studentId: '25025', fullName: 'ด.ญ. วรินทร ดิลกคุณ', classroom: 'ป.4/1', status: 'ปกติ' }
  ];

  appState.assignments = [
    { id: 'A01', title: '01 ใบงานเศษส่วน', fullScore: 10, dueDate: '2026-10-25', classroom: 'ป.4/1' },
    { id: 'A02', title: '02 แบบฝึกหัดหน่วยที่ 1', fullScore: 10, dueDate: '2026-10-29', classroom: 'ป.4/1' },
    { id: 'A03', title: '03 แผนภาพจำนวนคละ', fullScore: 10, dueDate: '2026-11-05', classroom: 'ป.4/1' },
    { id: 'A04', title: '04 ใบงานการบวกเศษส่วน', fullScore: 10, dueDate: '2026-11-12', classroom: 'ป.4/1' },
    { id: 'A05', title: '05 แบบฝึกหัดการลบ', fullScore: 10, dueDate: '2026-11-19', classroom: 'ป.4/1' },
    { id: 'A06', title: '06 กิจกรรมแก้โจทย์ปัญหา', fullScore: 10, dueDate: '2026-11-26', classroom: 'ป.4/1' },
    { id: 'A07', title: '07 ชิ้นงานสรุปความรู้', 10, dueDate: '2026-12-03', classroom: 'ป.4/1' },
    { id: 'A08', title: '08 แบบฝึกหัดเพิ่มเติม 8', 10, dueDate: '2026-12-10', classroom: 'ป.4/1' },
    { id: 'A09', title: '09 แบบฝึกหัดเพิ่มเติม 9', 10, dueDate: '2026-12-17', classroom: 'ป.4/1' },
    { id: 'A10', title: '10 แบบฝึกหัดเพิ่มเติม 10', 10, dueDate: '2026-12-24', classroom: 'ป.4/1' }
  ];

  // จำลองข้อมูลส่งงาน
  appState.submissions = {};
  appState.assignments.forEach((assign, aIdx) => {
    appState.students.forEach((st, sIdx) => {
      const key = `${assign.id}_${st.studentId}`;
      const isSubmitted = aIdx === 0 ? sIdx % 5 !== 3 : (sIdx + aIdx) % 3 !== 0;
      if (isSubmitted) {
        const score = 7 + ((sIdx + aIdx) % 4);
        appState.submissions[key] = { status: 'ส่งแล้ว', score: score };
      } else {
        appState.submissions[key] = { status: 'ค้างส่ง', score: null };
      }
    });
  });

  saveLocalState();
}

// ----------------- Event Handlers -----------------
function setupEventListeners() {
  // Navigation Tabs
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Global Sync Button
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

// ----------------- Rendering Views -----------------
function renderApp() {
  const container = document.getElementById('app-view-container');
  if (!container) return;

  switch (appState.currentTab) {
    case 'overview':
      renderOverview(container);
      break;
    case 'grading':
      renderGrading(container);
      break;
    case 'report':
      renderReport(container);
      break;
    case 'students':
      renderStudents(container);
      break;
    case 'assignments':
      renderAssignments(container);
      break;
    case 'settings':
      renderSettings(container);
      break;
    default:
      renderOverview(container);
  }
}

// ----------------- View: Overview / Dashboard -----------------
function renderOverview(container) {
  const totalStudents = appState.students.length;
  const totalAssignments = appState.assignments.length;
  const totalExpected = totalStudents * totalAssignments;

  let totalSubmitted = 0;
  let totalPending = 0;

  appState.assignments.forEach(assign => {
    appState.students.forEach(st => {
      const key = `${assign.id}_${st.studentId}`;
      const sub = appState.submissions[key];
      if (sub && sub.status === 'ส่งแล้ว') {
        totalSubmitted++;
      } else {
        totalPending++;
      }
    });
  });

  const percentage = totalExpected > 0 ? Math.round((totalSubmitted / totalExpected) * 100) : 0;
  const strokeDashoffset = 283 - (283 * percentage) / 100; // 2 * PI * 45 ≈ 283

  container.innerHTML = `
    <div class="overview-grid">
      <div>
        <div class="card" style="margin-bottom: 1.25rem;">
          <div class="card-header">
            <div>
              <h2 class="card-title">${appState.settings.subjectName} • ชั้น ${appState.settings.classroom}</h2>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                ภาคเรียนที่ ${appState.settings.term} ปีการศึกษา ${appState.settings.academicYear} | ${appState.settings.schoolName}
              </p>
            </div>
            <button class="btn btn-primary" onclick="switchTab('grading')">
              ✏️ เริ่มเช็กส่งงาน
            </button>
          </div>

          <div class="stats-ribbon">
            <div class="stat-box">
              <div class="stat-label">นักเรียนในห้อง</div>
              <div class="stat-value">${totalStudents} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-secondary);">คน</span></div>
            </div>
            <div class="stat-box">
              <div class="stat-label">งานทั้งหมด</div>
              <div class="stat-value">${totalAssignments} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-secondary);">ชิ้น</span></div>
            </div>
            <div class="stat-box success">
              <div class="stat-label">ส่งแล้วทั้งหมด</div>
              <div class="stat-value">${totalSubmitted} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-secondary);">ครั้ง</span></div>
            </div>
            <div class="stat-box warning">
              <div class="stat-label">ค้างส่งสะสม</div>
              <div class="stat-value">${totalPending} <span style="font-size: 0.85rem; font-weight: 400; color: var(--text-secondary);">ครั้ง</span></div>
            </div>
          </div>

          <h3 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem;">เมนูดำเนินการด่วน</h3>
          <div class="quick-action-grid">
            <button class="action-tile-btn" onclick="switchTab('grading')">
              <span class="tile-icon">📝</span>
              <div>
                <div class="tile-title">ตรวจงาน & บันทึกคะแนน</div>
                <div class="tile-desc">แผงตรวจงานด่วนบนไอแพด</div>
              </div>
            </button>
            <button class="action-tile-btn" onclick="switchTab('report')">
              <span class="tile-icon">📄</span>
              <div>
                <div class="tile-title">ดูรายงาน A4 / พิมพ์</div>
                <div class="tile-desc">พิมพ์แนวนอน 10 งานส่งฝ่ายวิชาการ</div>
              </div>
            </button>
            <button class="action-tile-btn" onclick="switchTab('students')">
              <span class="tile-icon">👥</span>
              <div>
                <div class="tile-title">จัดการรายชื่อนักเรียน</div>
                <div class="tile-desc">เพิ่ม ลบ หรือคัดลอกจาก Excel</div>
              </div>
            </button>
            <button class="action-tile-btn" onclick="switchTab('assignments')">
              <span class="tile-icon">📚</span>
              <div>
                <div class="tile-title">รายการงานที่มอบหมาย</div>
                <div class="tile-desc">เพิ่มงาน กำหนดคะแนนและวันส่ง</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div>
        <div class="card donut-container">
          <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem;">สัดส่วนการส่งงานทั้งห้อง</h3>
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

// ----------------- View: Grading (iPad & Mobile Focused) -----------------
function renderGrading(container) {
  const currentAssignment = appState.assignments.find(a => a.id === appState.selectedAssignmentId) || appState.assignments[0];
  if (!currentAssignment) {
    container.innerHTML = `<div class="card"><p>ยังไม่มีงานที่มอบหมาย กรุณาเพิ่มงานก่อน</p></div>`;
    return;
  }

  // คำนวณสถิติงานนี้
  let submittedCount = 0;
  let pendingCount = 0;
  appState.students.forEach(st => {
    const key = `${currentAssignment.id}_${st.studentId}`;
    const sub = appState.submissions[key];
    if (sub && sub.status === 'ส่งแล้ว') {
      submittedCount++;
    } else {
      pendingCount++;
    }
  });

  // กรองนักเรียนตามฟิลเตอร์
  const filteredStudents = appState.students.filter(st => {
    const key = `${currentAssignment.id}_${st.studentId}`;
    const sub = appState.submissions[key] || { status: 'ค้างส่ง' };
    if (appState.filterStatus === 'submitted') return sub.status === 'ส่งแล้ว';
    if (appState.filterStatus === 'pending') return sub.status === 'ค้างส่ง';
    return true;
  });

  const activeStudent = appState.students.find(s => s.studentId === appState.selectedStudentId) || appState.students[0];
  const activeSubmissionKey = activeStudent ? `${currentAssignment.id}_${activeStudent.studentId}` : '';
  const activeSubmission = activeStudent ? (appState.submissions[activeSubmissionKey] || { status: 'ค้างส่ง', score: null }) : null;

  // Render HTML
  container.innerHTML = `
    <!-- Assignment Bar -->
    <div class="assignment-bar">
      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="font-weight: 600; font-size: 0.95rem;">เลือกงาน:</span>
        <select class="select-control" id="assignment-select" onchange="changeAssignment(this.value)">
          ${appState.assignments.map((a, idx) => `
            <option value="${a.id}" ${a.id === currentAssignment.id ? 'selected' : ''}>
              ${a.title} (คะแนนเต็ม ${a.fullScore})
            </option>
          `).join('')}
        </select>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" onclick="navigateAssignment(-1)" title="งานก่อนหน้า">◀ ก่อนหน้า</button>
          <button class="btn btn-secondary btn-sm" onclick="navigateAssignment(1)" title="งานถัดไป">ถัดไป ▶</button>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 0.85rem; color: var(--text-secondary);">
          ส่งแล้ว <strong>${submittedCount}</strong> / ค้าง <strong>${pendingCount}</strong> จาก ${appState.students.length} คน
        </span>
        <button class="btn btn-success btn-sm" onclick="markAllRemainingAsSubmitted()">
          ⚡ ส่งแล้วทุกคนที่เหลือ
        </button>
      </div>
    </div>

    <!-- Main Grading Grid -->
    <div class="grading-layout">
      <!-- Left: Student List Table -->
      <div class="student-table-container">
        <div class="table-action-bar">
          <div class="filter-pills">
            <button class="pill-btn ${appState.filterStatus === 'all' ? 'active' : ''}" onclick="setFilter('all')">
              ทั้งหมด (${appState.students.length})
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

        <div class="student-list" id="student-list-scroll">
          ${filteredStudents.map(st => {
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
          }).join('')}
        </div>
      </div>

      <!-- Right: In-App Scoring Numpad (Designed for iPad/Mobile Touch) -->
      <div>
        <div class="keypad-panel">
          ${activeStudent ? `
            <div class="active-student-card">
              <div class="active-student-no">เลขที่ ${activeStudent.no} • รหัส ${activeStudent.studentId}</div>
              <div class="active-student-title">${activeStudent.fullName}</div>
              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
                สถานะ: <strong>${activeSubmission.status}</strong> 
                ${activeSubmission.score !== null && activeSubmission.score !== '' ? `| คะแนน: <strong style="color: var(--primary); font-size: 1.1rem;">${activeSubmission.score}</strong>` : ''}
              </div>
            </div>

            <!-- Quick Status Toggles -->
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

            <!-- In-App Numpad for instant scoring without native keyboard popup -->
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
              <span>ข้ามไปคนถัดไปอัตโนมัติเมื่อกดคะแนน</span>
              <input type="checkbox" id="auto-advance-chk" ${appState.autoAdvance ? 'checked' : ''} onchange="toggleAutoAdvance(this.checked)">
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
function changeAssignment(assignmentId) {
  appState.selectedAssignmentId = assignmentId;
  saveLocalState();
  renderGrading(document.getElementById('app-view-container'));
}

function navigateAssignment(step) {
  const currentIdx = appState.assignments.findIndex(a => a.id === appState.selectedAssignmentId);
  const nextIdx = currentIdx + step;
  if (nextIdx >= 0 && nextIdx < appState.assignments.length) {
    changeAssignment(appState.assignments[nextIdx].id);
  }
}

function selectStudent(studentId) {
  appState.selectedStudentId = studentId;
  renderGrading(document.getElementById('app-view-container'));
}

function navigateStudent(step) {
  const currentIdx = appState.students.findIndex(s => s.studentId === appState.selectedStudentId);
  const nextIdx = currentIdx + step;
  if (nextIdx >= 0 && nextIdx < appState.students.length) {
    selectStudent(appState.students[nextIdx].studentId);
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
  const currentAssignment = appState.assignments.find(a => a.id === appState.selectedAssignmentId);
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
  const currentAssignment = appState.assignments.find(a => a.id === appState.selectedAssignmentId);
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
  const currentAssignment = appState.assignments.find(a => a.id === appState.selectedAssignmentId);
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
  const currentAssignment = appState.assignments.find(a => a.id === appState.selectedAssignmentId);
  if (!currentAssignment) return;

  let count = 0;
  appState.students.forEach(st => {
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
  showToast(`บันทึกส่งแล้ว ${count} คนเรียบร้อย`);
  renderGrading(document.getElementById('app-view-container'));
}

// ----------------- View: Report (A4 Landscape Matrix) -----------------
function renderReport(container) {
  const assignments = appState.assignments.slice(0, 10); // แสดงสูงสุด 10 งานต่อหน้าแบบในรูป
  const students = appState.students;

  container.innerHTML = `
    <div class="report-view-container">
      <div class="report-controls">
        <div>
          <h2 style="font-size: 1.15rem; font-weight: 600;">รายงานสรุปการส่งงาน (แบบฟอร์ม A4 แนวนอน)</h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">จัดรูปแบบตามมาตรฐานเอกสารส่งฝ่ายวิชาการ พร้อมพิมพ์หรือบันทึกเป็น PDF</p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary" onclick="exportToCSV()">
            📥 ส่งออก Excel (CSV)
          </button>
          <button class="btn btn-primary" onclick="window.print()">
            🖨️ พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>

      <div class="printable-sheet">
        <div class="sheet-header-text">
          <h2>${appState.settings.schoolName}</h2>
          <p>
            รายวิชา ${appState.settings.subjectName} &nbsp;|&nbsp; 
            ชั้น ${appState.settings.classroom} &nbsp;|&nbsp; 
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
              ${assignments.map(a => `
                <th colspan="2" class="task-header" title="${a.title}">
                  ${a.title}
                </th>
              `).join('')}
              <th colspan="3">สรุปทั้งรายวิชา</th>
            </tr>
            <tr>
              ${assignments.map(() => `
                <th style="width: 32px;">ส่ง</th>
                <th style="width: 32px;">คะแนน</th>
              `).join('')}
              <th style="width: 32px;">ส่ง</th>
              <th style="width: 32px;">ค้าง</th>
              <th style="width: 48px;">รวม</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(st => {
              let submittedSum = 0;
              let pendingSum = 0;
              let scoreSum = 0;
              let maxScoreSum = 0;

              const taskCols = assignments.map(a => {
                maxScoreSum += a.fullScore;
                const key = `${a.id}_${st.studentId}`;
                const sub = appState.submissions[key];
                if (sub && sub.status === 'ส่งแล้ว') {
                  submittedSum++;
                  const sc = sub.score !== null && sub.score !== '' ? sub.score : 0;
                  scoreSum += sc;
                  return `
                    <td class="tag-done">ส่ง</td>
                    <td>${sc}</td>
                  `;
                } else {
                  pendingSum++;
                  return `
                    <td class="tag-missing">ค้าง</td>
                    <td>-</td>
                  `;
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

// ----------------- Export to CSV -----------------
function exportToCSV() {
  const assignments = appState.assignments.slice(0, 10);
  let csvContent = '\uFEFF'; // UTF-8 BOM สำหรับ Excel ภาษาไทย

  // Headers
  let headerRow = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล'];
  assignments.forEach(a => {
    headerRow.push(`${a.title}_สถานะ`, `${a.title}_คะแนน`);
  });
  headerRow.push('ส่งแล้วรวม', 'ค้างส่งรวม', 'คะแนนรวม');
  csvContent += headerRow.map(h => `"${h}"`).join(',') + '\r\n';

  // Data Rows
  appState.students.forEach(st => {
    let row = [st.no, st.studentId, st.fullName];
    let submittedSum = 0;
    let pendingSum = 0;
    let scoreSum = 0;

    assignments.forEach(a => {
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
  link.setAttribute('download', `สรุปส่งงาน_${appState.settings.classroom}_${appState.settings.subjectName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ----------------- View: Student Roster -----------------
function renderStudents(container) {
  container.innerHTML = `
    <div class="card" style="margin-bottom: 1.25rem;">
      <div class="card-header">
        <h2 class="card-title">รายชื่อนักเรียน (${appState.students.length} คน)</h2>
        <button class="btn btn-primary" onclick="showAddStudentModal()">+ เพิ่มนักเรียน</button>
      </div>

      <div style="margin-bottom: 1rem; background: var(--bg-subtle); padding: 0.875rem; border-radius: var(--radius-md);">
        <h4 style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem;">คัดลอกรายชื่อจาก Excel มาวางได้ทันที</h4>
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
          รูปแบบ: เลขที่ [tab/เว้นวรรค] รหัสนักเรียน [tab/เว้นวรรค] ชื่อ-นามสกุล (วางทีละหลายบรรทัดได้)
        </p>
        <div style="display: flex; gap: 0.5rem;">
          <input type="text" id="paste-roster-input" class="form-input" placeholder="ตัวอย่าง: 1 25001 ด.ช.สมชาย ใจดี" />
          <button class="btn btn-secondary" onclick="handleQuickAddStudent()">เพิ่มด่วน</button>
        </div>
      </div>

      <div style="max-height: 500px; overflow-y: auto;">
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
            ${appState.students.map((st, idx) => `
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 0.5rem; font-weight: 600;">${st.no}</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${st.studentId}</td>
                <td style="padding: 0.5rem; font-weight: 500;">${st.fullName}</td>
                <td style="padding: 0.5rem;">${st.classroom || 'ป.4/1'}</td>
                <td style="padding: 0.5rem; text-align: right;">
                  <button class="btn btn-sm btn-secondary" onclick="deleteStudent('${st.studentId}')">ลบ</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function handleQuickAddStudent() {
  const input = document.getElementById('paste-roster-input');
  if (!input || !input.value.trim()) return;

  const text = input.value.trim();
  const parts = text.split(/[\t\s]+/);

  let no = appState.students.length + 1;
  let studentId = String(25000 + no);
  let fullName = text;

  if (parts.length >= 3 && !isNaN(parts[0])) {
    no = parseInt(parts[0]);
    studentId = parts[1];
    fullName = parts.slice(2).join(' ');
  } else if (parts.length >= 2 && !isNaN(parts[0])) {
    no = parseInt(parts[0]);
    fullName = parts.slice(1).join(' ');
  }

  appState.students.push({
    no: no,
    studentId: studentId,
    fullName: fullName,
    classroom: appState.settings.classroom,
    status: 'ปกติ'
  });

  saveLocalState();
  scheduleAutoSync();
  input.value = '';
  showToast(`เพิ่ม ${fullName} เรียบร้อยแล้ว`);
  renderStudents(document.getElementById('app-view-container'));
}

function deleteStudent(studentId) {
  if (confirm('คุณแน่ใจว่าต้องการลบนักเรียนคนนี้หรือไม่?')) {
    appState.students = appState.students.filter(s => s.studentId !== studentId);
    saveLocalState();
    scheduleAutoSync();
    renderStudents(document.getElementById('app-view-container'));
  }
}

// ----------------- View: Assignments Management -----------------
function renderAssignments(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">รายการงานที่มอบหมาย (${appState.assignments.length} งาน)</h2>
      </div>

      <div style="background: var(--bg-subtle); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.25rem;">
        <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.75rem;">+ สร้างงานใหม่</h4>
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; align-items: end;">
          <div>
            <label class="form-label">ชื่องาน / รายละเอียด</label>
            <input type="text" id="new-assign-title" class="form-input" placeholder="เช่น 11 แบบฝึกหัดทบทวน" />
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
              <th style="padding: 0.5rem; text-align: right;">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            ${appState.assignments.map(a => `
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 0.5rem; font-weight: 600; color: var(--primary);">${a.id}</td>
                <td style="padding: 0.5rem; font-weight: 500;">${a.title}</td>
                <td style="padding: 0.5rem;">${a.fullScore} คะแนน</td>
                <td style="padding: 0.5rem; color: var(--text-secondary);">${a.dueDate || '-'}</td>
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
    classroom: appState.settings.classroom
  });

  saveLocalState();
  scheduleAutoSync();
  showToast(`เพิ่มงาน "${title}" เรียบร้อย`);
  renderAssignments(document.getElementById('app-view-container'));
}

function deleteAssignment(assignId) {
  if (confirm('คุณแน่ใจว่าต้องการลบงานนี้หรือไม่? (คะแนนที่ตรวจไว้ในงานนี้จะถูกลบด้วย)')) {
    appState.assignments = appState.assignments.filter(a => a.id !== assignId);
    saveLocalState();
    scheduleAutoSync();
    renderAssignments(document.getElementById('app-view-container'));
  }
}

// ----------------- View: Settings -----------------
function renderSettings(container) {
  container.innerHTML = `
    <div class="card" style="max-width: 680px; margin: 0 auto;">
      <h2 class="card-title" style="margin-bottom: 1.25rem;">การตั้งค่าระบบ & เชื่อมต่อ Google Sheets</h2>

      <div class="form-group">
        <label class="form-label">ชื่อโรงเรียน</label>
        <input type="text" id="cfg-school" class="form-input" value="${appState.settings.schoolName}" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">รายวิชา</label>
          <input type="text" id="cfg-subject" class="form-input" value="${appState.settings.subjectName}" />
        </div>
        <div class="form-group">
          <label class="form-label">ห้องเรียนที่สอน</label>
          <input type="text" id="cfg-class" class="form-input" value="${appState.settings.classroom}" />
        </div>
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

      <div class="form-group" style="margin-top: 1rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <label class="form-label">Google Apps Script Web App API URL</label>
        <input type="text" id="cfg-gas-url" class="form-input" value="${appState.settings.gasUrl}" />
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
          API สำหรับเชื่อมต่อหน้าบ้านกับ Google Sheets (Deploy ผ่าน clasp เรียบร้อยแล้ว)
        </p>
      </div>

      <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button class="btn btn-primary" onclick="saveSettings()">💾 บันทึกการตั้งค่า</button>
        <button class="btn btn-secondary" onclick="triggerManualSync()">🔄 ซิงค์ข้อมูลกับ Google Sheets เดี๋ยวนี้</button>
      </div>

      <div style="margin-top: 2rem; border-top: 1px solid var(--border-light); padding-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
        <a href="${appState.settings.spreadsheetUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: none; font-size: 0.85rem; font-weight: 500;">
          📊 เปิด Google Spreadsheet
        </a>
        <button class="btn btn-secondary btn-sm" onclick="resetToSampleData()" style="color: #DC2626;">
          ⚠️ รีเซ็ตเป็นข้อมูลตัวอย่าง
        </button>
      </div>
    </div>
  `;
}

function saveSettings() {
  appState.settings.schoolName = document.getElementById('cfg-school').value;
  appState.settings.subjectName = document.getElementById('cfg-subject').value;
  appState.settings.classroom = document.getElementById('cfg-class').value;
  appState.settings.term = document.getElementById('cfg-term').value;
  appState.settings.academicYear = document.getElementById('cfg-year').value;
  appState.settings.teacherName = document.getElementById('cfg-teacher').value;
  appState.settings.gasUrl = document.getElementById('cfg-gas-url').value;

  saveLocalState();
  showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว');
}

function resetToSampleData() {
  if (confirm('คุณต้องการรีเซ็ตข้อมูลเป็นชุดตัวอย่าง (25 คน 10 งาน) หรือไม่? ข้อมูลที่บันทึกไว้ในเครื่องจะถูกแทนที่')) {
    seedDefaultState();
    showToast('รีเซ็ตข้อมูลตัวอย่างเรียบร้อยแล้ว');
    renderApp();
  }
}

// ----------------- Google Apps Script Sync Engine -----------------
let syncDebounceTimer = null;

function scheduleAutoSync() {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  updateSyncIndicator('syncing');

  // รวมคำขอแล้วส่งภายใน 2.5 วินาทีหลังหยุดพิมพ์/กด
  syncDebounceTimer = setTimeout(() => {
    pushSubmissionsToBackend();
  }, 2500);
}

async function pushSubmissionsToBackend() {
  if (!appState.settings.gasUrl) {
    updateSyncIndicator('offline');
    return;
  }

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

    const payload = {
      action: 'batchSaveSubmissions',
      submissions: list
    };

    // ส่งแบบ text/plain เพื่อป้องกัน CORS preflight ใน Google Apps Script
    await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      mode: 'no-cors' // Google Apps Script redirects across domains
    });

    updateSyncIndicator('online');
  } catch (err) {
    console.warn('Sync notice:', err);
    updateSyncIndicator('online'); // LocalStorage is safe
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
      saveLocalState();
      renderApp();
    }
  } catch (e) {
    // Offline or CORS fallback to LocalStorage
  }
}

async function triggerManualSync() {
  showToast('กำลังเชื่อมต่อกับ Google Sheets...');
  updateSyncIndicator('syncing');

  try {
    await pushSubmissionsToBackend();
    showToast('✓ บันทึกข้อมูลขึ้น Google Sheets สำเร็จ');
    updateSyncIndicator('online');
  } catch (e) {
    showToast('⚠️ ไม่สามารถเชื่อมต่อกับ Google Sheets ได้ในขณะนี้ (ข้อมูลบันทึกในเครื่องแล้ว)');
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

// ----------------- Toast Utility -----------------
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
