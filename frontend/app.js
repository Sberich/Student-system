/**
 * Smart Grade (สมาร์ทเกรด — ตรวจง่าย ตัดไว พร้อมส่ง)
 * รองรับ ม.4 (11 ห้อง: ม.4/1 - ม.4/11), ม.5 (2 ห้อง: ม.5/1, ม.5/2) รวม 13 ห้องเรียน
 * รองรับการสอน 5 รายวิชา, ระบบตัดเกรด SGS, และ PWA Mobile-First
 */

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwwpQptiXdGKmA7QVj7VtklNeilBa64DfVJ29pviwPyLQ2K4V5irMEGynTzffYve_gb/exec';
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1fP4g1aedTiymV9ZTIer0gWjTWZeewOrk6gJo2qfWjpU/edit';

const STORAGE_KEY = 'educator_app_state_v2';

const DEFAULT_CLASSROOMS = [
  'ม.4/1', 'ม.4/2', 'ม.4/3', 'ม.4/4', 'ม.4/5', 'ม.4/6',
  'ม.4/7', 'ม.4/8', 'ม.4/9', 'ม.4/10', 'ม.4/11'
];

const DEFAULT_SUBJECTS = [
  { code: 'ส31162', name: 'ประวัติศาสตร์ไทย (ม.4)', classrooms: ['ม.4/1', 'ม.4/2', 'ม.4/3', 'ม.4/4', 'ม.4/5', 'ม.4/6', 'ม.4/7', 'ม.4/8', 'ม.4/9', 'ม.4/10', 'ม.4/11'] },
  { code: 'ส31102', name: 'สังคมศึกษา (ม.4)', classrooms: ['ม.4/2', 'ม.4/3'] },
  { code: 'ส30212', name: 'กฎหมายที่ประชาชนควรรู้ (ม.ปลาย)', classrooms: ['ม.4/11'] },
  { code: 'ส31238', name: 'ต่อต้านการทุจริต', classrooms: ['ม.4/11'] }
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

/**
 * ดึงรายการห้องเรียนที่ผูกกับวิชาที่ระบุ (หรือวิชาปัจจุบัน)
 * หากวิชานั้นยังไม่ได้ระบุห้อง หรือรายชื่อห้องว่าง ให้ใช้รายการห้องเรียนทั้งหมดเป็นค่าเริ่มต้น (Fallback)
 */
function getClassroomsForSubject(subjectCode = null) {
  const code = subjectCode || (appState && appState.activeSubject) || 'ส31162';
  const subjects = (appState && appState.settings && Array.isArray(appState.settings.subjects)) 
    ? appState.settings.subjects 
    : DEFAULT_SUBJECTS;
  const sub = subjects.find(s => s.code === code);
  if (sub && Array.isArray(sub.classrooms) && sub.classrooms.length > 0) {
    return sortClassroomNames(sub.classrooms);
  }
  const masterClassrooms = (appState && appState.settings && Array.isArray(appState.settings.classrooms) && appState.settings.classrooms.length > 0)
    ? appState.settings.classrooms 
    : DEFAULT_CLASSROOMS;
  return sortClassroomNames(masterClassrooms);
}
window.getClassroomsForSubject = getClassroomsForSubject;

let appState = {
  currentTab: 'overview',
  activeClassroom: 'ม.4/1',
  activeSubject: 'ส31162',
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
  submissions: {}, // key: `${assignmentId}_${studentId}`
  gradebookRatio: '70/30', // '70/30' or '80/20'
  finalDivisor: 2, // ตัวหารข้อเขียนปลายภาค (ค่าเริ่มต้นคือ 2)
  gradebook: {} // key: `${subject}_${classroom}_${studentId}`
};

// Undo stack สำหรับการตรวจงานล่าสุด
let lastGradingAction = null;

// State สำหรับหน้าต่าง Import
let importPreviewData = [];

let hasSavedLocalState = false;
let hasEverPulledFromBackend = false;

// ----------------- Theme Switcher System -----------------
function initTheme() {
  const savedTheme = localStorage.getItem('smartgrade_theme') || 'blue';
  setAppTheme(savedTheme, false);
}

function setAppTheme(themeName, showToastMsg = true) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('smartgrade_theme', themeName);

  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    const icons = {
      'blue': '🔷',
      'emerald': '🌿',
      'purple': '🌸',
      'dark': '🌙'
    };
    toggleBtn.textContent = icons[themeName] || '🎨';
  }

  updateLogoGradient(themeName);

  if (showToastMsg) {
    const names = {
      'blue': '🔷 ธีมฟ้าคราม (Classic)',
      'emerald': '🌿 ธีมเขียวมินต์ (Fresh)',
      'purple': '🌸 ธีมพิงก์วอร์เทกซ์ (Pink Vortex)',
      'dark': '🌙 โหมดมืด (Dark Mode)'
    };
    showToast(`เปลี่ยนธีม: ${names[themeName] || themeName}`);
  }

  if (appState.currentTab === 'settings') {
    renderApp();
  }
}

function cycleTheme() {
  const themes = ['blue', 'emerald', 'purple', 'dark'];
  const current = localStorage.getItem('smartgrade_theme') || 'blue';
  const nextIdx = (themes.indexOf(current) + 1) % themes.length;
  setAppTheme(themes[nextIdx], true);
}

function updateLogoGradient(theme) {
  const grad = document.getElementById('brandGrad');
  if (!grad) return;
  const colors = {
    'blue': { start: '#2563EB', end: '#1D4ED8', dot: '#93C5FD' },
    'emerald': { start: '#059669', end: '#0F766E', dot: '#6EE7B7' },
    'purple': { start: '#FF748A', end: '#4D5784', dot: '#B7DED7' },
    'dark': { start: '#475569', end: '#0F172A', dot: '#38BDF8' }
  };
  const c = colors[theme] || colors.blue;
  const stops = grad.querySelectorAll('stop');
  if (stops.length >= 2) {
    stops[0].setAttribute('stop-color', c.start);
    stops[1].setAttribute('stop-color', c.end);
  }
  const dot = document.getElementById('logoAccentDot');
  if (dot) dot.setAttribute('fill', c.dot);
  const tassel = document.getElementById('logoTassel');
  if (tassel) tassel.setAttribute('stroke', c.dot);
}

// ----------------- Initialization -----------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadLocalState();
  if (!hasSavedLocalState) {
    appState.settings.subjects = DEFAULT_SUBJECTS;
    appState.settings.classrooms = DEFAULT_CLASSROOMS;
    appState.activeClassroom = 'ม.4/1';
    appState.activeSubject = 'ส31101';
    appState.students = [];
    appState.assignments = [];
    appState.submissions = {};
    appState.gradebook = {};
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

/**
 * ล้างข้อมูลคะแนนและรายการที่ตกค้าง/ผิดพลาดในหน่วยความจำของเบราว์เซอร์ (Prune Ghost/Orphan Records)
 * ป้องกันข้อมูลห้องที่เคยถูกลบไปแล้ว หรือวิชาที่ไม่ตรงกับห้องเรียน ถูกส่งกลับไปขึ้น Google Sheets
 */
function purgeInvalidGradebookRecords() {
  if (!appState.gradebook || typeof appState.gradebook !== 'object') {
    appState.gradebook = {};
    return 0;
  }

  const subjects = (appState.settings && Array.isArray(appState.settings.subjects))
    ? appState.settings.subjects
    : DEFAULT_SUBJECTS;

  const validKeys = new Set();

  subjects.forEach(sub => {
    const code = sub.code;
    const rooms = getClassroomsForSubject(code);
    rooms.forEach(room => {
      const roomStudents = (appState.students || []).filter(s => s.classroom === room);
      roomStudents.forEach(st => {
        validKeys.add(code + '_' + room + '_' + String(st.studentId || ''));
      });
    });
  });

  const isStudentListLoaded = appState.students && appState.students.length > 0;

  let deletedCount = 0;
  Object.keys(appState.gradebook).forEach(key => {
    const parts = key.split('_');
    if (parts.length < 3) {
      delete appState.gradebook[key];
      deletedCount++;
      return;
    }
    const subj = parts[0];
    const room = parts[1];
    const validRooms = getClassroomsForSubject(subj);

    if (!validRooms.includes(room)) {
      delete appState.gradebook[key];
      deletedCount++;
      return;
    }

    if (isStudentListLoaded && !validKeys.has(key)) {
      delete appState.gradebook[key];
      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    console.log(`[Gradebook Cleaner] ล้างข้อมูลคะแนนผี/ห้องที่ถูกลบออกจากเครื่องแล้ว ${deletedCount} รายการ`);
  }
  return deletedCount;
}

function loadLocalState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appState = { ...appState, ...parsed };
      if (!appState.gradebook) appState.gradebook = {};
      if (!appState.gradebookRatio) appState.gradebookRatio = '70/30';
      if (!appState.finalDivisor) appState.finalDivisor = 2;
      // ซ่อมแซมและปรับสมการความถูกต้องของ Gradebook 100%
      if (appState.gradebook && Object.keys(appState.gradebook).length > 0) {
        Object.keys(appState.gradebook).forEach(k => {
          let rec = appState.gradebook[k];

          if (!rec.finalDiv) rec.finalDiv = appState.finalDivisor || 2;
          if (rec.midDiv !== 1) rec.midDiv = 1;
          appState.gradebook[k] = calculateGradeRecord(rec, appState.gradebookRatio || '70/30');
        });
      }

      // ตรวจสอบและเติมห้องเรียนเริ่มต้นให้แก่รายวิชาที่ยังไม่มีการผูกห้องเรียน (Backward Compatibility)
      if (appState.settings && Array.isArray(appState.settings.subjects)) {
        appState.settings.subjects.forEach(sub => {
          if (!sub.classrooms || !Array.isArray(sub.classrooms) || sub.classrooms.length === 0) {
            const defMatch = DEFAULT_SUBJECTS.find(d => d.code === sub.code);
            if (defMatch && defMatch.classrooms) {
              sub.classrooms = [...defMatch.classrooms];
            } else {
              sub.classrooms = [...(appState.settings.classrooms || DEFAULT_CLASSROOMS)];
            }
          }
        });
      }

      // ตรวจสอบว่าห้องเรียนที่เลือก สอดคล้องกับวิชาที่เลือกอยู่หรือไม่
      const validRooms = getClassroomsForSubject(appState.activeSubject);
      if (!validRooms.includes(appState.activeClassroom)) {
        appState.activeClassroom = validRooms[0] || (appState.settings.classrooms && appState.settings.classrooms[0]) || 'ม.4/1';
      }

      // ล้างข้อมูลผีและข้อมูลห้องที่ถูกลบออกจากเครื่องทันที
      purgeInvalidGradebookRecords();

      hasSavedLocalState = true;
    }
  } catch (e) {
    console.error('Error loading local state:', e);
  }

  // ป้องกัน URL เก่าที่อาจค้างใน Browser Cache
  if (!appState.settings.gasUrl || 
      appState.settings.gasUrl.includes('AKfycbxkrB2zP2g') || 
      appState.settings.gasUrl.includes('AKfycbyGhv4Xzj1OFV0h7ckHx10UE4CdApjMcMInIkc-ZQJOvXqoWVqvFIYj1nytiRap8nsx')) {
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
      submissions: appState.submissions,
      gradebookRatio: appState.gradebookRatio,
      finalDivisor: appState.finalDivisor || 2,
      gradebook: appState.gradebook
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
  appState.activeSubject = 'ส31162';

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

  const subjectObj = getActiveSubjectObj();
  const subjectRooms = getClassroomsForSubject(appState.activeSubject);

  const subjectItemsHtml = appState.settings.subjects.map(s => {
    const isActive = s.code === appState.activeSubject;
    const sRooms = getClassroomsForSubject(s.code);
    return `
      <div class="popover-menu-item ${isActive ? 'active' : ''}" onclick="selectSubjectFromPopover('${esc(s.code)}')">
        <div class="popover-item-main">
          <span class="popover-item-num">📖</span>
          <span class="popover-item-title">${esc(s.code)} ${esc(s.name)}</span>
        </div>
        <div class="popover-item-side">
          <span class="popover-item-tag">${sRooms.length} ห้อง</span>
          ${isActive ? '<span class="popover-item-check">✓</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  const classItemsHtml = subjectRooms.map(c => {
    const isActive = c === appState.activeClassroom;
    const count = appState.students.filter(st => st.classroom === c).length;
    return `
      <div class="popover-menu-item ${isActive ? 'active' : ''}" onclick="selectClassroomFromPopover('${esc(c)}')">
        <div class="popover-item-main">
          <span class="popover-item-num">🏫</span>
          <span class="popover-item-title">ห้อง ${esc(c)}</span>
        </div>
        <div class="popover-item-side">
          <span class="popover-item-tag">${count} คน</span>
          ${isActive ? '<span class="popover-item-check">✓</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="context-unified-bar">
      <div class="popover-dropdown-wrapper">
        <button type="button" class="context-popover-btn" onclick="toggleCustomDropdown('header-subject-popover', this, event)" title="เลือกรายวิชา (${appState.settings.subjects.length} วิชา)">
          <span class="context-bar-icon">📖</span>
          <span class="context-picker-text">${esc(subjectObj.code)}</span>
          <span class="popover-arrow">▾</span>
        </button>
        <div class="popover-dropdown-menu" id="header-subject-popover" style="display: none;">
          ${subjectItemsHtml}
        </div>
      </div>
      <span class="context-sep">•</span>
      <div class="popover-dropdown-wrapper">
        <button type="button" class="context-popover-btn" onclick="toggleCustomDropdown('header-classroom-popover', this, event)" title="เลือกห้องเรียน (${subjectRooms.length} ห้อง)">
          <span class="context-bar-icon">🏫</span>
          <span class="context-picker-text">${esc(appState.activeClassroom)}</span>
          <span class="popover-arrow">▾</span>
        </button>
        <div class="popover-dropdown-menu" id="header-classroom-popover" style="display: none;">
          ${classItemsHtml}
        </div>
      </div>
    </div>
  `;
}

function selectSubjectFromPopover(subCode) {
  closeAllCustomDropdowns();
  changeActiveSubject(subCode);
}

function selectClassroomFromPopover(classroom) {
  closeAllCustomDropdowns();
  changeActiveClassroom(classroom);
}

function selectAssignmentFromPopover(assignId) {
  closeAllCustomDropdowns();
  changeAssignment(assignId);
}

function changeActiveSubject(subCode) {
  appState.activeSubject = subCode;

  // ตรวจสอบว่าห้องเรียนปัจจุบันอยู่ในวิชาใหม่หรือไม่ หากไม่อยู่ ให้สลับไปยังห้องแรกของวิชานี้อัตโนมัติ
  const validRooms = getClassroomsForSubject(subCode);
  if (!validRooms.includes(appState.activeClassroom)) {
    appState.activeClassroom = validRooms[0] || (appState.settings.classrooms && appState.settings.classrooms[0]) || 'ม.4/1';
  }

  // ปรับงานและนักเรียนที่เลือกให้ตรงกับห้องใหม่
  const classAssignments = getFilteredAssignments();
  if (classAssignments.length > 0) {
    appState.selectedAssignmentId = classAssignments[0].id;
  } else {
    appState.selectedAssignmentId = '';
  }
  const classStudents = getFilteredStudents();
  if (classStudents.length > 0) {
    appState.selectedStudentId = classStudents[0].studentId;
  } else {
    appState.selectedStudentId = '';
  }

  saveLocalState();
  renderHeaderControls();
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

function setOverviewScope(scope) {
  appState.overviewScope = scope;
  renderApp();
}

function selectClassroomAndFocus(classroom) {
  changeActiveClassroom(classroom);
  appState.overviewScope = 'room';
  renderApp();
  if (typeof showToast === 'function') {
    showToast('สลับไปดูห้อง ' + classroom + ' เรียบร้อยแล้ว');
  }
}

window.setOverviewScope = setOverviewScope;
window.selectClassroomAndFocus = selectClassroomAndFocus;

// ----------------- Anchored Popover Dropdown Engine (Image 1 Style) -----------------
function toggleCustomDropdown(popoverId, triggerBtn, event) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const popover = document.getElementById(popoverId);
  if (!popover) return;
  const isCurrentlyOpen = popover.style.display === 'block';

  closeAllCustomDropdowns();

  if (!isCurrentlyOpen) {
    popover.style.display = 'block';
    if (triggerBtn) triggerBtn.classList.add('popover-open');
  }
}

function closeAllCustomDropdowns() {
  document.querySelectorAll('.popover-dropdown-menu').forEach(el => {
    el.style.display = 'none';
  });
  document.querySelectorAll('.popover-trigger-btn, .context-popover-btn').forEach(btn => {
    btn.classList.remove('popover-open');
  });
}

// Expose to window to guarantee zero shadowing from element prototypes
window.toggleCustomDropdown = toggleCustomDropdown;
window.closeAllCustomDropdowns = closeAllCustomDropdowns;
window.closeAllPopovers = closeAllCustomDropdowns;

// Global click outside listener for popover dropdowns
document.addEventListener('click', (e) => {
  if (!e.target.closest('.popover-dropdown-wrapper')) {
    closeAllCustomDropdowns();
  }
});

function setupEventListeners() {
  document.querySelectorAll('.nav-tab-btn, .bottom-nav-btn').forEach(btn => {
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
  if (tabName !== 'gradebook' && typeof closeGradebookFloatingKeypad === 'function') {
    closeGradebookFloatingKeypad();
  }
  document.querySelectorAll('.nav-tab-btn, .bottom-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  renderApp();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
      case 'gradebook': renderGradebook(container); break;
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

  // โหมดขอบเขตข้อมูลของ Donut Chart (เฉพาะห้องนี้ หรือ รวมทุกห้องของวิชานี้)
  const overviewScope = appState.overviewScope || 'room';
  const isAllRooms = (overviewScope === 'all');

  const allClassrooms = getClassroomsForSubject(appState.activeSubject);
  const donutStudents = isAllRooms 
    ? appState.students.filter(st => allClassrooms.includes(st.classroom)) 
    : currentStudents;
  const donutExpected = donutStudents.length * currentAssignments.length;
  let donutSubmitted = 0;
  let donutPending = 0;

  currentAssignments.forEach(assign => {
    donutStudents.forEach(st => {
      const key = `${assign.id}_${st.studentId}`;
      const sub = appState.submissions[key];
      if (sub && sub.status === 'ส่งแล้ว') donutSubmitted++;
      else donutPending++;
    });
  });

  const donutPct = donutExpected > 0 ? Math.round((donutSubmitted / donutExpected) * 100) : 0;
  const donutDashoffset = 283 - (283 * donutPct) / 100;

  // เปรียบเทียบสัดส่วนส่งงานแยกรายห้องในวิชานี้
  const classroomComparison = allClassrooms.map(c => {
    const cStudents = appState.students.filter(s => s.classroom === c);
    const cExpected = cStudents.length * currentAssignments.length;
    let cSub = 0;
    currentAssignments.forEach(assign => {
      cStudents.forEach(st => {
        const key = `${assign.id}_${st.studentId}`;
        const sub = appState.submissions[key];
        if (sub && sub.status === 'ส่งแล้ว') cSub++;
      });
    });
    const cPct = cExpected > 0 ? Math.round((cSub / cExpected) * 100) : 0;
    return {
      classroom: c,
      studentsCount: cStudents.length,
      submitted: cSub,
      pending: cExpected - cSub,
      pct: cPct
    };
  });

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
      <div class="risk-student-card">
        <div class="risk-row-top">
          <div class="risk-name-group">
            <span class="risk-student-no">#${st.no}</span>
            <span class="risk-student-fullname">${esc(st.fullName)}</span>
          </div>
          <button class="btn btn-secondary btn-sm risk-action-btn" onclick="quickJumpToGrade('${esc(st.studentId)}')">
            ✏️ ตรวจงาน
          </button>
        </div>
        <div class="risk-row-bottom">
          <span class="risk-student-meta">รหัส ${esc(st.studentId)} • ${esc(st.classroom)}</span>
          <span class="risk-badge">⚠️ ค้าง ${st.pendingCount} งาน</span>
        </div>
      </div>
    `).join('');

    riskCardHtml = `
      <div class="card" style="margin-top: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.875rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h3 class="risk-heading-responsive">
              <span class="risk-heading-main">⚠️ นักเรียนที่ค้างส่งสะสมสูงสุด</span>
              <span class="risk-heading-room">(ห้อง ${esc(appState.activeClassroom)})</span>
            </h3>
          </div>
          <span style="font-size: 0.78rem; color: var(--text-muted); align-self: flex-end;">ลำดับความสำคัญในการติดตามงานก่อนตัดเกรด</span>
        </div>
        <div>
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  // แถบห้องเรียนด่วนเฉพาะวิชานี้
  const classPillsHtml = allClassrooms.map(c => {
    const count = appState.students.filter(s => s.classroom === c).length;
    const isActive = c === appState.activeClassroom;
    return `
      <button class="class-pill ${isActive ? 'active' : ''}" onclick="changeActiveClassroom('${esc(c)}')">
        ${esc(c)} <span class="badge">${count} คน</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <!-- แถบเลือกห้องเรียนด่วน (${allClassrooms.length} ห้อง) -->
    <div class="classroom-pill-strip">
      <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); white-space: nowrap;">เลือกระดับชั้น:</span>
      ${classPillsHtml}
    </div>

    <div class="overview-grid">
      <div>
        <div class="card" style="margin-bottom: 1.25rem;">
          <div class="card-header" style="margin-bottom: 0.85rem;">
            <div>
              <h2 class="card-title">${esc(subjectObj.code)} ${esc(subjectObj.name)} • ห้อง ${esc(appState.activeClassroom)}</h2>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                ภาคเรียนที่ ${esc(appState.settings.term)} ปีการศึกษา ${esc(appState.settings.academicYear)} | ${esc(appState.settings.schoolName)}
              </p>
            </div>
          </div>

          <!-- สรุปสถิติ 4 ช่องแนวนอนแถวเดียว (Single-Row Strip มินิมอล) -->
          <div class="stats-strip-single-row">
            <div class="stat-pill-item">
              <span class="stat-pill-label">👥 นักเรียน</span>
              <span class="stat-pill-val">${totalStudents} <small>คน</small></span>
            </div>
            <div class="stat-pill-item" onclick="switchTab('assignments')" style="cursor: pointer;" title="แตะเพื่อดู/จัดการภาระงาน">
              <span class="stat-pill-label">📚 ชิ้นงาน</span>
              <span class="stat-pill-val">${totalAssignments} <small>ชิ้น</small></span>
            </div>
            <div class="stat-pill-item stat-pill-success">
              <span class="stat-pill-label">✓ ส่งแล้ว</span>
              <span class="stat-pill-val">${totalSubmitted}</span>
            </div>
            <div class="stat-pill-item stat-pill-warning">
              <span class="stat-pill-label">⏳ ค้างส่ง</span>
              <span class="stat-pill-val">${totalPending}</span>
            </div>
          </div>

          <h3 style="font-size: 0.82rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-secondary);">เมนูดำเนินการด่วน</h3>
          <div class="quick-action-compact-grid" style="grid-template-columns: 1fr 1fr;">
            <button class="action-compact-btn" onclick="switchTab('report')">
              <span class="tile-icon-sm">📄</span>
              <span>พิมพ์รายงาน A4</span>
            </button>
            <button class="action-compact-btn" onclick="switchTab('students')">
              <span class="tile-icon-sm">👥</span>
              <span>ดูรายชื่อ (${totalStudents} คน)</span>
            </button>
          </div>
        </div>
      </div>

      <div>
        <div class="card donut-container">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.4rem;">
            <h3 style="font-size: 0.95rem; font-weight: 600; margin: 0;">
              ${isAllRooms ? `สัดส่วนส่งงานรวม (${allClassrooms.length} ห้องเรียน)` : `สัดส่วนส่งงานห้อง ${esc(appState.activeClassroom)}`}
            </h3>
            <div class="scope-toggle-pills">
              <button type="button" class="scope-pill-btn ${!isAllRooms ? 'active' : ''}" onclick="setOverviewScope('room')">เฉพาะห้องนี้</button>
              <button type="button" class="scope-pill-btn ${isAllRooms ? 'active' : ''}" onclick="setOverviewScope('all')">โดนัททุกห้อง (${allClassrooms.length})</button>
            </div>
          </div>

          ${isAllRooms ? `
            <!-- สรุปตัวเลขภาพรวม 15 ห้อง -->
            <div class="all-rooms-summary-bar">
              <span class="all-rooms-sum-chip">📊 ส่งครบเฉลี่ย: <strong>${donutPct}%</strong></span>
              <span class="all-rooms-sum-chip text-green">✓ ส่งแล้ว: <strong>${donutSubmitted}</strong> ครั้ง</span>
              <span class="all-rooms-sum-chip text-red">⏳ ค้างส่ง: <strong>${donutPending}</strong> ครั้ง</span>
            </div>

            <!-- แกลเลอรีโดนัทรายห้องเรียงครบทุกห้อง -->
            <div class="all-rooms-donut-gallery">
              ${classroomComparison.map(r => {
                const cDashoffset = 226.2 - (226.2 * r.pct) / 100;
                const isGood = r.pct >= 80;
                const isWarn = r.pct >= 50 && r.pct < 80;
                const color = isGood ? '#10B981' : (isWarn ? '#F59E0B' : '#EF4444');
                const isCurrent = r.classroom === appState.activeClassroom;
                return `
                  <div class="mini-donut-card ${isCurrent ? 'is-active-room' : ''}" onclick="selectClassroomAndFocus('${esc(r.classroom)}')" title="แตะเพื่อเลือกห้อง ${esc(r.classroom)}">
                    <div class="mini-donut-header">
                      <span class="mini-donut-room">🏫 ${esc(r.classroom)}</span>
                      <span class="mini-donut-count">${r.studentsCount} คน</span>
                    </div>
                    <div class="mini-donut-content">
                      <div class="mini-donut-chart">
                        <svg viewBox="0 0 90 90" style="width: 64px; height: 64px; transform: rotate(-90deg);">
                          <circle class="donut-track" cx="45" cy="45" r="36" fill="none" stroke="#FEE2E2" stroke-width="8" />
                          <circle cx="45" cy="45" r="36" fill="none" stroke="${color}" stroke-width="8"
                            stroke-dasharray="226.2" stroke-dashoffset="${cDashoffset}" stroke-linecap="round" />
                        </svg>
                        <div class="mini-donut-center">
                          <span class="mini-donut-pct" style="color: ${color};">${r.pct}%</span>
                        </div>
                      </div>
                      <div class="mini-donut-stats">
                        <div class="mini-stat-item">
                          <span class="mini-stat-dot" style="background: #10B981;"></span>
                          <span class="mini-stat-text">ส่ง ${r.submitted}</span>
                        </div>
                        <div class="mini-stat-item">
                          <span class="mini-stat-dot" style="background: #EF4444;"></span>
                          <span class="mini-stat-text">ค้าง ${r.pending}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="donut-body-horizontal">
              <div class="donut-chart-wrapper">
                <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                  <circle class="donut-track" cx="50" cy="50" r="45" fill="none" stroke="#FEE2E2" stroke-width="10" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#10B981" stroke-width="10"
                    stroke-dasharray="283" stroke-dashoffset="${donutDashoffset}" stroke-linecap="round" />
                </svg>
                <div class="donut-center-text">
                  <span class="donut-pct">${donutPct}%</span>
                  <span class="donut-sub">ส่งครบ</span>
                </div>
              </div>
              <div class="donut-legend-side">
                <div class="donut-stat-card stat-card-submitted">
                  <span class="donut-stat-dot" style="background: #10B981;"></span>
                  <div class="donut-stat-info">
                    <span class="donut-stat-label">ส่งแล้ว</span>
                    <span class="donut-stat-val">${donutSubmitted} <small>ครั้ง</small></span>
                  </div>
                </div>
                <div class="donut-stat-card stat-card-pending">
                  <span class="donut-stat-dot" style="background: #EF4444;"></span>
                  <div class="donut-stat-info">
                    <span class="donut-stat-label">ค้างส่ง</span>
                    <span class="donut-stat-val">${donutPending} <small>ครั้ง</small></span>
                  </div>
                </div>
              </div>
            </div>
          `}
          <div style="margin-top: 1rem; width: 100%; border-top: 1px solid var(--border-light); padding-top: 0.75rem; text-align: center; display: flex; flex-direction: column; gap: 0.5rem;">
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
      <div class="assign-bar-row-1">
        <div class="popover-dropdown-wrapper assign-popover-wrapper">
          <button type="button" class="popover-trigger-btn" onclick="toggleCustomDropdown('assign-popover-menu', this, event)" id="assignment-picker-btn" title="แตะเพื่อเลือกภาระงาน">
            <span class="popover-trigger-text">📚 ${esc(currentAssignment.title)} (เต็ม ${currentAssignment.fullScore})</span>
            <span class="popover-trigger-arrow">▾</span>
          </button>
          <div class="popover-dropdown-menu" id="assign-popover-menu" style="display: none;">
            ${currentAssignments.map((a, idx) => {
              const isActive = a.id === currentAssignment.id;
              return `
                <div class="popover-menu-item ${isActive ? 'active' : ''}" onclick="selectAssignmentFromPopover('${esc(a.id)}')">
                  <div class="popover-item-main">
                    <span class="popover-item-num">${idx + 1}.</span>
                    <span class="popover-item-title">${esc(a.title)}</span>
                  </div>
                  <div class="popover-item-side">
                    <span class="popover-item-tag">เต็ม ${a.fullScore}</span>
                    ${isActive ? '<span class="popover-item-check">✓</span>' : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" onclick="navigateAssignment(-1)" title="งานก่อนหน้า">◀</button>
          <button class="btn btn-secondary btn-sm" onclick="navigateAssignment(1)" title="งานถัดไป">▶</button>
          <button class="btn btn-secondary btn-sm" onclick="switchTab('assignments')" title="จัดการภาระงาน / เพิ่มงานใหม่">📚</button>
        </div>
      </div>

      <div class="assign-bar-row-2">
        <div class="mode-toggle-group">
          <button class="mode-btn ${appState.gradingMode === 'rapid' ? 'active' : ''}" onclick="setGradingMode('rapid')" title="แตะชื่อนักเรียน = ส่งแล้วและได้คะแนนเต็มทันที">
            ⚡ ตรวจด่วน
          </button>
          <button class="mode-btn ${appState.gradingMode === 'detailed' ? 'active' : ''}" onclick="setGradingMode('detailed')" title="แตะเลือกนักเรียน แล้วกดให้คะแนนบนแป้นตัวเลข">
            📝 ตรวจละเอียด
          </button>
        </div>
        <div class="btn-group">
          <button class="btn btn-success btn-sm btn-mark-all" onclick="markAllRemainingAsSubmitted()" title="บันทึกคนที่ยังค้างส่งทุกคนให้เป็นส่งแล้วและได้คะแนนเต็ม">
            ⚡ ส่งแล้วทุกคน
          </button>
          <button class="btn btn-secondary btn-sm btn-clear-sub" onclick="clearAssignmentSubmissions()" title="ล้างสถานะส่งงานของงานนี้ทุกคนกลับเป็นค้างส่ง">
            🔄 ล้างส่ง
          </button>
        </div>
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
                <div class="score-display-group">
                  <div class="score-display ${sub.score !== null && sub.score !== '' ? '' : 'empty'}">
                    ${sub.score !== null && sub.score !== '' ? sub.score : '-'}
                  </div>
                  <button type="button" class="btn-score-dec" onclick="adjustStudentScore(event, '${esc(st.studentId)}', -1)" title="ลดคะแนน (ส่งช้า)">−</button>
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

/**
 * ปรับคะแนนขึ้น/ลงทีละ 1 คะแนนบนมือถือ (สำหรับกรณีส่งช้า หรือตัดแต้มด่วน)
 */
function adjustStudentScore(event, studentId, delta) {
  if (event) event.stopPropagation();
  const currentAssignments = getFilteredAssignments();
  const assign = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!assign) return;

  const maxScore = assign.fullScore || 5;
  const key = `${assign.id}_${studentId}`;
  const sub = appState.submissions[key];

  let currentScore;
  if (!sub || sub.status !== 'ส่งแล้ว' || sub.score === null || sub.score === '') {
    currentScore = delta < 0 ? maxScore : 0;
  } else {
    currentScore = Number(sub.score);
  }

  let newScore = Math.max(0, Math.min(maxScore, Math.round((currentScore + delta) * 10) / 10));

  appState.submissions[key] = {
    ...sub,
    assignmentId: assign.id,
    studentId: studentId,
    status: 'ส่งแล้ว',
    score: newScore,
    updatedAt: new Date().toISOString()
  };

  appState.selectedStudentId = studentId;
  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync();
  renderGrading(document.getElementById('app-view-container'));

  const currentStudents = getFilteredStudents();
  const st = currentStudents.find(s => s.studentId === studentId);
  const name = st ? st.fullName : '';
  showToast(`✏️ ${name}: ${newScore}/${maxScore} คะแนน`);
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

  // หาตัวนักเรียนคนถัดไปตาม Filter ปัจจุบันล่วงหน้า ก่อนที่สถานะจะเปลี่ยนจาก 'ค้างส่ง' เป็น 'ส่งแล้ว'
  let nextStudentIdToSelect = null;
  if (appState.autoAdvance) {
    const visibleStudents = currentStudents.filter(st => {
      const k = `${currentAssignment.id}_${st.studentId}`;
      const s = appState.submissions[k] || { status: 'ค้างส่ง' };
      if (appState.filterStatus === 'submitted') return s.status === 'ส่งแล้ว';
      if (appState.filterStatus === 'pending') return s.status === 'ค้างส่ง';
      return true;
    });
    const curIdx = visibleStudents.findIndex(s => s.studentId === appState.selectedStudentId);
    if (curIdx !== -1 && curIdx + 1 < visibleStudents.length) {
      nextStudentIdToSelect = visibleStudents[curIdx + 1].studentId;
    }
  }

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
    if (nextStudentIdToSelect) {
      selectStudent(nextStudentIdToSelect);
    } else {
      renderGrading(document.getElementById('app-view-container'));
    }
  } else {
    renderGrading(document.getElementById('app-view-container'));
  }
}

function markAllRemainingAsSubmitted() {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment) return;

  const previousSnapshot = {};
  let count = 0;
  getFilteredStudents().forEach(st => {
    const key = `${currentAssignment.id}_${st.studentId}`;
    const sub = appState.submissions[key];
    if (!sub || sub.status !== 'ส่งแล้ว') {
      previousSnapshot[key] = sub ? { ...sub } : { status: 'ค้างส่ง', score: null };
      appState.submissions[key] = {
        status: 'ส่งแล้ว',
        score: currentAssignment.fullScore,
        updatedAt: new Date().toISOString()
      };
      count++;
    }
  });

  if (count === 0) {
    showToast('นักเรียนทุกคนในห้องนี้ส่งงานนี้ครบแล้ว');
    return;
  }

  appState.isDirty = true;
  saveLocalState();
  scheduleAutoSync();

  showToastWithAction(
    `⚡ ส่งแล้ว (เต็ม ${currentAssignment.fullScore}) ${count} คน`,
    '↩️ เลิกทำ',
    () => {
      Object.keys(previousSnapshot).forEach(k => {
        appState.submissions[k] = previousSnapshot[k];
      });
      appState.isDirty = true;
      saveLocalState();
      scheduleAutoSync();
      showToast('↩️ ยกเลิกการส่งแล้วเรียบร้อย');
      renderGrading(document.getElementById('app-view-container'));
    }
  );

  renderGrading(document.getElementById('app-view-container'));
}

/**
 * ล้างสถานะส่งงานของภาระงานปัจจุบันทุกคนในห้องนี้กลับเป็น "ค้างส่ง"
 */
function clearAssignmentSubmissions() {
  const currentAssignments = getFilteredAssignments();
  const currentAssignment = currentAssignments.find(a => a.id === appState.selectedAssignmentId) || currentAssignments[0];
  if (!currentAssignment) return;

  const room = appState.activeClassroom;
  const filteredStudents = getFilteredStudents();

  // ตรวจสอบจำนวนนักเรียนที่เคยส่งงานนี้
  const submittedStudents = filteredStudents.filter(st => {
    const sub = appState.submissions[`${currentAssignment.id}_${st.studentId}`];
    return sub && sub.status === 'ส่งแล้ว';
  });

  if (submittedStudents.length === 0) {
    showToast('ℹ️ ยังไม่มีนักเรียนที่ส่งงานนี้ในห้องนี้');
    return;
  }

  showModernConfirm({
    title: 'ยืนยันล้างสถานะส่งงาน?',
    subtitle: `คุณแน่ใจว่าต้องการล้างสถานะส่งงานของ "${currentAssignment.title}" ในห้อง ${room} หรือไม่?\n\n(นักเรียนที่ส่งแล้ว ${submittedStudents.length} คน จากทั้งหมด ${filteredStudents.length} คน จะถูกปรับกลับเป็น "ค้างส่ง")`,
    icon: '🔄',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    iconBorder: 'rgba(239, 68, 68, 0.25)',
    confirmText: '🔄 ยืนยันล้างส่ง',
    confirmClass: 'btn-danger',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
      const previousSnapshot = {};
      let count = 0;
      filteredStudents.forEach(st => {
        const key = `${currentAssignment.id}_${st.studentId}`;
        const sub = appState.submissions[key];
        if (sub && sub.status === 'ส่งแล้ว') {
          previousSnapshot[key] = { ...sub };
          appState.submissions[key] = {
            status: 'ค้างส่ง',
            score: null,
            updatedAt: new Date().toISOString()
          };
          count++;
        }
      });

      appState.isDirty = true;
      saveLocalState();
      scheduleAutoSync();

      showToastWithAction(
        `🔄 ล้างส่งงาน "${currentAssignment.title}" (${count} คน) แล้ว`,
        '↩️ เลิกทำ',
        () => {
          Object.keys(previousSnapshot).forEach(k => {
            appState.submissions[k] = previousSnapshot[k];
          });
          appState.isDirty = true;
          saveLocalState();
          scheduleAutoSync();
          showToast('↩️ ยกเลิกการล้างส่งเรียบร้อย');
          renderGrading(document.getElementById('app-view-container'));
        }
      );

      renderGrading(document.getElementById('app-view-container'));
    }
  });
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
        <p style="color: var(--text-secondary); margin: 0.75rem 0;">กรุณาเพิ่มงานในเมนู "ภาระงาน" ก่อนพิมพ์รายงาน</p>
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
                  <div style="font-weight: 700; font-size: 0.78rem; color: var(--text-main, #1E293B); line-height: 1.3; margin-bottom: 2px; max-width: 82px; margin-inline: auto; word-break: break-word;">${esc(a.title)}</div>
                  <div style="font-size: 0.66rem; color: #64748B; font-weight: normal;">(เต็ม ${a.fullScore})</div>
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
        <div class="report-legend" style="margin-top: 12px; font-size: 0.76rem; color: #475569; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; padding: 8px 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px;">
          ${pageAssignments.map((a, aIdx) => `
            <div style="display: flex; gap: 6px; align-items: baseline;">
              <span style="font-weight: 700; color: var(--primary); min-width: 22px;">งานที่ ${startIdx + aIdx + 1}:</span>
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(a.title)} <span style="color: #64748B;">(เต็ม ${a.fullScore} คะแนน)</span></span>
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
        <div class="report-header-info">
          <h2 class="report-header-title">
            <span>รายงานสรุปการส่งงาน</span>
            <span style="color: var(--primary); white-space: nowrap;">ห้อง ${esc(appState.activeClassroom)}</span>
          </h2>
          <div class="report-header-sub">
            <div>📚 วิชา ${esc(subjectObj.name)} <span style="color: var(--text-muted);">(${esc(subjectObj.code)})</span></div>
            <div style="color: var(--text-muted); font-size: 0.78rem;">📄 จัดรูปแบบ A4 แนวนอน • พร้อมพิมพ์ส่งฝ่ายวิชาการ (${currentAssignments.length} งาน)</div>
          </div>
        </div>

        <!-- เมนู Export & Print: แถวเดียว 4 ปุ่มบน Laptop / iPad / Tablet และ 2 แถวบนมือถือ -->
        <div class="report-actions-bar">
          <button class="btn btn-primary report-btn" onclick="triggerManualSync()" title="ส่งคะแนนรายงานการส่งงานทั้งหมดขึ้น Google Sheets (ชีท Submissions และ Gradebook)">
            💾 บันทึก Sheets
          </button>
          <button class="btn btn-secondary report-btn" onclick="exportToCSV()" title="ดาวน์โหลดเป็นไฟล์ CSV สำหรับ Excel">
            📥 ส่งออก Excel (CSV)
          </button>
          <button class="btn btn-secondary report-btn" onclick="exportReportToImage()" title="บันทึกตารางรายงานเป็นรูปภาพ PNG">
            🖼️ ส่งออกเป็นรูปภาพ
          </button>
          <button class="btn btn-secondary report-btn" onclick="handlePrintReport(false)" title="พิมพ์เฉพาะหน้างานที่กำลังเลือกดูอยู่">
            🖨️ พิมพ์หน้านี้
          </button>
          <button class="btn btn-primary report-btn" onclick="handlePrintReport(true)" title="พิมพ์รายงานทั้งหมด แยก A4 หน้าละ 10 งาน">
            🖨️ พิมพ์ทุกหน้า (${totalPages} แผ่น A4)
          </button>
        </div>
      </div>

      ${tabsHtml}
      ${sheetsHtml}
    </div>
  `;
}

async function exportReportToImage() {
  const activeSheet = document.querySelector('.printable-sheet:not([style*="display: none"])') || document.querySelector('.printable-sheet');
  if (!activeSheet) {
    showToast('⚠️ ไม่พบตารางรายงานสำหรับบันทึกภาพ');
    return;
  }

  showToast('⏳ กำลังแปลงรายงานเป็นรูปภาพ...');

  try {
    if (typeof html2canvas !== 'function') {
      throw new Error('ไม่พบไลบรารี html2canvas');
    }

    // เรนเดอร์เป็นภาพ Canvas ความละเอียดสูง 2x พื้นหลังขาวเสมอ
    const canvas = await html2canvas(activeSheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      logging: false,
      windowWidth: 1200
    });

    const imgData = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    const cleanRoom = (appState.activeClassroom || 'room').replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `รายงานการส่งงาน_${cleanRoom}_${dateStr}.png`;
    link.href = imgData;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('✓ ส่งออกรายงานเป็นรูปภาพสำเร็จ');
  } catch (err) {
    console.error('Export image error:', err);
    showToast('⚠️ ส่งออกรูปภาพไม่สำเร็จ: ' + err.message);
  }
}

function exportToCSV() {
  const currentAssignments = getFilteredAssignments();
  const currentStudents = getFilteredStudents();
  let csvContent = '\uFEFF';

  let headerRow = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน'];
  currentAssignments.forEach(a => {
    headerRow.push(`${a.title} (เต็ม ${a.fullScore})`);
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
  const currentRooms = getClassroomsForSubject(appState.activeSubject);
  const totalAllClasses = appState.students.length;
  const subjectStudentsCount = appState.students.filter(s => currentRooms.includes(s.classroom)).length;

  const classPillsHtml = currentRooms.map(c => {
    const count = appState.students.filter(s => s.classroom === c).length;
    return `
      <button class="class-pill ${c === appState.activeClassroom ? 'active' : ''}" onclick="changeActiveClassroom('${esc(c)}')">
        ${esc(c)} <span class="badge">${count} คน</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <!-- แถบสลับห้อง -->
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
      <div class="classroom-pill-strip" style="margin-bottom: 0; width: 100%;">
        <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); white-space: nowrap; margin-right: 0.25rem;">
          🏫 ห้องเรียนวิชานี้:
        </span>
        ${classPillsHtml}
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="align-items: center; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
        <div style="width: 100%;">
          <div class="roster-title-bar">
            <h2 class="roster-main-title">
              <span>👥</span>
              <span class="roster-title-text">รายชื่อ ห้อง ${esc(appState.activeClassroom)}</span>
            </h2>
            <span class="roster-count-badge">
              ${currentStudents.length} คน
            </span>
          </div>
          <p style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem;">
            วิชานี้: <strong>${currentRooms.length} ห้องเรียน</strong> (${subjectStudentsCount} คน) • ทั้งหมดในระบบ: ${appState.settings.classrooms.length} ห้อง (${totalAllClasses} คน)
          </p>
        </div>
        <div class="student-header-actions">
          <button class="btn btn-primary btn-sm" onclick="openInsertStudentModal('${esc(appState.activeClassroom)}')">
            ➕ แทรกนักเรียน
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openImportModal('${esc(appState.activeClassroom)}')">
            📥 นำเข้า Excel
          </button>
          <button class="btn btn-secondary btn-sm" onclick="reindexClassroomStudents('${esc(appState.activeClassroom)}')" title="จัดเรียงเลขที่ใหม่ 1, 2, 3... ตามลำดับ">
            🔢 เรียงเลขที่ใหม่
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
              <th style="padding: 0.65rem 0.5rem; width: 48px; text-align: center;">เลขที่</th>
              <th class="col-roster-id" style="padding: 0.65rem 0.75rem; width: 100px;">รหัสนักเรียน</th>
              <th style="padding: 0.65rem 0.75rem;">ชื่อ - นามสกุล</th>
              <th class="col-roster-actions" style="padding: 0.65rem 0.75rem; text-align: right; width: 180px; white-space: nowrap;">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${currentStudents.length > 0 ? currentStudents.map(st => `
              <tr class="roster-row" style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 0.55rem 0.5rem; text-align: center; font-weight: 600; color: var(--primary);">${st.no}</td>
                <td class="col-roster-id" style="padding: 0.55rem 0.75rem; color: var(--text-secondary); font-family: monospace; font-size: 0.88rem;">${esc(st.studentId)}</td>
                <td style="padding: 0.55rem 0.75rem; font-weight: 500; color: var(--text-main); white-space: nowrap;">
                  <span class="roster-name-text">${esc(st.fullName)}</span>
                  <span class="roster-id-sub mobile-only-inline">${esc(st.studentId)}</span>
                </td>
                <td class="col-roster-actions" style="padding: 0.55rem 0.75rem; text-align: right; white-space: nowrap;">
                  <div class="roster-actions">
                    <button class="btn btn-sm btn-secondary roster-act-btn" onclick="openInsertStudentModal('${esc(st.classroom)}', ${st.no + 1})" title="แทรกนักเรียนใหม่ต่อจากคนนี้เป็นเลขที่ ${st.no + 1}">
                      ➕ <span class="desktop-only-inline">แทรกต่อ</span>
                    </button>
                    <button class="btn btn-sm btn-secondary roster-act-btn" onclick="openEditStudentModal('${esc(st.studentId)}')" title="แก้ไขข้อมูลนักเรียน">
                      ✏️ <span class="desktop-only-inline">แก้ไข</span>
                    </button>
                    <button class="btn btn-sm btn-danger-soft roster-act-btn" onclick="deleteStudent('${esc(st.studentId)}')" title="ลบนักเรียนคนนี้">
                      🗑️
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

  showModernConfirm({
    title: 'ยืนยันลบนักเรียน?',
    subtitle: `คุณแน่ใจว่าต้องการลบ "เลขที่ ${st.no} ${st.fullName}" หรือไม่?\n\nข้อมูลการส่งงานของนักเรียนคนนี้จะถูกลบออกด้วย และเลขที่ของนักเรียนคนถัดไปจะถูกจัดเรียงชิดขึ้นมาแทนที่โดยอัตโนมัติ`,
    icon: '🗑️',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    iconBorder: 'rgba(239, 68, 68, 0.25)',
    confirmText: '🗑️ ลบนักเรียน',
    confirmClass: 'btn-danger',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
      const className = st.classroom;
      appState.students = appState.students.filter(s => s.studentId !== studentId);

      // ลบข้อมูล Submissions ของนักเรียนคนนี้เพื่อไม่ให้มีข้อมูลกำพร้า
      Object.keys(appState.submissions).forEach(k => {
        if (k.endsWith(`_${studentId}`)) delete appState.submissions[k];
      });

      // จัดเรียงเลขที่ของนักเรียนคนถัดไปให้ชิดขึ้นมาแทนที่โดยอัตโนมัติ
      const classStudents = appState.students.filter(s => s.classroom === className);
      classStudents.sort((a, b) => a.no - b.no);
      classStudents.forEach((s, idx) => { s.no = idx + 1; });

      appState.isDirty = true;
      saveLocalState();
      scheduleAutoSync('full');
      showToast(`ลบนักเรียน ${st.fullName} เรียบร้อยแล้ว`);
      renderStudents(document.getElementById('app-view-container'));
    }
  });
}

// ----------------- Modal: แทรกนักเรียนในห้อง & แต่ละเลขที่ -----------------
function openInsertStudentModal(defaultClass, defaultNo) {
  const availableRooms = getClassroomsForSubject(appState.activeSubject);
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
                ${availableRooms.map(c => `
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
    showToast('⚠️ กรุณากรอกชื่อ-นามสกุลนักเรียน');
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

  const availableRooms = [...getClassroomsForSubject(appState.activeSubject)];
  if (st.classroom && !availableRooms.includes(st.classroom)) {
    availableRooms.push(st.classroom);
  }

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
                ${availableRooms.map(c => `
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
  if (classStudents.length === 0) {
    showToast('⚠️ ไม่พบข้อมูลนักเรียนในห้องนี้');
    return;
  }

  showModernConfirm({
    title: 'จัดเรียงเลขที่ใหม่?',
    subtitle: `คุณต้องการจัดเรียงเลขที่นักเรียนห้อง ${className} ใหม่ทั้งหมด (${classStudents.length} คน) ให้เป็นเลขที่ 1 ถึง ${classStudents.length} ตามลำดับหรือไม่?`,
    icon: '🔢',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    iconBorder: 'rgba(59, 130, 246, 0.25)',
    confirmText: '🔢 จัดเรียงเลขที่',
    confirmClass: 'btn-primary',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
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
  });
}

// ----------------- Modern Modal Dialog System (ทดแทน prompt() และ alert() พื้นฐาน) -----------------
function showModernPrompt({ title, subtitle = '', defaultValue = '', placeholder = '', confirmText = 'ตกลง', cancelText = 'ยกเลิก', onConfirm }) {
  const modalId = 'modern-prompt-modal';
  closeModal(modalId);
  const html = `
    <div class="modal-overlay" id="${modalId}" style="z-index: 10500; display: flex; align-items: center; justify-content: center; padding: 1rem;">
      <div class="modal-content prompt-modal-card" style="max-width: 420px; width: 100%; border-radius: var(--radius-lg); padding: 1.35rem 1.45rem; text-align: left; box-shadow: var(--shadow-lg);">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.85rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary-subtle); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0; border: 1px solid var(--primary-border);">
              ✏️
            </div>
            <div>
              <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: var(--text-main); line-height: 1.3;">${esc(title)}</h3>
              ${subtitle ? `<p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0.15rem 0 0 0;">${esc(subtitle)}</p>` : ''}
            </div>
          </div>
          <button type="button" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer; color: var(--text-muted); padding: 0.2rem;" onclick="closeModal('${modalId}')">✕</button>
        </div>

        <div style="margin: 1.1rem 0 1.25rem 0;">
          <input type="text" id="modern-prompt-input" class="form-input" value="${esc(defaultValue)}" placeholder="${esc(placeholder)}" style="font-size: 0.95rem; padding: 0.65rem 0.85rem; width: 100%; box-sizing: border-box;" />
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')" style="min-width: 80px;">${esc(cancelText)}</button>
          <button type="button" class="btn btn-primary" id="modern-prompt-confirm-btn" style="min-width: 90px;">${esc(confirmText)}</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  const input = document.getElementById('modern-prompt-input');
  if (input) {
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('modern-prompt-confirm-btn')?.click();
      } else if (e.key === 'Escape') {
        closeModal(modalId);
      }
    });
  }
  document.getElementById('modern-prompt-confirm-btn')?.addEventListener('click', () => {
    const val = input ? input.value : '';
    closeModal(modalId);
    if (typeof onConfirm === 'function') onConfirm(val);
  });
}

function showModernConfirm({
  title = 'ยืนยันการดำเนินการ',
  subtitle = '',
  icon = '⚠️',
  iconBg = 'rgba(239, 68, 68, 0.12)',
  iconBorder = 'rgba(239, 68, 68, 0.25)',
  confirmText = 'ยืนยัน',
  confirmClass = 'btn-danger',
  cancelText = 'ยกเลิก',
  onConfirm = null,
  onCancel = null
}) {
  const modalId = 'modern-confirm-modal';
  closeModal(modalId);
  const html = `
    <div class="modal-overlay" id="${modalId}" style="z-index: 10600; display: flex; align-items: center; justify-content: center; padding: 1rem;">
      <div class="modal-content prompt-modal-card" style="max-width: 440px; width: 100%; border-radius: var(--radius-lg); padding: 1.35rem 1.45rem; text-align: left; box-shadow: var(--shadow-lg);">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.85rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 42px; height: 42px; border-radius: 50%; background: ${iconBg}; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; border: 1px solid ${iconBorder};">
              ${icon}
            </div>
            <div>
              <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: var(--text-main); line-height: 1.3;">${esc(title)}</h3>
            </div>
          </div>
          <button type="button" style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer; color: var(--text-muted); padding: 0.2rem; line-height: 1;" onclick="closeModal('${modalId}')">✕</button>
        </div>

        ${subtitle ? `
          <div style="margin: 0.85rem 0 1.25rem 0; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; background: var(--bg-subtle, #f8fafc); padding: 0.85rem 1rem; border-radius: var(--radius-md); border-left: 3px solid ${confirmClass.includes('danger') ? 'var(--danger, #ef4444)' : 'var(--primary, #3b82f6)'};">
            ${esc(subtitle).replace(/\n/g, '<br>')}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
          <button type="button" class="btn btn-secondary" id="modern-confirm-cancel-btn" style="min-width: 80px;">${esc(cancelText)}</button>
          <button type="button" class="btn ${confirmClass}" id="modern-confirm-ok-btn" style="min-width: 95px; font-weight: 600;">${esc(confirmText)}</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  const okBtn = document.getElementById('modern-confirm-ok-btn');
  const cancelBtn = document.getElementById('modern-confirm-cancel-btn');

  const handleOk = () => {
    closeModal(modalId);
    if (typeof onConfirm === 'function') onConfirm();
  };
  const handleCancel = () => {
    closeModal(modalId);
    if (typeof onCancel === 'function') onCancel();
  };

  okBtn?.addEventListener('click', handleOk);
  cancelBtn?.addEventListener('click', handleCancel);

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', handleKey);
      handleCancel();
    }
  };
  window.addEventListener('keydown', handleKey);

  setTimeout(() => okBtn?.focus(), 50);
}

function showModernAlert({
  title = 'แจ้งเตือนระบบ',
  subtitle = '',
  message = '',
  icon = '🔔',
  iconBg = 'rgba(59, 130, 246, 0.12)',
  iconBorder = 'rgba(59, 130, 246, 0.25)',
  buttonText = 'เข้าใจแล้ว',
  buttonClass = 'btn-primary',
  onClose = null
}) {
  const modalId = 'modern-alert-modal';
  closeModal(modalId);
  const text = message || subtitle || '';
  const html = `
    <div class="modal-overlay" id="${modalId}" style="z-index: 10700; display: flex; align-items: center; justify-content: center; padding: 1rem;">
      <div class="modal-content prompt-modal-card" style="max-width: 430px; width: 100%; border-radius: var(--radius-lg); padding: 1.35rem 1.45rem; text-align: left; box-shadow: var(--shadow-lg);">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.85rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 42px; height: 42px; border-radius: 50%; background: ${iconBg}; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; border: 1px solid ${iconBorder};">
              ${icon}
            </div>
            <div>
              <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: var(--text-main); line-height: 1.3;">${esc(title)}</h3>
            </div>
          </div>
          <button type="button" style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer; color: var(--text-muted); padding: 0.2rem; line-height: 1;" onclick="closeModal('${modalId}')">✕</button>
        </div>

        ${text ? `
          <div style="margin: 0.85rem 0 1.25rem 0; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; background: var(--bg-subtle, #f8fafc); padding: 0.85rem 1rem; border-radius: var(--radius-md); border-left: 3px solid ${buttonClass.includes('danger') ? 'var(--danger, #ef4444)' : 'var(--primary, #3b82f6)'};">
            ${esc(text).replace(/\n/g, '<br>')}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
          <button type="button" class="btn ${buttonClass}" id="modern-alert-ok-btn" style="min-width: 95px; font-weight: 600;">${esc(buttonText)}</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  const okBtn = document.getElementById('modern-alert-ok-btn');
  const handleClose = () => {
    closeModal(modalId);
    if (typeof onClose === 'function') onClose();
  };
  okBtn?.addEventListener('click', handleClose);

  const handleKey = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      window.removeEventListener('keydown', handleKey);
      handleClose();
    }
  };
  window.addEventListener('keydown', handleKey);

  setTimeout(() => okBtn?.focus(), 50);
}

// Global override: ป้องกันกล่องข้อความดั้งเดิมของเบราว์เซอร์ไม่ให้แสดงผลในทุกกรณี
window.alert = function(msg) {
  showModernAlert({
    title: 'แจ้งเตือนระบบ',
    message: String(msg || ''),
    icon: '🔔'
  });
};

// ----------------- Modal: จัดการห้องเรียน (เพิ่ม / ลบ / เปลี่ยนชื่อ) -----------------
function openAddClassroomModal() {
  showModernPrompt({
    title: 'เพิ่มห้องเรียนใหม่',
    subtitle: 'ระบุชื่อห้องเรียน เช่น ม.4/12 หรือ ม.6/1',
    defaultValue: '',
    placeholder: 'เช่น ม.4/12',
    confirmText: '+ เพิ่มห้องเรียน',
    onConfirm: (name) => {
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      if (appState.settings.classrooms.includes(trimmed)) {
        showToast('⚠️ มีห้องเรียนนี้อยู่ในระบบแล้ว');
        return;
      }
      appState.settings.classrooms.push(trimmed);
      const curSub = (appState.settings.subjects || []).find(s => s.code === appState.activeSubject);
      if (curSub && Array.isArray(curSub.classrooms)) {
        if (!curSub.classrooms.includes(trimmed)) {
          curSub.classrooms.push(trimmed);
        }
      }
      appState.activeClassroom = trimmed;
      appState.isDirty = true;
      saveLocalState();
      scheduleAutoSync('full');
      renderHeaderControls();
      showToast(`เพิ่มห้อง ${trimmed} เรียบร้อยแล้ว`);
      renderApp();
    }
  });
}

// ----------------- Natural Classroom Sorting (เรียง ม.1 -> ม.6 และห้อง 1 -> 13 เป็นธรรมชาติ) -----------------
function compareClassroomNames(a, b) {
  const rx = /^([^\d]+)(\d+)(?:[\/\-\s](\d+))?$/;
  const pA = String(a).match(rx);
  const pB = String(b).match(rx);
  if (pA && pB) {
    const prefixComp = pA[1].localeCompare(pB[1], 'th');
    if (prefixComp !== 0) return prefixComp;
    const lvlA = parseInt(pA[2], 10);
    const lvlB = parseInt(pB[2], 10);
    if (lvlA !== lvlB) return lvlA - lvlB;
    const roomA = pA[3] ? parseInt(pA[3], 10) : 0;
    const roomB = pB[3] ? parseInt(pB[3], 10) : 0;
    return roomA - roomB;
  }
  return String(a).localeCompare(String(b), 'th', { numeric: true });
}

function sortClassroomNames(arr) {
  return [...arr].sort(compareClassroomNames);
}

function openClassroomManagerModal() {
  const sortedRooms = sortClassroomNames(appState.settings.classrooms || []);
  const emptyRooms = sortedRooms.filter(c => !appState.students.some(s => s.classroom === c));
  
  // รวบรวมระดับชั้นที่มีในระบบ
  const levels = [...new Set(sortedRooms.map(r => {
    const m = String(r).match(/^(?:ม\.|ป\.|)([^\/\-]+)/);
    return m ? m[0] : 'อื่นๆ';
  }))].filter(Boolean);

  const modalHtml = `
    <div class="modal-overlay" id="classroom-manager-modal">
      <div class="modal-content" style="max-width: 580px; width: 100%;">
        <div class="modal-header">
          <div>
            <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 0.4rem;">
              <span>⚙️</span> จัดการห้องเรียนทั้งหมด (${sortedRooms.length} ห้อง)
            </h3>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0.2rem 0 0 0;">
              สร้างห้องเรียนได้ทุกระดับชั้น (ม.1 - ม.6) ไม่จำกัดจำนวนห้องตามความเป็นจริงในแต่ละปี
            </p>
          </div>
          <button style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer; color: var(--text-muted);" onclick="closeModal('classroom-manager-modal')">✕</button>
        </div>

        <div class="modal-body" style="padding: 1.15rem 1.25rem;">
          <!-- ⚡ ส่วนที่ 1: สร้างห้องเรียนแบบชุดตามระดับชั้น -->
          <div style="background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 0.9rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
              <span style="font-size: 0.86rem; font-weight: 700; color: var(--primary);">⚡ สร้างห้องเรียนแบบชุดตามระดับชั้น</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">เลือกสร้าง ม.1 ถึง ม.6 อัตโนมัติ</span>
            </div>
            <div style="display: flex; gap: 0.45rem; flex-wrap: wrap; align-items: center;">
              <select id="batch-level-prefix" class="form-input" style="width: 95px; padding: 0.42rem 0.5rem; font-size: 0.85rem; font-weight: 600;">
                <option value="ม.1">ม.1</option>
                <option value="ม.2">ม.2</option>
                <option value="ม.3">ม.3</option>
                <option value="ม.4" selected>ม.4</option>
                <option value="ม.5">ม.5</option>
                <option value="ม.6">ม.6</option>
                <option value="ป.1">ป.1</option>
                <option value="ป.2">ป.2</option>
                <option value="ป.3">ป.3</option>
                <option value="ป.4">ป.4</option>
                <option value="ป.5">ป.5</option>
                <option value="ป.6">ป.6</option>
              </select>
              <span style="font-size: 0.82rem; color: var(--text-secondary);">จำนวน</span>
              <input type="number" id="batch-level-count" class="form-input" value="12" min="1" max="50" style="width: 75px; padding: 0.42rem 0.5rem; font-size: 0.85rem; text-align: center;" />
              <span style="font-size: 0.82rem; color: var(--text-secondary);">ห้อง</span>
              <button type="button" class="btn btn-primary btn-sm" onclick="handleGenerateBatchRooms()" style="padding: 0.42rem 0.85rem; font-size: 0.82rem; white-space: nowrap;">
                + สร้างห้องชุดทันที
              </button>
            </div>
          </div>

          <!-- ➕ ส่วนที่ 2: เพิ่มห้องเดี่ยว หรือชื่อพิเศษ (เช่น ม.4/EP) -->
          <div style="display: flex; gap: 0.45rem; margin-bottom: 0.9rem;">
            <input type="text" id="new-room-input" class="form-input" placeholder="หรือพิมพ์ชื่อห้องเดี่ยว เช่น ม.2/13, ม.4/EP" style="padding: 0.45rem 0.75rem; font-size: 0.85rem;" />
            <button class="btn btn-secondary btn-sm" onclick="handleAddRoomFromManager()" style="white-space: nowrap; padding: 0.45rem 0.85rem;">+ เพิ่มห้องเดี่ยว</button>
          </div>

          <!-- 📋 ส่วนที่ 3: ตารางรายการห้องเรียน -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.4rem;">
            <div style="font-size: 0.82rem; color: var(--text-secondary); font-weight: 600;">
              รายการห้องทั้งหมด (${sortedRooms.length} ห้อง)
            </div>
            ${emptyRooms.length > 0 ? `
              <button type="button" class="btn-text-action" style="color: #DC2626; font-size: 0.78rem;" onclick="handleCleanEmptyRooms()">
                🧹 ล้างห้องว่างที่ไม่มีนักเรียน (${emptyRooms.length} ห้อง)
              </button>
            ` : ''}
          </div>

          <div style="max-height: 340px; overflow-y: auto; border: 1px solid var(--border-light); border-radius: var(--radius-md);">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem;">
              <thead>
                <tr style="background: var(--bg-subtle); border-bottom: 2px solid var(--border-light); text-align: left;">
                  <th style="padding: 0.5rem 0.65rem; font-size: 0.82rem;">ห้องเรียน</th>
                  <th style="padding: 0.5rem 0.35rem; text-align: center; width: 85px; white-space: nowrap; font-size: 0.82rem;">จำนวนนักเรียน</th>
                  <th style="padding: 0.5rem 0.65rem; text-align: right; width: 145px; white-space: nowrap; font-size: 0.82rem;">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${sortedRooms.map(c => {
                  const count = appState.students.filter(s => s.classroom === c).length;
                  return `
                    <tr style="border-bottom: 1px solid var(--border-light);">
                      <td style="padding: 0.55rem 0.65rem; font-weight: 600; line-height: 1.35;">
                        <span style="display: inline-block; min-width: 65px;">${esc(c)}</span>
                        ${count === 0 ? '<span style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal; margin-left: 0.4rem;">(ว่าง)</span>' : ''}
                      </td>
                      <td style="padding: 0.55rem 0.35rem; text-align: center; color: ${count > 0 ? 'var(--text-main)' : 'var(--text-muted)'}; white-space: nowrap; font-size: 0.82rem;">
                        ${count > 0 ? `<b>${count}</b> คน` : '-'}
                      </td>
                      <td style="padding: 0.55rem 0.65rem; text-align: right; white-space: nowrap;">
                        <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end; align-items: center;">
                          <button class="btn btn-sm btn-secondary" onclick="renameClassroom('${esc(c)}')" style="padding: 0.28rem 0.5rem; font-size: 0.76rem; white-space: nowrap;">✏️ เปลี่ยนชื่อ</button>
                          <button class="btn btn-sm btn-secondary" style="color: #DC2626; padding: 0.28rem 0.5rem; font-size: 0.76rem; white-space: nowrap;" onclick="deleteClassroom('${esc(c)}')">🗑️ ลบห้อง</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer" style="padding: 0.85rem 1.25rem;">
          <button class="btn btn-primary" onclick="closeModal('classroom-manager-modal')">ปิดหน้าต่าง</button>
        </div>
      </div>
    </div>
  `;

  closeModal('classroom-manager-modal');
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function handleGenerateBatchRooms() {
  const prefix = document.getElementById('batch-level-prefix')?.value || 'ม.4';
  const countInput = document.getElementById('batch-level-count');
  const count = parseInt(countInput?.value || '10', 10);

  if (isNaN(count) || count < 1 || count > 50) {
    showToast('⚠️ กรุณาระบุจำนวนห้องระหว่าง 1 ถึง 50 ห้อง');
    return;
  }

  if (!appState.settings.classrooms) appState.settings.classrooms = [];

  const created = [];
  for (let i = 1; i <= count; i++) {
    const roomName = `${prefix}/${i}`;
    if (!appState.settings.classrooms.includes(roomName)) {
      appState.settings.classrooms.push(roomName);
      created.push(roomName);
    }
  }

  // เรียงลำดับห้องเรียนตามระดับชั้นและเลขห้องตามลำดับธรรมชาติ
  appState.settings.classrooms = sortClassroomNames(appState.settings.classrooms);

  appState.isDirty = true;
  saveLocalState();
  renderHeaderControls();
  openClassroomManagerModal(); // refresh
  renderApp();

  if (created.length > 0) {
    showToast(`✓ สร้างห้อง ${prefix}/1 ถึง ${prefix}/${count} (${created.length} ห้องใหม่) เรียบร้อย`);
  } else {
    showToast(`ℹ️ มีห้อง ${prefix}/1 ถึง ${prefix}/${count} ครบทั้งหมดอยู่แล้ว`);
  }

  pushFullStateToBackend().catch(err => {
    console.error('Error syncing batch rooms:', err);
  });
}

function handleCleanEmptyRooms() {
  const emptyRooms = appState.settings.classrooms.filter(c => {
    const hasStudents = appState.students.some(s => s.classroom === c);
    return !hasStudents;
  });

  if (emptyRooms.length === 0) {
    showToast('ℹ️ ทุกห้องมีข้อมูลนักเรียนอยู่แล้ว ไม่มีห้องว่าง');
    return;
  }

  if (appState.settings.classrooms.length - emptyRooms.length < 1) {
    showToast('⚠️ ระบบต้องมีห้องเรียนอย่างน้อย 1 ห้อง');
    return;
  }

  showModernConfirm({
    title: 'ล้างห้องว่างที่ไม่มีนักเรียน?',
    subtitle: `พบห้องเรียนที่ไม่มีนักเรียนอยู่เลยจำนวน ${emptyRooms.length} ห้อง ได้แก่:\n${emptyRooms.slice(0, 10).join(', ')}${emptyRooms.length > 10 ? ' ...' : ''}\n\nคุณต้องการลบห้องว่างเหล่านี้ออกจากการตั้งค่าเพื่อจัดระเบียบใช่หรือไม่?`,
    icon: '🧹',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    iconBorder: 'rgba(239, 68, 68, 0.25)',
    confirmText: '🧹 ล้างห้องว่าง',
    confirmClass: 'btn-danger',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
      appState.settings.classrooms = appState.settings.classrooms.filter(c => !emptyRooms.includes(c));
      (appState.settings.subjects || []).forEach(sub => {
        if (Array.isArray(sub.classrooms)) {
          sub.classrooms = sub.classrooms.filter(c => !emptyRooms.includes(c));
        }
      });
      if (emptyRooms.includes(appState.activeClassroom)) {
        appState.activeClassroom = appState.settings.classrooms[0] || 'ม.4/1';
      }
      appState.isDirty = true;
      saveLocalState();
      renderHeaderControls();
      openClassroomManagerModal();
      renderApp();
      showToast(`ล้างห้องว่าง ${emptyRooms.length} ห้องเรียบร้อยแล้ว`);
      pushFullStateToBackend().catch(() => {});
    }
  });
}

function handleAddRoomFromManager() {
  const input = document.getElementById('new-room-input');
  if (!input || !input.value.trim()) return;

  const name = input.value.trim();
  if (appState.settings.classrooms.includes(name)) {
    showToast('⚠️ มีห้องนี้อยู่ในระบบแล้ว');
    return;
  }

  appState.settings.classrooms.push(name);
  appState.settings.classrooms = sortClassroomNames(appState.settings.classrooms);

  const curSub = (appState.settings.subjects || []).find(s => s.code === appState.activeSubject);
  if (curSub && Array.isArray(curSub.classrooms)) {
    if (!curSub.classrooms.includes(name)) {
      curSub.classrooms.push(name);
    }
  }

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
  showModernPrompt({
    title: 'เปลี่ยนชื่อห้องเรียน',
    subtitle: `เดิมคือห้อง "${oldName}"`,
    defaultValue: oldName,
    placeholder: 'ระบุชื่อห้องใหม่',
    confirmText: 'บันทึกการเปลี่ยนชื่อ',
    onConfirm: (newName) => {
      if (!newName || !newName.trim() || newName.trim() === oldName) return;
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
      // อัปเดตห้องใน subjects ด้วย
      (appState.settings.subjects || []).forEach(sub => {
        if (Array.isArray(sub.classrooms)) {
          sub.classrooms = sub.classrooms.map(c => c === oldName ? trimmed : c);
        }
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
  });
}

function deleteClassroom(className) {
  const count = appState.students.filter(s => s.classroom === className).length;
  if (appState.settings.classrooms.length <= 1) {
    showToast('⚠️ ระบบต้องมีห้องเรียนอย่างน้อย 1 ห้อง');
    return;
  }

  let subtitleText = `คุณแน่ใจว่าต้องการลบห้อง "${className}" ออกจากระบบหรือไม่?`;
  if (count > 0) {
    subtitleText += `\n\n⚠️ คำเตือน: ห้องนี้มีนักเรียนอยู่ ${count} คน การลบห้องจะทำให้นักเรียนและคะแนนทั้งหมดของห้องนี้ถูกลบออกจากระบบด้วย!`;
  }

  showModernConfirm({
    title: 'ยืนยันลบห้องเรียน?',
    subtitle: subtitleText,
    icon: '🗑️',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    iconBorder: 'rgba(239, 68, 68, 0.25)',
    confirmText: '🗑️ ยืนยันลบห้อง',
    confirmClass: 'btn-danger',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
      appState.settings.classrooms = appState.settings.classrooms.filter(c => c !== className);
      appState.students = appState.students.filter(s => s.classroom !== className);
      appState.assignments = appState.assignments.filter(a => a.classroom !== className);
      (appState.settings.subjects || []).forEach(sub => {
        if (Array.isArray(sub.classrooms)) {
          sub.classrooms = sub.classrooms.filter(c => c !== className);
        }
      });

      if (appState.activeClassroom === className) {
        appState.activeClassroom = appState.settings.classrooms[0] || 'ม.4/1';
      }

      appState.isDirty = true;
      saveLocalState();
      renderHeaderControls();
      openClassroomManagerModal();
      showToast(`ลบห้อง ${className} เรียบร้อยแล้ว`);
      renderApp();
      pushFullStateToBackend().catch(err => {
        console.error('Error syncing after classroom deletion:', err);
      });
    }
  });
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.remove();
}


// ----------------- Smart Import Modal (ระบบนำเข้ารายชื่อ) -----------------
function openImportModal(defaultClass) {
  const availableRooms = getClassroomsForSubject(appState.activeSubject);
  const targetClass = defaultClass || appState.activeClassroom;
  importPreviewData = [];

  const modalHtml = `
    <div class="modal-overlay" id="import-modal-overlay">
      <div class="modal-content" style="max-width: 560px;">
        <div class="modal-header">
          <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 0.45rem;">
            <span>📥</span> นำเข้ารายชื่อนักเรียน (Excel / SGS)
          </h3>
          <button style="border: none; background: transparent; font-size: 1.25rem; cursor: pointer; color: var(--text-muted);" onclick="closeImportModal()">✕</button>
        </div>

        <div class="modal-body">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.75rem; margin-bottom: 0.875rem;">
            <div>
              <label class="form-label" style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.3rem;">
                🏫 ห้องเรียนปลายทาง:
              </label>
              <select id="import-target-class" class="form-input" onchange="updateImportPreview()">
                ${availableRooms.map(c => `
                  <option value="${esc(c)}" ${c === targetClass ? 'selected' : ''}>${esc(c)}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="form-label" style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.3rem;">
                ⚙️ รูปแบบการบันทึก:
              </label>
              <select id="import-mode" class="form-input">
                <option value="replace_classroom">เขียนทับเฉพาะห้องนี้ (แนะนำ)</option>
                <option value="append">เพิ่มต่อท้ายรายชื่อเดิม</option>
                <option value="replace_all">เขียนทับนักเรียนทุกห้อง</option>
              </select>
            </div>
          </div>

          <label class="form-label" style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; line-height: 1.35;">
            📋 คัดลอก (Copy) ข้อมูลจาก Excel โรงเรียนแล้วกดวาง (Ctrl+V) ที่นี่:
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
    const res = await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'importStudents',
        token: appState.settings.apiToken || '',
        mode: mode,
        classroom: targetClass,
        students: studentsList
      })
    });
    const resData = await res.json();
    if (resData.success) {
      appState.isDirty = false;
      saveLocalState();
      updateSyncIndicator('online');
    } else {
      updateSyncIndicator('offline');
      console.error('Import students error:', resData.error);
    }
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
      <div class="card-header" style="flex-wrap: wrap; gap: 0.5rem; justify-content: space-between; align-items: center;">
        <div>
          <h2 class="card-title">รายการภาระงาน: วิชา ${esc(subjectObj.name)} (${esc(subjectObj.code)})</h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">ห้อง ${esc(appState.activeClassroom)} (มี ${currentAssignments.length} งาน)</p>
        </div>
      </div>

      <!-- กล่องสร้างภาระงานใหม่ Responsive (จัดเป็นระเบียบทั้งมือถือและคอม) -->
      <div class="new-assign-card">
        <h4 class="new-assign-card-title">
          <span class="new-assign-title-main">+ สร้างภาระงานใหม่สำหรับ</span>
          <span class="new-assign-title-room">ห้อง ${esc(appState.activeClassroom)}</span>
        </h4>
        <div class="new-assign-form-grid">
          <div class="form-group-title">
            <label class="form-label">ชื่องาน / รายละเอียด</label>
            <input type="text" id="new-assign-title" class="form-input" placeholder="เช่น 06 แบบฝึกหัดการเมืองการปกครอง" />
          </div>
          <div class="form-group-score">
            <label class="form-label">คะแนนเต็ม</label>
            <input type="number" id="new-assign-score" class="form-input" value="5" min="1" max="100" />
          </div>
          <div class="form-group-date">
            <label class="form-label">กำหนดส่ง</label>
            <input type="date" id="new-assign-date" class="form-input" />
          </div>
          <div class="form-group-btn">
            <button class="btn btn-primary btn-block-mobile" onclick="handleAddAssignment()">
              <span>+ เพิ่มภาระงาน</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Desktop & Tablet Table View -->
      <div class="assign-table-wrapper">
        <table class="assign-table">
          <thead>
            <tr>
              <th style="width: 70px;">รหัส</th>
              <th>ชื่อภาระงาน</th>
              <th style="width: 110px;">คะแนนเต็ม</th>
              <th style="width: 130px;">กำหนดส่ง</th>
              <th style="width: 100px;">วิชา</th>
              <th style="width: 140px; text-align: right;">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            ${currentAssignments.map(a => `
              <tr>
                <td class="assign-id-cell">${esc(a.id)}</td>
                <td class="assign-title-cell">${esc(a.title)}</td>
                <td class="assign-score-cell">${a.fullScore} คะแนน</td>
                <td class="assign-date-cell">${esc(a.dueDate || '-')}</td>
                <td class="assign-subj-cell">${esc(a.subject || appState.activeSubject)}</td>
                <td style="text-align: right; white-space: nowrap;">
                  <button class="btn btn-sm btn-secondary" style="margin-right: 4px;" onclick="openEditAssignmentModal('${esc(a.id)}')">✏️ แก้ไข</button>
                  <button class="btn btn-sm btn-danger-soft" onclick="deleteAssignment('${esc(a.id)}')">🗑️ ลบ</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Mobile Clean Cards View (มุมมองมือถือ ไม่บีบอัดคอลัมน์) -->
      <div class="assign-mobile-cards">
        ${currentAssignments.length === 0 ? `
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">ยังไม่มีภาระงานในห้องนี้</div>
        ` : currentAssignments.map(a => `
          <div class="assign-m-card">
            <div class="assign-m-card-top">
              <span class="assign-m-badge">${esc(a.id)}</span>
              <div class="assign-m-title">${esc(a.title)}</div>
              <span class="assign-m-score">${a.fullScore} คะแนน</span>
            </div>
            <div class="assign-m-card-bottom">
              <span class="assign-m-meta">📅 กำหนดส่ง: <b>${esc(a.dueDate || '-')}</b></span>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-sm btn-secondary" onclick="openEditAssignmentModal('${esc(a.id)}')">
                  ✏️ แก้ไข
                </button>
                <button class="btn btn-sm btn-danger-soft assign-m-del-btn" onclick="deleteAssignment('${esc(a.id)}')">
                  🗑️ ลบ
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function handleAddAssignment() {
  const title = document.getElementById('new-assign-title').value.trim();
  const fullScore = parseInt(document.getElementById('new-assign-score').value) || 5;
  const dueDate = document.getElementById('new-assign-date').value;

  if (!title) {
    showToast('⚠️ กรุณากรอกชื่องาน');
    return;
  }

  let maxNum = 0;
  (appState.assignments || []).forEach(a => {
    const match = String(a.id || '').match(/^A(\d+)$/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  const nextNum = maxNum + 1;
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
  const assign = appState.assignments.find(a => a.id === assignId);
  const title = assign ? assign.title : 'งานนี้';

  showModernConfirm({
    title: 'ยืนยันลบภาระงาน?',
    subtitle: `คุณแน่ใจว่าต้องการลบงาน "${title}" หรือไม่?\n\nข้อมูลการส่งงานและคะแนนทั้งหมดของงานนี้จะถูกลบออกด้วย`,
    icon: '🗑️',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    iconBorder: 'rgba(239, 68, 68, 0.25)',
    confirmText: '🗑️ ลบงาน',
    confirmClass: 'btn-danger',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
      appState.assignments = appState.assignments.filter(a => a.id !== assignId);

      // ลบข้อมูล Submissions ของงานนี้ออกด้วย
      Object.keys(appState.submissions).forEach(k => {
        if (k.startsWith(`${assignId}_`)) delete appState.submissions[k];
      });

      appState.isDirty = true;
      saveLocalState();
      scheduleAutoSync('full');
      showToast(`ลบงาน "${title}" สำเร็จ`);
      renderAssignments(document.getElementById('app-view-container'));
    }
  });
}

function openEditAssignmentModal(assignmentId) {
  const assign = (appState.assignments || []).find(a => a.id === assignmentId);
  if (!assign) return;

  const modalId = 'edit-assignment-modal';
  closeModal(modalId);

  const modalHtml = `
    <div class="modal-overlay" id="${modalId}" style="z-index: 10500; display: flex; align-items: center; justify-content: center; padding: 1rem;">
      <div class="modal-content" style="max-width: 460px; width: 100%; border-radius: var(--radius-lg); padding: 1.35rem 1.45rem; text-align: left; box-shadow: var(--shadow-lg);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.95rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--primary-subtle); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; border: 1px solid var(--primary-border);">
              ✏️
            </div>
            <div>
              <h3 style="font-size: 1.08rem; font-weight: 700; margin: 0; color: var(--text-main);">แก้ไขภาระงาน (${esc(assign.id)})</h3>
              <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 2px 0 0 0;">ห้อง ${esc(assign.classroom || appState.activeClassroom)}</p>
            </div>
          </div>
          <button type="button" style="border: none; background: transparent; font-size: 1.3rem; cursor: pointer; color: var(--text-muted);" onclick="closeModal('${modalId}')">✕</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div>
            <label class="form-label" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px;">ชื่องาน / รายละเอียด</label>
            <input type="text" id="edit-assign-title" class="form-input" value="${esc(assign.title)}" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
            <div>
              <label class="form-label" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px;">คะแนนเต็ม</label>
              <input type="number" id="edit-assign-score" class="form-input" value="${assign.fullScore || 5}" min="1" max="100" />
            </div>
            <div>
              <label class="form-label" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px;">กำหนดส่ง</label>
              <input type="date" id="edit-assign-date" class="form-input" value="${esc(assign.dueDate || '')}" />
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; border-top: 1px solid var(--border-light); padding-top: 0.75rem;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">ยกเลิก</button>
          <button type="button" class="btn btn-primary" onclick="handleSaveEditAssignment('${esc(assign.id)}')">💾 บันทึกการแก้ไข</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function handleSaveEditAssignment(assignmentId) {
  const assign = (appState.assignments || []).find(a => a.id === assignmentId);
  if (!assign) return;

  const newTitle = document.getElementById('edit-assign-title')?.value.trim();
  const newScore = parseInt(document.getElementById('edit-assign-score')?.value, 10) || 5;
  const newDate = document.getElementById('edit-assign-date')?.value || '';

  if (!newTitle) {
    showToast('⚠️ กรุณาระบุชื่องาน');
    return;
  }

  assign.title = newTitle;
  assign.fullScore = newScore;
  assign.dueDate = newDate;

  appState.isDirty = true;
  saveLocalState();
  closeModal('edit-assignment-modal');
  renderAssignments(document.getElementById('app-view-container'));
  showToast(`✓ แก้ไขภาระงาน ${assignmentId} เรียบร้อยแล้ว`);

  pushFullStateToBackend().catch(err => {
    console.error('Error syncing after assignment edit:', err);
  });
}

window.openEditAssignmentModal = openEditAssignmentModal;
window.handleSaveEditAssignment = handleSaveEditAssignment;

// ----------------- View: Settings -----------------
function renderSettings(container) {
  const currentTheme = localStorage.getItem('smartgrade_theme') || 'blue';

  container.innerHTML = `
    <div class="card settings-card-container" style="max-width: 720px; margin: 0 auto;">
      <h2 class="card-title" style="margin-bottom: 1.25rem;">การตั้งค่าโรงเรียน & 5 รายวิชา</h2>

      <!-- ธีมและสีสันของระบบ (Theme) -->
      <div class="form-group" style="margin-bottom: 1.25rem; background: var(--bg-subtle); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 0.85rem;">
        <label class="form-label" style="font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">🎨 ธีมและสีสันของระบบ (Theme)</label>
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.65rem;">
          เลือกโทนสีที่สบายตา (โลโก้และสีทั้งระบบจะเปลี่ยนพร้อมกันทันที)
        </p>
        <div class="cfg-theme-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.5rem;">
          <button type="button" class="btn ${currentTheme === 'blue' ? 'btn-primary' : 'btn-secondary'}" onclick="setAppTheme('blue')" style="font-size: 0.82rem;">
            🔷 ฟ้าคราม (Classic)
          </button>
          <button type="button" class="btn ${currentTheme === 'emerald' ? 'btn-primary' : 'btn-secondary'}" onclick="setAppTheme('emerald')" style="font-size: 0.82rem;">
            🌿 เขียวมินต์ (Fresh)
          </button>
          <button type="button" class="btn ${currentTheme === 'purple' ? 'btn-primary' : 'btn-secondary'}" onclick="setAppTheme('purple')" style="font-size: 0.82rem;">
            🌸 พิงก์วอร์เทกซ์ (Pink Vortex)
          </button>
          <button type="button" class="btn ${currentTheme === 'dark' ? 'btn-primary' : 'btn-secondary'}" onclick="setAppTheme('dark')" style="font-size: 0.82rem;">
            🌙 โหมดมืด (Dark)
          </button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">ชื่อโรงเรียน</label>
        <input type="text" id="cfg-school" class="form-input" value="${esc(appState.settings.schoolName)}" />
      </div>

      <div class="cfg-school-info-grid" style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">ภาคเรียนที่</label>
          <input type="text" id="cfg-term" class="form-input" value="${esc(appState.settings.term)}" />
        </div>
        <div class="form-group">
          <label class="form-label">ปีการศึกษา</label>
          <input type="text" id="cfg-year" class="form-input" value="${esc(appState.settings.academicYear)}" />
        </div>
        <div class="form-group cfg-teacher-group">
          <label class="form-label">ชื่อครูผู้สอน</label>
          <input type="text" id="cfg-teacher" class="form-input" value="${esc(appState.settings.teacherName)}" />
        </div>
      </div>

      <!-- รายชื่อวิชา และการผูกห้องเรียนที่สอน -->
      <div style="margin-top: 1rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h4 style="font-size: 0.95rem; font-weight: 600; margin: 0;">📚 รายวิชา (${(appState.settings.subjects || []).length} วิชา) และห้องเรียนที่สอน</h4>
            <p style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">
              แตะเลือกเฉพาะห้องที่คุณครูสอนในแต่ละวิชา (ระบบจะกรองห้องให้ตรงกับวิชานั้นๆ อัตโนมัติ)
            </p>
          </div>
          <div>
            <button type="button" class="btn btn-primary btn-sm" onclick="addNewSubjectModal()">
              ➕ เพิ่มวิชาใหม่
            </button>
          </div>
        </div>

        <div id="subject-list-config">
          ${(appState.settings.subjects || []).map((sub, idx) => {
            const assignedRooms = sortClassroomNames((sub.classrooms && Array.isArray(sub.classrooms)) ? sub.classrooms : []);

            return `
              <div class="cfg-subject-card" data-sub-idx="${idx}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
                  <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">วิชาที่ ${idx + 1}</span>
                  ${appState.settings.subjects.length > 1 ? `
                    <button type="button" class="btn-text-action" style="color: #DC2626; font-size: 0.76rem;" onclick="deleteSubject(${idx})" title="ลบวิชานี้ออกจากการตั้งค่า">
                      🗑️ ลบวิชา
                    </button>
                  ` : ''}
                </div>
                <div class="cfg-sub-top-row">
                  <div class="cfg-sub-code-col">
                    <label class="form-label" style="font-size: 0.78rem; margin-bottom: 2px; font-weight: 600;">รหัสวิชา</label>
                    <input type="text" class="form-input cfg-sub-code" value="${esc(sub.code)}" placeholder="เช่น ส31101" />
                  </div>
                  <div class="cfg-sub-name-col">
                    <label class="form-label" style="font-size: 0.78rem; margin-bottom: 2px; font-weight: 600;">ชื่อรายวิชา</label>
                    <input type="text" class="form-input cfg-sub-name" value="${esc(sub.name)}" placeholder="เช่น สังคมศึกษา 1 (ม.4)" />
                  </div>
                </div>

                <div class="cfg-sub-rooms-section">
                  <div class="cfg-sub-rooms-header" style="flex-wrap: wrap; gap: 0.5rem;">
                    <div class="cfg-sub-rooms-title">
                      <span>🏫 ห้องเรียนที่สอน:</span>
                      <span class="cfg-sub-room-badge ${assignedRooms.length === 0 ? 'badge-empty-warning' : ''}" id="cfg-sub-badge-${idx}">
                        ${assignedRooms.length} ห้อง
                      </span>
                    </div>
                    <div style="display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap;">
                      <button type="button" class="btn btn-primary btn-sm" onclick="openManageSubjectRoomsModal(${idx})" style="padding: 0.28rem 0.65rem; font-size: 0.78rem;">
                        ✏️ จัดการ/เพิ่มห้องที่สอน
                      </button>
                      ${assignedRooms.length > 0 ? `
                        <button type="button" class="btn-text-action" style="color: #DC2626; font-size: 0.75rem;" onclick="handleClearAllRoomsFromSubject(${idx})">
                          ✕ ล้างทั้งหมด
                        </button>
                      ` : ''}
                    </div>
                  </div>
                  
                  <div class="sub-room-chips-grid" id="cfg-room-chips-${idx}" style="min-height: 38px; align-items: center; margin-top: 0.35rem;">
                    ${assignedRooms.length === 0 ? `
                      <span style="font-size: 0.8rem; color: #DC2626; font-style: italic;">
                        ⚠️ ยังไม่มีห้องเรียนที่สอนในวิชานี้ (กดปุ่ม "✏️ จัดการ/เพิ่มห้องที่สอน" ด้านบน)
                      </span>
                    ` : assignedRooms.map(room => `
                      <span class="sub-taught-chip" data-room="${esc(room)}">
                        <span>✓ ${esc(room)}</span>
                        <span class="chip-del" onclick="removeRoomFromSubject(${idx}, '${esc(room)}')" title="ลบห้อง ${esc(room)} ออกจากวิชานี้">✕</span>
                      </span>
                    `).join('')}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
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

      <div class="cfg-save-actions-row" style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button class="btn btn-primary" onclick="saveSettings()">💾 บันทึกการตั้งค่า</button>
        <button class="btn btn-secondary" onclick="triggerManualSync()">⬆️ ส่งข้อมูลขึ้น Google Sheets</button>
      </div>

      <!-- Cloud Recovery / Pull Data จากฐานข้อมูลจริง -->
      <div class="cfg-cloud-box" style="margin-top: 1.5rem; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-md); padding: 1rem;">
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

function openAddSubjectModal() {
  const modalId = 'add-subject-modal';
  closeModal(modalId);

  const commonLevels = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];

  const modalHtml = `
    <div class="modal-overlay" id="${modalId}" style="z-index: 10500; display: flex; align-items: center; justify-content: center; padding: 1rem;">
      <div class="modal-content add-sub-modal-content" style="max-width: 540px; width: 100%; border-radius: var(--radius-lg); padding: 1.4rem; text-align: left; box-shadow: var(--shadow-lg); max-height: 90vh; overflow-y: auto;">
        
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--primary-subtle); display: flex; align-items: center; justify-content: center; font-size: 1.35rem; flex-shrink: 0; border: 1px solid var(--primary-border);">
              📚
            </div>
            <div>
              <h3 style="font-size: 1.12rem; font-weight: 700; margin: 0; color: var(--text-main);">➕ เพิ่มรายวิชาใหม่</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 2px 0 0 0;">กำหนดรหัสวิชา ชื่อวิชา และห้องเรียนที่สอน</p>
            </div>
          </div>
          <button type="button" style="border: none; background: transparent; font-size: 1.35rem; cursor: pointer; color: var(--text-muted); line-height: 1;" onclick="closeModal('${modalId}')">✕</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <!-- รหัสวิชาและชื่อวิชา -->
          <div style="display: grid; grid-template-columns: 140px 1fr; gap: 0.6rem;">
            <div>
              <label class="form-label" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 3px;">รหัสวิชา <span style="color:#DC2626;">*</span></label>
              <input type="text" id="new-sub-code" class="form-input" placeholder="เช่น ส22101" style="font-weight: 600;" oninput="updateNewSubSummary()" />
            </div>
            <div>
              <label class="form-label" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 3px;">ชื่อรายวิชา <span style="color:#DC2626;">*</span></label>
              <input type="text" id="new-sub-name" class="form-input" placeholder="เช่น สังคมศึกษา 3" oninput="updateNewSubSummary()" />
            </div>
          </div>

          <!-- เลือกระดับชั้นที่สอน -->
          <div>
            <label class="form-label" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px;">
              🎓 ระดับชั้นที่สอน (แตะเพื่อเลือกระดับ):
            </label>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;" id="new-sub-level-pills">
              ${commonLevels.map((lvl) => `
                <button type="button" class="pill-btn ${lvl === 'ม.4' ? 'active' : ''}" style="font-size: 0.8rem; padding: 0.25rem 0.6rem;" onclick="selectNewSubLevel('${esc(lvl)}', this)">
                  ${esc(lvl)}
                </button>
              `).join('')}
            </div>
            <input type="hidden" id="new-sub-selected-level" value="ม.4" />
          </div>

          <!-- รูปแบบการระบุห้องเรียนที่สอน -->
          <div style="background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 0.85rem; margin-top: 0.2rem;">
            <div style="margin-bottom: 0.55rem;">
              <div style="font-size: 0.84rem; font-weight: 700; color: var(--text-main);">🏫 ห้องเรียนที่สอนในวิชานี้</div>
              <div style="font-size: 0.74rem; color: var(--primary); margin-top: 2px;">(จะเพิ่มเฉพาะในวิชานี้ ไม่กระทบวิชาอื่น)</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 0.75rem;">
              <label style="display: flex; align-items: center; gap: 0.45rem; cursor: pointer; font-size: 0.84rem; background: var(--bg-surface); padding: 0.45rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
                <input type="radio" name="new-sub-room-mode" value="batch" checked onchange="switchNewSubRoomMode('batch')" />
                <span><b>สร้างเป็นช่วงห้อง</b> <span style="font-size: 0.78rem; color: var(--text-secondary);">(เช่น ห้อง 1 ถึง 12)</span></span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.45rem; cursor: pointer; font-size: 0.84rem; background: var(--bg-surface); padding: 0.45rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
                <input type="radio" name="new-sub-room-mode" value="custom" onchange="switchNewSubRoomMode('custom')" />
                <span><b>ระบุห้องเอง</b> <span style="font-size: 0.78rem; color: var(--text-secondary);">(เช่น ม.4/11 หรือ ม.2/1, ม.2/3)</span></span>
              </label>
            </div>

            <!-- กล่องโหมดช่วงห้อง (Batch) -->
            <div id="new-sub-batch-box" style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
              <span style="font-size: 0.85rem; font-weight: 600; color: var(--primary);" id="new-sub-prefix-label">ม.4</span>
              <span style="font-size: 0.82rem; color: var(--text-secondary);">ห้อง 1 ถึง</span>
              <input type="number" id="new-sub-count" class="form-input" value="11" min="1" max="50" style="width: 75px; text-align: center; padding: 0.35rem 0.5rem;" oninput="updateNewSubSummary()" />
              <span style="font-size: 0.82rem; color: var(--text-secondary);">ห้อง</span>
            </div>

            <!-- กล่องโหมดพิมพ์ระบุห้องเอง (Custom) -->
            <div id="new-sub-custom-box" style="display: none;">
              <input type="text" id="new-sub-custom-input" class="form-input" placeholder="พิมพ์ชื่อห้อง เช่น ม.4/11 หรือ ม.2/1, ม.2/3, ม.2/5" style="padding: 0.4rem 0.6rem; font-size: 0.85rem;" oninput="updateNewSubSummary()" />
              <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 3px;">(หากมีหลายห้อง ให้คั่นด้วยเครื่องหมายจุลภาค , เช่น ม.5/1, ม.5/2)</span>
            </div>

            <!-- ตัวอย่างห้องที่จะบันทึกให้เห็นทันที -->
            <div style="margin-top: 0.75rem; padding-top: 0.6rem; border-top: 1px dashed var(--border-light);">
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.35rem; display: flex; justify-content: space-between;">
                <span>ตัวอย่างห้องที่จะบรรจุลงวิชานี้:</span>
                <b id="new-sub-room-count-badge" style="color: var(--primary);">11 ห้อง</b>
              </div>
              <div id="new-sub-preview-chips" style="display: flex; gap: 0.3rem; flex-wrap: wrap; max-height: 80px; overflow-y: auto;">
                <!-- dynamic chips preview -->
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; border-top: 1px solid var(--border-light); padding-top: 0.85rem;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('${modalId}')">ยกเลิก</button>
          <button type="button" class="btn btn-primary" onclick="handleConfirmAddSubject()">
            ➕ สร้างรายวิชานี้ทันที
          </button>
        </div>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  updateNewSubSummary();
}

function selectNewSubLevel(lvl, btn) {
  const hidden = document.getElementById('new-sub-selected-level');
  if (hidden) hidden.value = lvl;
  const label = document.getElementById('new-sub-prefix-label');
  if (label) label.textContent = lvl;

  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  updateNewSubSummary();
}

function switchNewSubRoomMode(mode) {
  const batchBox = document.getElementById('new-sub-batch-box');
  const customBox = document.getElementById('new-sub-custom-box');
  if (batchBox && customBox) {
    if (mode === 'batch') {
      batchBox.style.display = 'flex';
      customBox.style.display = 'none';
    } else {
      batchBox.style.display = 'none';
      customBox.style.display = 'block';
    }
  }
  updateNewSubSummary();
}

function getNewSubRoomsList() {
  const mode = document.querySelector('input[name="new-sub-room-mode"]:checked')?.value || 'batch';
  const lvl = document.getElementById('new-sub-selected-level')?.value || 'ม.4';
  const rooms = [];

  if (mode === 'batch') {
    const count = parseInt(document.getElementById('new-sub-count')?.value || '1', 10);
    if (!isNaN(count) && count > 0) {
      for (let i = 1; i <= Math.min(count, 50); i++) {
        rooms.push(`${lvl}/${i}`);
      }
    }
  } else {
    const raw = document.getElementById('new-sub-custom-input')?.value || '';
    const parts = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    parts.forEach(p => {
      let r = p;
      if (/^\d+$/.test(r)) {
        r = `${lvl}/${r}`;
      } else if (!r.includes('/') && !r.startsWith('ม.') && !r.startsWith('ป.')) {
        r = `${lvl}/${r}`;
      }
      if (!rooms.includes(r)) rooms.push(r);
    });
  }
  return sortClassroomNames(rooms);
}

function updateNewSubSummary() {
  const rooms = getNewSubRoomsList();
  const countBadge = document.getElementById('new-sub-room-count-badge');
  const previewDiv = document.getElementById('new-sub-preview-chips');
  if (countBadge) countBadge.textContent = `${rooms.length} ห้อง`;
  if (previewDiv) {
    if (rooms.length === 0) {
      previewDiv.innerHTML = '<span style="font-size:0.75rem; color:#DC2626; font-style:italic;">⚠️ ยังไม่มีห้องเรียนที่เลือก (กรุณาระบุจำนวนหรือพิมพ์ห้อง)</span>';
    } else {
      previewDiv.innerHTML = rooms.map(r => `
        <span style="display:inline-block; font-size:0.75rem; background:var(--primary-subtle); color:var(--primary); padding:0.15rem 0.45rem; border-radius:12px; font-weight:600; border:1px solid var(--primary-border);">
          ${esc(r)}
        </span>
      `).join('');
    }
  }
}

function handleConfirmAddSubject() {
  const codeInput = document.getElementById('new-sub-code');
  const nameInput = document.getElementById('new-sub-name');
  const code = (codeInput?.value || '').trim();
  const name = (nameInput?.value || '').trim() || code;
  const rooms = getNewSubRoomsList();

  if (!code) {
    showToast('⚠️ กรุณาระบุรหัสวิชา');
    if (codeInput) codeInput.focus();
    return;
  }

  if (!appState.settings.subjects) appState.settings.subjects = [];
  if (appState.settings.subjects.some(s => s.code.toLowerCase() === code.toLowerCase())) {
    showToast(`⚠️ มีรหัสวิชา ${code} ในระบบแล้ว`);
    return;
  }

  if (rooms.length === 0) {
    showToast('⚠️ กรุณาระบุห้องเรียนที่สอนในวิชานี้อย่างน้อย 1 ห้อง');
    return;
  }

  appState.settings.subjects.push({
    code: code,
    name: name,
    classrooms: [...rooms]
  });

  if (!appState.settings.classrooms) appState.settings.classrooms = [];
  rooms.forEach(r => {
    if (!appState.settings.classrooms.includes(r)) {
      appState.settings.classrooms.push(r);
    }
  });
  appState.settings.classrooms = sortClassroomNames(appState.settings.classrooms);

  appState.activeSubject = code;
  appState.activeClassroom = rooms[0];

  appState.isDirty = true;
  saveLocalState();
  closeModal('add-subject-modal');
  renderHeaderControls();
  renderSettings(document.getElementById('app-view-container'));
  showToast(`✓ เพิ่มวิชา ${code} (${rooms.length} ห้อง) สำเร็จเรียบร้อย`);
}

function deleteSubject(idx) {
  if (appState.settings.subjects.length <= 1) {
    showToast('⚠️ ระบบต้องมีรายวิชาอย่างน้อย 1 วิชา');
    return;
  }
  const sub = appState.settings.subjects[idx];
  showModernConfirm({
    title: 'ยืนยันลบรายวิชา?',
    subtitle: `คุณแน่ใจว่าต้องการลบวิชา "${sub.code} ${sub.name}" ออกจากการตั้งค่าหรือไม่?\n\n(หากเคยมีคะแนนบันทึกไว้ในชีท Google Sheets ข้อมูลเดิมจะยังคงอยู่ แต่ระบบจะไม่แสดงวิชานี้ในตัวเลือก)`,
    icon: '🗑️',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    iconBorder: 'rgba(239, 68, 68, 0.25)',
    confirmText: '🗑️ ลบวิชา',
    confirmClass: 'btn-danger',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
      appState.settings.subjects.splice(idx, 1);
      if (appState.activeSubject === sub.code) {
        appState.activeSubject = appState.settings.subjects[0].code;
      }
      appState.isDirty = true;
      saveLocalState();
      renderHeaderControls();
      renderSettings(document.getElementById('app-view-container'));
      showToast(`ลบวิชา ${sub.code} เรียบร้อยแล้ว`);
    }
  });
}

function openManageSubjectRoomsModal(subIdx) {
  const sub = appState.settings.subjects[subIdx];
  if (!sub) return;

  const modalId = 'manage-subject-rooms-modal';
  closeModal(modalId);

  const currentRooms = sortClassroomNames(sub.classrooms || []);
  const allMasterRooms = sortClassroomNames(appState.settings.classrooms || DEFAULT_CLASSROOMS);
  const otherRooms = allMasterRooms.filter(r => !currentRooms.includes(r));

  let defaultLevel = 'ม.4';
  if (currentRooms.length > 0) {
    const m = String(currentRooms[0]).match(/^(?:ม\.|ป\.|)([^\/\-]+)/);
    if (m) defaultLevel = m[0];
  } else if (sub.name || sub.code) {
    const m = String(sub.name + ' ' + sub.code).match(/ม\.\d/);
    if (m) defaultLevel = m[0];
  }

  // แสดงเฉพาะห้องที่มีระดับชั้นตรงกับวิชานี้เท่านั้น (ไม่แสดง ม.4 ในวิชา ม.5)
  const sameLevelOtherRooms = otherRooms.filter(r => r.startsWith(defaultLevel));

  const modalHtml = `
    <div class="modal-overlay" id="${modalId}" style="z-index: 10500; display: flex; align-items: center; justify-content: center; padding: 1rem;">
      <div class="modal-content" style="max-width: 520px; width: 100%; border-radius: var(--radius-lg); padding: 1.35rem 1.45rem; text-align: left; box-shadow: var(--shadow-lg); max-height: 90vh; overflow-y: auto;">
        
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.85rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary-subtle); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0; border: 1px solid var(--primary-border);">
              🏫
            </div>
            <div>
              <h3 style="font-size: 1.08rem; font-weight: 700; margin: 0; color: var(--text-main);">
                จัดการห้องเรียน: ${esc(sub.code)}
              </h3>
              <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 2px 0 0 0;">
                ${esc(sub.name)}
              </p>
            </div>
          </div>
          <button type="button" style="border: none; background: transparent; font-size: 1.35rem; cursor: pointer; color: var(--text-muted); line-height: 1;" onclick="closeModal('${modalId}')">✕</button>
        </div>

        <!-- รายการห้องปัจจุบันของวิชานี้ -->
        <div style="margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-main);">
              ห้องเรียนในวิชานี้ปัจจุบัน (<span id="modal-sub-room-count">${currentRooms.length}</span> ห้อง):
            </span>
            ${currentRooms.length > 0 ? `
              <button type="button" class="btn-text-action" style="color: #DC2626; font-size: 0.75rem;" onclick="handleClearAllRoomsFromSubject(${subIdx})">
                ✕ ล้างห้องทั้งหมด
              </button>
            ` : ''}
          </div>
          <div id="modal-sub-current-rooms" class="sub-room-chips-grid" style="min-height: 36px; padding: 0.45rem; background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-light); border-radius: var(--radius-md);">
            ${currentRooms.length === 0 ? `
              <span style="font-size: 0.78rem; color: #DC2626; font-style: italic;">ยังไม่มีห้องเรียนในวิชานี้</span>
            ` : currentRooms.map(r => `
              <span class="sub-taught-chip" data-room="${esc(r)}">
                <span>✓ ${esc(r)}</span>
                <span class="chip-del" onclick="handleRemoveSingleRoomFromSubjectModal(${subIdx}, '${esc(r)}')" title="ลบห้อง ${esc(r)}">✕</span>
              </span>
            `).join('')}
          </div>
        </div>

        <!-- ส่วนที่ 1: เพิ่มเป็นช่วงห้อง (Batch) -->
        <div style="background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 0.75rem 0.85rem; margin-bottom: 0.85rem;">
          <div style="font-size: 0.82rem; font-weight: 700; color: var(--primary); margin-bottom: 0.4rem;">
            ⚡ เพิ่มเป็นช่วงห้องสำหรับวิชานี้
          </div>
          <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
            <select id="modal-sub-batch-prefix" class="form-input" style="width: 85px; padding: 0.35rem 0.45rem; font-size: 0.82rem; font-weight: 600;" onchange="handleModalSubBatchPrefixChange(${subIdx}, this.value)">
              ${['ม.1','ม.2','ม.3','ม.4','ม.5','ม.6'].map(lvl => `
                <option value="${lvl}" ${lvl === defaultLevel ? 'selected' : ''}>${lvl}</option>
              `).join('')}
            </select>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">ห้อง 1 ถึง</span>
            <input type="number" id="modal-sub-batch-count" class="form-input" value="11" min="1" max="50" style="width: 70px; text-align: center; padding: 0.35rem 0.45rem; font-size: 0.82rem;" />
            <span style="font-size: 0.8rem; color: var(--text-secondary);">ห้อง</span>
            <button type="button" class="btn btn-primary btn-sm" onclick="handleAddBatchRoomsToSubject(${subIdx})" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; white-space: nowrap;">
              + เพิ่มชุดห้อง
            </button>
          </div>
        </div>

        <!-- ส่วนที่ 2: เพิ่มห้องเดี่ยว หรือพิมพ์ชื่อห้องเฉพาะ -->
        <div style="display: flex; gap: 0.4rem; margin-bottom: 0.85rem;">
          <input type="text" id="modal-sub-single-room" class="form-input" placeholder="หรือพิมพ์ชื่อห้อง เช่น ม.4/11 หรือ ม.4/EP" style="padding: 0.4rem 0.65rem; font-size: 0.82rem;" />
          <button type="button" class="btn btn-secondary btn-sm" onclick="handleAddSingleRoomToSubject(${subIdx})" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; white-space: nowrap;">
            + เพิ่มห้องเดี่ยว
          </button>
        </div>

        <!-- ส่วนที่ 3: เลือกจากห้องเรียนระดับเดียวกันที่ยังไม่ได้เลือก (ถ้ามี) -->
        <div id="modal-sub-same-level-container" style="display: ${sameLevelOtherRooms.length > 0 ? 'block' : 'none'}; margin-top: 0.6rem; border-top: 1px dashed var(--border-light); padding-top: 0.6rem;">
          ${sameLevelOtherRooms.length > 0 ? `
            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.35rem;">
              หรือแตะเลือกจากห้องเรียนระดับ ${esc(defaultLevel)} ที่ยังไม่ได้เลือก:
            </div>
            <div style="display: flex; gap: 0.3rem; flex-wrap: wrap; max-height: 85px; overflow-y: auto;">
              ${sameLevelOtherRooms.map(r => `
                <button type="button" class="pill-btn" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;" onclick="handleAddExistingRoomToSubject(${subIdx}, '${esc(r)}')">
                  + ${esc(r)}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 1.15rem; border-top: 1px solid var(--border-light); padding-top: 0.75rem;">
          <button type="button" class="btn btn-primary" onclick="closeModal('${modalId}'); renderSettings(document.getElementById('app-view-container'));">
            ✓ เรียบร้อย / ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function handleAddBatchRoomsToSubject(subIdx) {
  const sub = appState.settings.subjects[subIdx];
  if (!sub) return;
  const prefix = document.getElementById('modal-sub-batch-prefix')?.value || 'ม.4';
  const count = parseInt(document.getElementById('modal-sub-batch-count')?.value || '1', 10);
  if (isNaN(count) || count < 1) return;

  if (!sub.classrooms) sub.classrooms = [];
  if (!appState.settings.classrooms) appState.settings.classrooms = [];

  let addedCount = 0;
  for (let i = 1; i <= Math.min(count, 50); i++) {
    const room = `${prefix}/${i}`;
    if (!sub.classrooms.includes(room)) {
      sub.classrooms.push(room);
      addedCount++;
    }
    if (!appState.settings.classrooms.includes(room)) {
      appState.settings.classrooms.push(room);
    }
  }

  sub.classrooms = sortClassroomNames(sub.classrooms);
  appState.settings.classrooms = sortClassroomNames(appState.settings.classrooms);

  appState.isDirty = true;
  saveLocalState();
  renderHeaderControls();
  openManageSubjectRoomsModal(subIdx);
  showToast(`✓ เพิ่มห้อง ${prefix}/1 ถึง ${prefix}/${count} เข้าวิชา ${sub.code} เรียบร้อย`);
}

function handleAddSingleRoomToSubject(subIdx) {
  const sub = appState.settings.subjects[subIdx];
  if (!sub) return;
  const input = document.getElementById('modal-sub-single-room');
  const room = (input?.value || '').trim();
  if (!room) {
    showToast('⚠️ กรุณาระบุชื่อห้อง');
    return;
  }

  if (!sub.classrooms) sub.classrooms = [];
  if (sub.classrooms.includes(room)) {
    showToast(`⚠️ มีห้อง ${room} ในวิชานี้อยู่แล้ว`);
    return;
  }

  sub.classrooms.push(room);
  sub.classrooms = sortClassroomNames(sub.classrooms);

  if (!appState.settings.classrooms) appState.settings.classrooms = [];
  if (!appState.settings.classrooms.includes(room)) {
    appState.settings.classrooms.push(room);
    appState.settings.classrooms = sortClassroomNames(appState.settings.classrooms);
  }

  appState.isDirty = true;
  saveLocalState();
  renderHeaderControls();
  openManageSubjectRoomsModal(subIdx);
  showToast(`✓ เพิ่มห้อง ${room} เข้าวิชา ${sub.code} เรียบร้อย`);
}

function handleAddExistingRoomToSubject(subIdx, room) {
  const sub = appState.settings.subjects[subIdx];
  if (!sub) return;
  if (!sub.classrooms) sub.classrooms = [];
  if (sub.classrooms.includes(room)) return;

  sub.classrooms.push(room);
  sub.classrooms = sortClassroomNames(sub.classrooms);

  appState.isDirty = true;
  saveLocalState();
  renderHeaderControls();
  openManageSubjectRoomsModal(subIdx);
  showToast(`✓ เพิ่มห้อง ${room} เข้าวิชา ${sub.code} เรียบร้อย`);
}

function handleRemoveSingleRoomFromSubjectModal(subIdx, room) {
  removeRoomFromSubject(subIdx, room);
  openManageSubjectRoomsModal(subIdx);
}

function removeRoomFromSubject(subIdx, room) {
  const sub = appState.settings.subjects[subIdx];
  if (!sub || !sub.classrooms) return;

  sub.classrooms = sub.classrooms.filter(r => r !== room);
  appState.isDirty = true;
  saveLocalState();
  renderHeaderControls();

  const container = document.getElementById(`cfg-room-chips-${subIdx}`);
  if (container) {
    const chip = container.querySelector(`.sub-taught-chip[data-room="${room}"]`);
    if (chip) chip.remove();
    const remaining = container.querySelectorAll('.sub-taught-chip').length;
    const badge = document.getElementById(`cfg-sub-badge-${subIdx}`);
    if (badge) {
      badge.textContent = `${remaining} ห้อง`;
      if (remaining === 0) badge.classList.add('badge-empty-warning');
      else badge.classList.remove('badge-empty-warning');
    }
  }

  showToast(`ลบห้อง ${room} ออกจากวิชา ${sub.code} แล้ว`);
}

function handleClearAllRoomsFromSubject(subIdx) {
  const sub = appState.settings.subjects[subIdx];
  if (!sub) return;

  showModernConfirm({
    title: 'ล้างห้องเรียนทั้งหมด?',
    subtitle: `คุณแน่ใจว่าต้องการล้างห้องเรียนทั้งหมดในวิชา "${sub.code} ${sub.name}" หรือไม่?`,
    icon: '🗑️',
    confirmText: 'ล้างห้องทั้งหมด',
    confirmClass: 'btn-danger',
    onConfirm: () => {
      sub.classrooms = [];
      appState.isDirty = true;
      saveLocalState();
      renderHeaderControls();
      closeModal('manage-subject-rooms-modal');
      renderSettings(document.getElementById('app-view-container'));
      showToast(`ล้างห้องทั้งหมดในวิชา ${sub.code} เรียบร้อย`);
    }
  });
}

async function saveSettings() {
  const currentToken = appState.settings.apiToken || '';
  const inputToken = document.getElementById('cfg-token') ? document.getElementById('cfg-token').value.trim() : currentToken;

  appState.settings.schoolName = document.getElementById('cfg-school').value;
  appState.settings.term = document.getElementById('cfg-term').value;
  appState.settings.academicYear = document.getElementById('cfg-year').value;
  appState.settings.teacherName = document.getElementById('cfg-teacher').value;
  appState.settings.gasUrl = document.getElementById('cfg-gas-url').value.trim() || DEFAULT_GAS_URL;
  appState.settings.apiToken = inputToken;

  const subCards = document.querySelectorAll('.cfg-subject-card');
  const newSubs = [];
  let validationError = '';

  subCards.forEach((card, idx) => {
    const code = card.querySelector('.cfg-sub-code').value.trim();
    const name = card.querySelector('.cfg-sub-name').value.trim();
    const chipRooms = Array.from(card.querySelectorAll('.sub-taught-chip')).map(el => el.getAttribute('data-room')).filter(Boolean);
    const existingSubRooms = (appState.settings.subjects && appState.settings.subjects[idx] && appState.settings.subjects[idx].classrooms) || [];
    const rooms = chipRooms.length > 0 ? chipRooms : existingSubRooms;

    if (code) {
      if (rooms.length === 0) {
        validationError = `วิชา "${code} ${name}" ยังไม่ได้ระบุห้องเรียนที่สอน กรุณากดปุ่ม "✏️ จัดการ/เพิ่มห้องที่สอน" อย่างน้อย 1 ห้อง`;
      }
      newSubs.push({
        code: code,
        name: name,
        classrooms: sortClassroomNames(rooms)
      });
    }
  });

  if (validationError) {
    showModernAlert({
      title: 'ข้อมูลยังไม่ครบถ้วน',
      message: validationError,
      icon: '⚠️',
      buttonClass: 'btn-danger'
    });
    return;
  }

  if (newSubs.length > 0) appState.settings.subjects = newSubs;

  // รวบรวมและจัดระเบียบ Master Classrooms ให้เหลือเฉพาะห้องที่สอนจริง + ห้องที่มีนักเรียน
  const activeRoomsSet = new Set();
  newSubs.forEach(s => (s.classrooms || []).forEach(r => activeRoomsSet.add(r)));
  (appState.students || []).forEach(st => { if (st.classroom) activeRoomsSet.add(st.classroom); });
  if (activeRoomsSet.size > 0) {
    appState.settings.classrooms = sortClassroomNames([...activeRoomsSet]);
  }

  // ตรวจสอบว่า activeClassroom ปัจจุบัน สอดคล้องกับวิชาที่กำลังเลือกอยู่หรือไม่
  const currentValid = getClassroomsForSubject(appState.activeSubject);
  if (!currentValid.includes(appState.activeClassroom)) {
    appState.activeClassroom = currentValid[0] || (appState.settings.classrooms && appState.settings.classrooms[0]) || 'ม.4/1';
  }

  saveLocalState();
  renderHeaderControls();
  showToast('💾 บันทึกในเครื่องแล้ว กำลังส่งการตั้งค่าขึ้น Google Sheets...');
  await pushSettingsToBackend(currentToken, inputToken);
}

function handleModalSubBatchPrefixChange(subIdx, prefix) {
  const sub = appState.settings.subjects[subIdx];
  if (!sub) return;
  const currentRooms = sub.classrooms || [];
  const allMasterRooms = sortClassroomNames(appState.settings.classrooms || DEFAULT_CLASSROOMS);
  const otherRooms = allMasterRooms.filter(r => !currentRooms.includes(r));
  const sameLevel = otherRooms.filter(r => r.startsWith(prefix));
  
  const container = document.getElementById('modal-sub-same-level-container');
  if (container) {
    if (sameLevel.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
    } else {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.35rem;">
          หรือแตะเลือกจากห้องเรียนระดับ ${esc(prefix)} ที่ยังไม่ได้เลือก:
        </div>
        <div style="display: flex; gap: 0.3rem; flex-wrap: wrap; max-height: 85px; overflow-y: auto;">
          ${sameLevel.map(r => `
            <button type="button" class="pill-btn" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;" onclick="handleAddExistingRoomToSubject(${subIdx}, '${esc(r)}')">
              + ${esc(r)}
            </button>
          `).join('')}
        </div>
      `;
    }
  }
}

window.handleModalSubBatchPrefixChange = handleModalSubBatchPrefixChange;
window.addNewSubjectModal = openAddSubjectModal;
window.openAddSubjectModal = openAddSubjectModal;
window.selectNewSubLevel = selectNewSubLevel;
window.switchNewSubRoomMode = switchNewSubRoomMode;
window.updateNewSubSummary = updateNewSubSummary;
window.handleConfirmAddSubject = handleConfirmAddSubject;
window.deleteSubject = deleteSubject;
window.openManageSubjectRoomsModal = openManageSubjectRoomsModal;
window.handleAddBatchRoomsToSubject = handleAddBatchRoomsToSubject;
window.handleAddSingleRoomToSubject = handleAddSingleRoomToSubject;
window.handleAddExistingRoomToSubject = handleAddExistingRoomToSubject;
window.handleRemoveSingleRoomFromSubjectModal = handleRemoveSingleRoomFromSubjectModal;
window.removeRoomFromSubject = removeRoomFromSubject;
window.handleClearAllRoomsFromSubject = handleClearAllRoomsFromSubject;
window.saveSettings = saveSettings;

// ----------------- Cloud Restore: ดึงข้อมูลจริงจาก Google Sheets -----------------
async function pullFromGoogleSheets(isManual = false) {
  if (!appState.settings.gasUrl) {
    if (isManual) {
      showModernAlert({
        title: 'ยังไม่ได้ระบุ Web App URL',
        message: 'กรุณาระบุ Google Apps Script Web App URL ในหน้าตั้งค่าก่อนดึงข้อมูล',
        icon: '⚙️'
      });
    }
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
        showModernConfirm({
          title: 'ยืนยันดึงข้อมูลจาก Google Sheets?',
          subtitle: '⚠️ มีข้อมูลคะแนนใหม่ในเครื่องที่ยังส่งขึ้นชีทไม่สำเร็จ หากดึงข้อมูลตอนนี้ ข้อมูลในเครื่องอาจถูกแทนที่ ยืนยันจะดึงข้อมูลหรือไม่?',
          icon: '☁️',
          confirmText: '📥 ยืนยันดึงข้อมูล',
          confirmClass: 'btn-primary',
          onConfirm: () => {
            continuePullFromGoogleSheets(true);
          },
          onCancel: () => {
            updateSyncIndicator('offline');
          }
        });
        return;
      }
    }
  }

  continuePullFromGoogleSheets(isManual);
}

async function continuePullFromGoogleSheets(isManual) {

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
      if (data.gradebook && Array.isArray(data.gradebook)) {
        appState.gradebook = {}; // เคลียร์ขยะเก่าในเครื่องทิ้งทั้งหมด แทนที่ด้วยข้อมูลบริสุทธิ์จากชีท
        data.gradebook.forEach(record => {
          const key = (record.subject || '') + '_' + (record.classroom || '') + '_' + (record.studentId || '');
          appState.gradebook[key] = record;
        });
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

      // ตรวจสอบความถูกต้องของ activeClassroom กับวิชาที่เลือก
      const validRooms = getClassroomsForSubject(appState.activeSubject);
      if (!validRooms.includes(appState.activeClassroom)) {
        appState.activeClassroom = validRooms[0] || (appState.settings.classrooms && appState.settings.classrooms[0]) || 'ม.4/1';
      }

      // ล้างข้อมูลผีและข้อมูลห้องที่ถูกลบออกจากเครื่องทันที
      purgeInvalidGradebookRecords();

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

async function pushSettingsToBackend(currentToken = '', newToken = '') {
  if (!appState.settings.gasUrl) return;
  updateSyncIndicator('syncing');

  try {
    const res = await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateSettings',
        token: currentToken || appState.settings.apiToken || '',
        newToken: newToken !== undefined ? newToken : (appState.settings.apiToken || ''),
        settings: {
          schoolName: appState.settings.schoolName,
          academicYear: appState.settings.academicYear,
          term: appState.settings.term,
          teacherName: appState.settings.teacherName,
          activeSubject: appState.activeSubject,
          activeClassroom: appState.activeClassroom,
          subjects: appState.settings.subjects,
          classrooms: appState.settings.classrooms,
          apiToken: appState.settings.apiToken || ''
        }
      }),
    });

    const resData = await res.json();
    if (resData.success) {
      updateSyncIndicator('online');
      showToast('✓ บันทึกการตั้งค่าลง Google Sheets สำเร็จแล้ว');
    } else {
      updateSyncIndicator('offline');
      showToast('⚠️ ไม่สามารถบันทึกการตั้งค่าได้: ' + (resData.error || ''));
    }
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

    // Sync guard: ไม่ส่งคำสั่ง replace_all ไปทับชีท ถ้ายังไม่เคยดึงข้อมูลสำเร็จและในเครื่องยังไม่มีนักเรียน
    if (!hasEverPulledFromBackend && appState.students.length === 0) {
      console.warn('Sync guard: ยังไม่เคยดึงข้อมูลจริงจาก Google Sheets จะไม่ส่งคำสั่ง syncFullState ไปทับ');
      return;
    }

    // ล้างข้อมูลคะแนนผีและกรองส่งเฉพาะรายการที่ถูกต้องตามวิชาและห้องเรียนจริงเท่านั้น
    purgeInvalidGradebookRecords();
    const validGradebookRecords = Object.values(appState.gradebook || {}).filter(r => {
      const validRooms = getClassroomsForSubject(r.subject);
      const studentExists = appState.students.some(s => s.studentId === r.studentId && s.classroom === r.classroom);
      return validRooms.includes(r.classroom) && studentExists;
    });

    const res = await fetch(appState.settings.gasUrl, {
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
        submissions: list,
        gradebook: validGradebookRecords
      })
    });

    const resData = await res.json();
    if (resData.success) {
      appState.isDirty = false;
      saveLocalState();
      updateSyncIndicator('online');
    } else {
      updateSyncIndicator('offline');
      throw new Error(resData.error || 'ซิงค์ข้อมูลไม่สำเร็จ');
    }
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

    const res = await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'batchSaveSubmissions',
        token: appState.settings.apiToken || '',
        submissions: list
      })
    });

    const resData = await res.json();
    if (resData.success) {
      appState.isDirty = false;
      saveLocalState();
      updateSyncIndicator('online');
    } else {
      updateSyncIndicator('offline');
    }
  } catch (err) {
    updateSyncIndicator('offline');
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
    showModernAlert({
      title: 'ยังไม่ได้ระบุ Web App URL',
      message: 'กรุณาระบุ Google Apps Script Web App API URL ในหน้าตั้งค่าก่อนเชื่อมต่อชีท',
      icon: '⚙️'
    });
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
  }, 5500);
}


// ==========================================================================
// 🎓 ทะเบียนคะแนน & ตัดเกรด (SGS Gradebook Calculation Engine)
// ==========================================================================

/**
 * คำนวณคะแนนตามสัดส่วน (70/30 หรือ 80/20) และสูตรข้อเขียน + คะแนนช่วย
 * - กลางภาค: ตัดตัวหารออก ครูหารมาแล้ว บวกคะแนนช่วยทันที
 * - ตัดเกรด ร / มส: ยุบไปตรวจจับจากช่อง "หมายเหตุ" หากพิมพ์ ร หรือ มส
 */
function calculateGradeRecord(rec, ratio) {
  const is8020 = (ratio === '80/20');
  
  // 1. ก่อนกลางภาค
  // สัดส่วน 70/30: เต็ม 30 (หรือ 25) | สัดส่วน 80/20: เต็ม 30
  const maxPre = 30;
  const attPre = Math.max(0, Number(rec.attPre) || 0);
  const workPre = Math.max(0, Number(rec.workPre) || 0);
  const sumPre = Math.min(maxPre, Math.round((attPre + workPre) * 10) / 10);

  // 2. สอบกลางภาค (ครูหารมือมาแล้ว: ข้อเขียน + คะแนนช่วย)
  // สัดส่วน 70/30: เต็ม 20 | สัดส่วน 80/20: เต็ม 20
  const maxMid = 20;
  const midRaw = Math.max(0, Number(rec.midRaw) || 0);
  const midHelp = Number(rec.midHelp) || 0;
  const midScore = Math.min(maxMid, Math.max(0, Math.round((midRaw + midHelp) * 10) / 10));

  // 3. หลังกลางภาค
  // สัดส่วน 70/30: เต็ม 20 (รวมระหว่างภาค 30+20+20=70)
  // สัดส่วน 80/20: เต็ม 30 (รวมระหว่างภาค 30+20+30=80)
  const maxPost = is8020 ? 30 : 20;
  const attPost = Math.max(0, Number(rec.attPost) || 0);
  const workPost = Math.max(0, Number(rec.workPost) || 0);
  const sumPost = Math.min(maxPost, Math.round((attPost + workPost) * 10) / 10);

  // 4. รวมระหว่างภาค
  // สัดส่วน 70/30: เต็ม 70 = ก่อนกลาง (30) + กลางภาค (20) + หลังกลาง (20)
  // สัดส่วน 80/20: เต็ม 80 = ก่อนกลาง (30) + กลางภาค (20) + หลังกลาง (30)
  const maxTerm = is8020 ? 80 : 70;
  const rawTerm = sumPre + midScore + sumPost;
  const termScore = Math.min(maxTerm, Math.round(rawTerm * 10) / 10);

  // 5. สอบปลายภาค: (ข้อเขียน / ตัวหาร [ค่าจากหัวตาราง เช่น 2 หรือ 3]) + คะแนนช่วย
  // สัดส่วน 70/30: เต็ม 30 | สัดส่วน 80/20: เต็ม 20
  const maxFinal = is8020 ? 20 : 30;
  const finalRaw = Math.max(0, Number(rec.finalRaw) || 0);
  const globalDiv = (Number(appState.finalDivisor) > 0) ? Number(appState.finalDivisor) : 2;
  const finalDiv = (Number(rec.finalDiv) > 0) ? Number(rec.finalDiv) : globalDiv;
  const finalHelp = Number(rec.finalHelp) || 0;
  const rawFinalScore = (finalRaw / finalDiv) + finalHelp;
  const finalScore = Math.min(maxFinal, Math.max(0, Math.round(rawFinalScore * 10) / 10));

  // 6. คะแนนรวมทั้งสิ้น (เต็ม 100) = ระหว่างภาค + สรุปปลายภาค
  const totalScore = Math.min(100, Math.round((termScore + finalScore) * 10) / 10);

  // 7. ตัดเกรด & ตรวจจับ ร / มส จากช่อง "หมายเหตุ"
  const noteStr = String(rec.note || '').trim();
  const isMS = /มส/.test(noteStr);
  const isR = !isMS && (/^ร(\s|$|[\(\-\.\/])/.test(noteStr) || /ติด\s*ร/.test(noteStr) || noteStr === 'ร');

  let grade = '0';
  let sgsStatus = 'ปกติ';

  if (isR) {
    grade = 'ร';
    sgsStatus = 'ร';
  } else if (isMS) {
    grade = 'มส';
    sgsStatus = 'มส';
  } else {
    sgsStatus = 'ปกติ';
    if (totalScore >= 80) grade = '4';
    else if (totalScore >= 75) grade = '3.5';
    else if (totalScore >= 70) grade = '3';
    else if (totalScore >= 65) grade = '2.5';
    else if (totalScore >= 60) grade = '2';
    else if (totalScore >= 55) grade = '1.5';
    else if (totalScore >= 50) grade = '1';
    else grade = '0';
  }

  return {
    ...rec,
    attPre,
    workPre,
    sumPre,
    midRaw,
    midDiv: 1, // กลางภาคหารมือมาแล้ว ไม่ใช้ตัวหาร
    midHelp,
    midScore,
    attPost,
    workPost,
    sumPost,
    termScore,
    finalRaw,
    finalDiv,
    finalHelp,
    finalScore,
    totalScore,
    grade,
    sgsStatus,
    note: rec.note || ''
  };
}

function getOrCreateGradeRecord(student) {
  const defaultSubj = (appState.settings && appState.settings.subjects && appState.settings.subjects[0] && appState.settings.subjects[0].code) || 'ส31162';
  const subj = appState.activeSubject || defaultSubj;
  const room = student.classroom || appState.activeClassroom || 'ม.4/1';
  const sid = String(student.studentId || '');
  const key = subj + '_' + room + '_' + sid;

  if (!appState.gradebook) appState.gradebook = {};

  let computedWork = 0;
  const assignments = (appState.assignments || []).filter(a => a.subject === subj && a.classroom === room);
  if (assignments.length > 0) {
    assignments.forEach(a => {
      const subKey = a.id + '_' + sid;
      const sub = appState.submissions[subKey];
      if (sub && sub.score !== null && sub.score !== undefined && sub.score !== '') {
        computedWork += Number(sub.score);
      }
    });
  }

  if (!appState.gradebook[key]) {
    const defaultRec = {
      subject: subj,
      classroom: room,
      studentId: sid,
      no: student.no || 1,
      fullName: student.fullName || '',
      attPre: 0,
      workPre: computedWork,
      sumPre: computedWork,
      midRaw: 0,
      midHelp: 0,
      midScore: 0,
      attPost: 0,
      workPost: 0,
      sumPost: 0,
      termScore: computedWork,
      finalRaw: 0,
      finalDiv: appState.finalDivisor || 2,
      finalHelp: 0,
      finalScore: 0,
      totalScore: computedWork,
      grade: '0',
      sgsStatus: 'ปกติ',
      note: '',
      _autoWork: true
    };
    appState.gradebook[key] = calculateGradeRecord(defaultRec, appState.gradebookRatio || '70/30');
  } else {
    // ถ้ามี record เดิมอยู่แล้ว แต่ workPre ยังเป็น 0 หรือถูกระบุให้ซิงค์จากงานจริง (autoWork)
    const rec = appState.gradebook[key];
    if (computedWork > 0 && (Number(rec.workPre || 0) === 0 || rec._autoWork)) {
      rec.workPre = computedWork;
      rec._autoWork = true;
      appState.gradebook[key] = calculateGradeRecord(rec, appState.gradebookRatio || '70/30');
    }
  }

  return appState.gradebook[key];
}

/**
 * ดึงคะแนนจากหน้าเช็คงาน (Submissions) มาอัปเดตลงช่องงานเก็บก่อนกลางภาค (workPre) ทุกคน
 */
function syncWorkScoresFromCheckWork() {
  const students = getFilteredStudents();
  if (students.length === 0) {
    showToast('⚠️ ไม่พบข้อมูลนักเรียนในห้องนี้');
    return;
  }

  const subj = appState.activeSubject;
  const room = appState.activeClassroom;
  let count = 0;

  students.forEach(s => {
    const sid = String(s.studentId || '');
    const key = subj + '_' + room + '_' + sid;

    let computedWork = 0;
    const assignments = (appState.assignments || []).filter(a => a.subject === subj && a.classroom === room);
    assignments.forEach(a => {
      const subKey = a.id + '_' + sid;
      const sub = appState.submissions[subKey];
      if (sub && sub.score !== null && sub.score !== undefined && sub.score !== '') {
        computedWork += Number(sub.score);
      }
    });

    const rec = getOrCreateGradeRecord(s);
    rec.workPre = computedWork;
    rec._autoWork = true;
    appState.gradebook[key] = calculateGradeRecord(rec, appState.gradebookRatio || '70/30');
    count++;
  });

  appState.isDirty = true;
  saveLocalState();
  renderApp();
  showToast(`✅ ดึงคะแนนงานจริงเข้าตารางตัดเกรดแล้ว ${count} คน`);
}

/**
 * สลับสัดส่วนคะแนน 70/30 และ 80/20
 */
function setGradebookRatio(ratio) {
  appState.gradebookRatio = ratio;
  if (appState.gradebook) {
    Object.keys(appState.gradebook).forEach(key => {
      appState.gradebook[key] = calculateGradeRecord(appState.gradebook[key], ratio);
    });
  }
  appState.isDirty = true;
  saveLocalState();
  renderApp();
  showToast('สลับสัดส่วนคะแนนเป็น ' + ratio + ' และคำนวณใหม่เรียบร้อยแล้ว');
}

/**
 * กำหนดตัวหารคะแนนข้อเขียนปลายภาคจาก Header ของตาราง (เช่น หาร 2 หรือ หาร 3)
 */
function updateGlobalFinalDivisor(newVal) {
  let div = parseFloat(newVal);
  if (isNaN(div) || div <= 0) div = 2;
  if (div > 20) div = 20;

  appState.finalDivisor = div;

  if (appState.gradebook) {
    Object.keys(appState.gradebook).forEach(key => {
      const rec = appState.gradebook[key];
      if (rec) {
        rec.finalDiv = div;
        appState.gradebook[key] = calculateGradeRecord(rec, appState.gradebookRatio || '70/30');
      }
    });
  }

  appState.isDirty = true;
  saveLocalState();
  renderApp();
  showToast(`✅ ปรับตัวหารปลายภาคเป็น ÷ ${div} และคำนวณคะแนนใหม่เรียบร้อย`);
}

/**
 * แป้นพิมพ์ลัด & ระบบเด้งลงอัตโนมัติ (Auto-Advance) เหมือนเช็กส่งงาน / Excel
 * กด Enter หรือ ลูกศรลง ⬇️: บันทึกและเด้งไปคนถัดไปทันที
 * กด ลูกศรขึ้น ⬆️: ย้อนกลับไปคนก่อนหน้า
 */
function handleGradebookKeyDown(e, currentRowIdx, colName) {
  const isDown = e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'Tab' || e.keyCode === 13 || e.keyCode === 40 || e.keyCode === 9;
  const isUp = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) || e.keyCode === 38;

  if (isUp) {
    e.preventDefault();
    if (e.target) {
      e.target.dispatchEvent(new Event('change'));
    }
    navigateToGradebookCell(currentRowIdx - 1, colName);
    return;
  }

  if (isDown) {
    e.preventDefault();
    // สั่งบันทึกค่าในช่องปัจจุบันทันที
    if (e.target) {
      e.target.dispatchEvent(new Event('change'));
    }
    navigateToGradebookCell(currentRowIdx + 1, colName);
  }
}

/**
 * เลื่อน Focus ไปยังเซลล์เป้าหมายในคอลัมน์เดียวกัน พร้อม Auto-select
 */
function navigateToGradebookCell(targetRowIdx, colName) {
  const targetInput = document.querySelector(`.gb-score-input[data-row="${targetRowIdx}"][data-col="${colName}"]`);
  if (targetInput) {
    targetInput.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if (gbfEnabled) {
      const sid = targetInput.getAttribute('data-sid');
      openGradebookFloatingKeypad(targetInput, targetRowIdx, colName, sid);
    } else {
      targetInput.focus();
      if (typeof targetInput.select === 'function') targetInput.select();
    }
  }
}

/**
 * ปรับปรุงคะแนนรายช่องแบบ Real-time
 */
function updateGradebookCell(studentId, field, value) {
  const subj = appState.activeSubject || 'ส31101';
  const room = appState.activeClassroom || 'ม.4/1';
  const sid = String(studentId);
  const key = subj + '_' + room + '_' + sid;

  let rec = appState.gradebook[key];
  if (!rec) {
    const student = appState.students.find(s => String(s.studentId) === sid);
    if (!student) return;
    rec = getOrCreateGradeRecord(student);
  }

  if (field === 'note') {
    rec[field] = value;
  } else {
    rec[field] = value === '' ? 0 : Number(value);
  }

  // คำนวณผลใหม่
  const calculated = calculateGradeRecord(rec, appState.gradebookRatio || '70/30');
  appState.gradebook[key] = calculated;
  appState.isDirty = true;
  saveLocalState();
  updateSyncIndicator('offline');

  // อัปเดต DOM ในแถวนั้นทันทีเพื่อความเร็วและไม่หลุดโฟกัส
  updateGradebookRowDOM(sid, calculated);
  updateGradebookStatsBarDOM();
}

/**
 * อัปเดตเฉพาะเซลล์คำนวณในแถวของนักเรียน
 */
function updateGradebookRowDOM(sid, rec) {
  const row = document.getElementById('gb-row-' + sid);
  if (!row) return;

  const sumPreEl = row.querySelector('.gb-sum-pre');
  const midScoreEl = row.querySelector('.gb-mid-score');
  const sumPostEl = row.querySelector('.gb-sum-post');
  const termScoreEl = row.querySelector('.gb-term-score');
  const finalScoreEl = row.querySelector('.gb-final-score');
  const totalScoreEl = row.querySelector('.gb-total-score');
  const gradeEl = row.querySelector('.gb-grade-val');

  if (sumPreEl) sumPreEl.textContent = rec.sumPre;
  if (midScoreEl) midScoreEl.textContent = rec.midScore;
  if (sumPostEl) sumPostEl.textContent = rec.sumPost;
  if (termScoreEl) termScoreEl.textContent = rec.termScore;
  if (finalScoreEl) finalScoreEl.textContent = rec.finalScore;
  if (totalScoreEl) totalScoreEl.textContent = rec.totalScore;
  if (gradeEl) {
    gradeEl.textContent = rec.grade;
    gradeEl.className = 'gb-grade-val ' + getGradeBadgeClass(rec.grade);
  }
}

function getGradeBadgeClass(grade) {
  if (grade === '4') return 'grade-badge-4';
  if (grade === '3.5' || grade === '3') return 'grade-badge-3';
  if (grade === '2.5' || grade === '2') return 'grade-badge-2';
  if (grade === '1.5' || grade === '1') return 'grade-badge-1';
  if (grade === '0') return 'grade-badge-0';
  return 'grade-badge-res';
}

/**
 * คำนวณและอัปเดตสถิติผลการเรียนด้านบน
 */
function updateGradebookStatsBarDOM() {
  const students = getFilteredStudents();
  const subj = appState.activeSubject || 'ส31101';
  const room = appState.activeClassroom || 'ม.4/1';

  let countAll = students.length;
  let dist = { '4': 0, '3.5': 0, '3': 0, '2.5': 0, '2': 0, '1.5': 0, '1': 0, '0': 0, 'ร': 0, 'มส': 0 };
  let g3Plus = 0;

  students.forEach(s => {
    const key = subj + '_' + room + '_' + String(s.studentId);
    const rec = appState.gradebook[key] || getOrCreateGradeRecord(s);
    const g = String(rec.grade);
    if (dist[g] !== undefined) {
      dist[g]++;
    } else {
      dist['0']++;
    }
    if (g === '4' || g === '3.5' || g === '3') {
      g3Plus++;
    }
  });

  const bar = document.getElementById('gradebook-stats-bar');
  if (!bar) return;

  const pct = (n) => countAll > 0 ? ((n / countAll) * 100).toFixed(1) + '%' : '0%';

  bar.innerHTML = `
    <div class="gb-stats-row-top-unified">
      <span>👥 ทั้งหมด <strong>${countAll}</strong> คน</span>
      <span class="sep-dot">•</span>
      <span class="g3-stat">🌟 เกรด 3+ <strong>${g3Plus}</strong> (${pct(g3Plus)})</span>
      <span class="sep-dot">•</span>
      <span class="${(dist['ร'] + dist['มส']) > 0 ? 'res-stat danger' : 'res-stat'}">ร/มส: <strong>${dist['ร'] + dist['มส']}</strong></span>
    </div>
    <div class="gb-stats-grid-2rows">
      <div class="gb-grid-subrow">
        <span class="gb-grade-chip"><strong class="grade-badge-4">เกรด 4:</strong> ${dist['4']} <small>(${pct(dist['4'])})</small></span>
        <span class="gb-grade-chip"><strong class="grade-badge-3">3.5:</strong> ${dist['3.5']} <small>(${pct(dist['3.5'])})</small></span>
        <span class="gb-grade-chip"><strong class="grade-badge-3">3:</strong> ${dist['3']} <small>(${pct(dist['3'])})</small></span>
        <span class="gb-grade-chip"><strong class="grade-badge-2">2.5:</strong> ${dist['2.5']} <small>(${pct(dist['2.5'])})</small></span>
      </div>
      <div class="gb-grid-subrow">
        <span class="gb-grade-chip"><strong class="grade-badge-2">เกรด 2:</strong> ${dist['2']} <small>(${pct(dist['2'])})</small></span>
        <span class="gb-grade-chip"><strong class="grade-badge-1">1.5:</strong> ${dist['1.5']} <small>(${pct(dist['1.5'])})</small></span>
        <span class="gb-grade-chip"><strong class="grade-badge-1">1:</strong> ${dist['1']} <small>(${pct(dist['1'])})</small></span>
        <span class="gb-grade-chip"><strong class="grade-badge-0">0:</strong> ${dist['0']} <small>(${pct(dist['0'])})</small></span>
      </div>
    </div>
  `;
}

/**
 * เรนเดอร์หน้าจอ ทะเบียนคะแนน & ตัดเกรด (SGS Gradebook View)
 */
function renderGradebook(container) {
  const students = getFilteredStudents();
  const activeSubj = getActiveSubjectObj();
  const ratio = appState.gradebookRatio || '70/30';
  const is8020 = (ratio === '80/20');

  // ห้องเรียนเฉพาะวิชานี้
  const classrooms = getClassroomsForSubject(appState.activeSubject);

  let tableRowsHtml = '';
  if (students.length === 0) {
    tableRowsHtml = `
      <tr>
        <td colspan="19" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📂</div>
          <p>ยังไม่มีรายชื่อนักเรียนในห้อง ${esc(appState.activeClassroom)}</p>
          <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1rem;">
            <button class="btn btn-primary btn-sm" onclick="pullFromGoogleSheets(true)">📥 ดึงข้อมูลจาก Google Sheets</button>
            <button class="btn btn-secondary btn-sm" onclick="switchTab('students')">👥 จัดการรายชื่อนักเรียน</button>
          </div>
        </td>
      </tr>
    `;
  } else {
    const inputAttr = gbfEnabled ? 'readonly inputmode="none"' : 'inputmode="decimal"';
    const noteAttr = gbfEnabled ? 'readonly inputmode="none"' : 'inputmode="text"';

    tableRowsHtml = students.map((s, idx) => {
      const rec = getOrCreateGradeRecord(s);
      return `
        <tr id="gb-row-${esc(s.studentId)}">
          <!-- ข้อมูลนักเรียน (Sticky) -->
          <td class="gb-sticky-no">${esc(s.no || idx + 1)}</td>
          <td class="gb-sticky-id">${esc(s.studentId)}</td>
          <td class="gb-sticky-name" title="${esc(s.fullName)}">${esc(s.fullName)}</td>

          <!-- ก่อนกลางภาค -->
          <td>
            <input type="number" step="0.5" min="0" max="10" class="gb-score-input" 
              data-row="${idx}" data-col="attPre" data-sid="${esc(s.studentId)}"
              tabindex="${1000 + idx}" ${inputAttr} enterkeyhint="next"
              value="${rec.attPre}" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'attPre')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'attPre', this.value)" 
              title="เวลาเรียนก่อนกลาง (เต็ม 10)">
          </td>
          <td>
            <input type="number" step="0.5" min="0" max="30" class="gb-score-input" 
              data-row="${idx}" data-col="workPre" data-sid="${esc(s.studentId)}"
              tabindex="${1100 + idx}" ${inputAttr} enterkeyhint="next"
              value="${rec.workPre}" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'workPre')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'workPre', this.value)" 
              title="คะแนนเก็บงานก่อนกลาง">
          </td>
          <td class="td-calc gb-sum-pre">${rec.sumPre}</td>

          <!-- กลางภาค (ตัดตัวหารออกแล้ว: ข้อเขียนหารมาแล้ว + คะแนนช่วย) -->
          <td>
            <input type="number" step="0.5" min="0" max="60" class="gb-score-input" 
              data-row="${idx}" data-col="midRaw" data-sid="${esc(s.studentId)}"
              tabindex="${1200 + idx}" ${inputAttr} enterkeyhint="next"
              value="${rec.midRaw}" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'midRaw')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'midRaw', this.value)" 
              title="สอบกลางภาค (คะแนนจริงที่หารแล้ว)">
          </td>
          <td>
            <input type="number" step="0.5" min="0" max="30" class="gb-score-input mini" 
              data-row="${idx}" data-col="midHelp" data-sid="${esc(s.studentId)}"
              tabindex="${1300 + idx}" ${inputAttr} enterkeyhint="next"
              value="${rec.midHelp || 0}" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'midHelp')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'midHelp', this.value)" 
              title="คะแนนช่วย / สอบแก้ตัว">
          </td>
          <td class="td-calc gb-mid-score" style="color: #92400E; font-weight: 700;">${rec.midScore}</td>

          <!-- หลังกลางภาค -->
          <td>
            <input type="number" step="0.5" min="0" max="10" class="gb-score-input" 
              data-row="${idx}" data-col="attPost" data-sid="${esc(s.studentId)}"
              tabindex="${1400 + idx}" ${inputAttr} enterkeyhint="next"
              value="${rec.attPost}" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'attPost')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'attPost', this.value)" 
              title="เวลาเรียนหลังกลาง (เต็ม 10)">
          </td>
          <td>
            <input type="number" step="0.5" min="0" max="30" class="gb-score-input" 
              data-row="${idx}" data-col="workPost" data-sid="${esc(s.studentId)}"
              tabindex="${1500 + idx}" ${inputAttr} enterkeyhint="next"
              value="${rec.workPost}" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'workPost')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'workPost', this.value)" 
              title="คะแนนเก็บงานหลังกลาง">
          </td>
          <td class="td-calc gb-sum-post">${rec.sumPost}</td>

          <!-- รวมระหว่างภาค -->
          <td class="td-term-total gb-term-score">${rec.termScore}</td>

          <!-- ปลายภาค (ตัดช่องตัวหารออก โดยใช้ตัวหารจากหัวข้อตาราง) -->
          <td>
            <input type="number" step="0.5" min="0" max="60" class="gb-score-input" 
              data-row="${idx}" data-col="finalRaw" data-sid="${esc(s.studentId)}"
              tabindex="${1600 + idx}" ${inputAttr} enterkeyhint="next"
              value="${rec.finalRaw}" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'finalRaw')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'finalRaw', this.value)" 
              title="สอบปลายภาค (ข้อเขียนดิบ)">
          </td>
          <td>
            <input type="number" step="0.5" min="0" max="30" class="gb-score-input mini" 
              data-row="${idx}" data-col="finalHelp" data-sid="${esc(s.studentId)}"
              tabindex="${1700 + idx}" ${inputAttr} enterkeyhint="next"
              value="${rec.finalHelp || 0}" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'finalHelp')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'finalHelp', this.value)" 
              title="คะแนนช่วย / สอบแก้ตัว">
          </td>
          <td class="td-calc gb-final-score" style="color: #6B21A8; font-weight: 700;">${rec.finalScore}</td>

          <!-- รวม 100 คะแนน -->
          <td class="td-grand-total gb-total-score">${rec.totalScore}</td>

          <!-- ผลการเรียน & ช่องหมายเหตุสำหรับกรอก ร / มส -->
          <td class="td-grade-val">
            <span class="gb-grade-val ${getGradeBadgeClass(rec.grade)}">${rec.grade}</span>
          </td>
          <td class="td-note-cell">
            <input type="text" class="gb-score-input gb-note-input" 
              data-row="${idx}" data-col="note" data-sid="${esc(s.studentId)}"
              tabindex="${1800 + idx}" ${noteAttr} enterkeyhint="next"
              value="${esc(rec.note || '')}" 
              placeholder="" 
              onfocus="this.select()"
              onkeydown="handleGradebookKeyDown(event, ${idx}, 'note')"
              onchange="updateGradebookCell('${esc(s.studentId)}', 'note', this.value)"
              title="หากติด ร หรือ มส ให้พิมพ์ 'ร' หรือ 'มส' ในช่องนี้ (หากปกติให้เว้นว่างไว้)">
          </td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div class="gradebook-container">
      <!-- Gradebook Toolbar -->
      <div class="gradebook-toolbar">
        <div class="ratio-toolbar-row">
          <div class="ratio-switcher">
            <button class="ratio-btn ${!is8020 ? 'active' : ''}" onclick="setGradebookRatio('70/30')">70/30</button>
            <button class="ratio-btn ${is8020 ? 'active' : ''}" onclick="setGradebookRatio('80/20')">80/20</button>
          </div>
          <span class="ratio-pill-hint">
            ${is8020 ? 'ระหว่าง 80 + ปลาย 20' : 'ระหว่าง 70 + ปลาย 30'}
          </span>
        </div>

        <div class="gb-action-btn-group">
          <button type="button" class="btn btn-secondary btn-sm ${gbfEnabled ? 'active' : ''}" onclick="toggleGradebookFloatingMode()" id="gb-toggle-keypad-btn" title="เปิด/ปิด แป้นพิมพ์คะแนนลอยบนไอแพดและแท็บเล็ต (ปิดแป้นพิมพ์ระบบไม่ให้เด้งบังจอ)">
            ${gbfEnabled ? '📱 แป้นลอย (ON)' : '⌨️ แป้นระบบ (OFF)'}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="syncWorkScoresFromCheckWork()" title="ดึงคะแนนรวมจากภาระงานที่เช็คมาใส่ช่องงานเก็บก่อนกลางภาคอัตโนมัติ">
            <span>🔄</span> ดึงคะแนนเช็คงาน
          </button>
          <button class="btn btn-primary btn-sm" onclick="saveGradebookToSheet()" title="บันทึกทะเบียนคะแนนและผลการเรียนห้อง ${esc(appState.activeClassroom)} ลง Google Sheets (ชีท Gradebook)">
            <span>💾</span> บันทึก ${esc(appState.activeClassroom)}
          </button>

          <button class="btn btn-secondary btn-sm" onclick="exportGradebookSGS()">
            <span>📤</span> ส่งออก SGS (CSV)
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.print()">
            <span>🖨️</span> พิมพ์ ปพ.5
          </button>
        </div>
      </div>

      <!-- Live Grade Stats Bar -->
      <div class="gradebook-stats-bar" id="gradebook-stats-bar">
        <!-- Rendered by updateGradebookStatsBarDOM() -->
      </div>

      <!-- Panoramic Landscape Grade Table -->
      <div class="gradebook-table-wrapper">
        <table class="gb-table">
          <thead>
            <tr>
              <th colspan="3" class="th-sec-student">ข้อมูลนักเรียน</th>
              <th colspan="3" class="th-sec-pre">คะแนนเก็บก่อนกลางภาค</th>
              <th colspan="3" class="th-sec-mid">สอบกลางภาค</th>
              <th colspan="3" class="th-sec-post">คะแนนเก็บหลังกลางภาค</th>
              <th colspan="1" class="th-sec-term">ระหว่างภาค</th>
              <th colspan="3" class="th-sec-final">
                <div class="final-header-with-div">
                  <span>สอบปลายภาค</span>
                  <span class="final-div-badge" title="กำหนดตัวหารคะแนนข้อเขียนปลายภาค เช่น หาร 2 หรือ หาร 3">
                    <span>(÷</span>
                    <input type="number" step="0.5" min="1" max="20" class="gb-div-header-input"
                      value="${appState.finalDivisor || 2}"
                      onchange="updateGlobalFinalDivisor(this.value)"
                      onfocus="this.select()"
                      title="กรอกตัวหาร เช่น 2 หรือ 3 ระบบจะนำไปหารคะแนนข้อเขียนให้อัตโนมัติ">
                    <span>)</span>
                  </span>
                </div>
              </th>
              <th colspan="1" class="th-sec-total">รวม 100</th>
              <th colspan="2" class="th-sec-grade">ผลการเรียน</th>
            </tr>
            <tr>
              <!-- ข้อมูลนักเรียน -->
              <th class="gb-sticky-no">เลขที่</th>
              <th class="gb-sticky-id">รหัส</th>
              <th class="gb-sticky-name">ชื่อ - สกุล</th>

              <!-- ก่อนกลางภาค -->
              <th>มา (10)</th>
              <th>งาน</th>
              <th style="font-weight: 700;">รวม</th>

              <!-- สอบกลางภาค (ไม่มีตัวหารแล้ว) -->
              <th>ข้อเขียน</th>
              <th>คะแนนช่วย</th>
              <th style="font-weight: 700;">สรุปกลาง</th>

              <!-- หลังกลางภาค -->
              <th>มา (10)</th>
              <th>งาน</th>
              <th style="font-weight: 700;">รวม</th>

              <!-- รวมระหว่างภาค -->
              <th style="font-weight: 800; color: #1E3A8A;">รวม (${is8020 ? 80 : 70})</th>

              <!-- สอบปลายภาค (ตัดช่องตัวหารออก โดยนำตัวหารไปไว้ที่หัวข้อตาราง) -->
              <th>ข้อเขียน</th>
              <th>คะแนนช่วย</th>
              <th style="font-weight: 700;">สรุปปลาย (${is8020 ? 20 : 30})</th>

              <!-- รวมทั้งสิ้น -->
              <th style="font-weight: 900; color: #166534;">รวม (100)</th>

              <!-- เกรด & ร/มส -->
              <th>เกรด</th>
              <th class="gb-th-note" title="หากติด ร หรือ มส ให้พิมพ์ในช่องนี้">ร / มส</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;

  updateGradebookStatsBarDOM();
}

function autoDismissNavHint() {
  if (window._navHintTimer) clearTimeout(window._navHintTimer);
  window._navHintTimer = setTimeout(() => {
    closeGradebookNavHint();
  }, 7000);
}

function closeGradebookNavHint() {
  const hint = document.getElementById('gb-nav-hint');
  if (hint) {
    hint.style.opacity = '0';
    hint.style.transform = 'translate(-50%, -15px)';
    setTimeout(() => { if (hint && hint.parentNode) hint.remove(); }, 350);
  }
}

/**
 * สลับห้องเรียนในหน้าทะเบียนคะแนน
 */
function switchGradebookClassroom(classroom) {
  appState.activeClassroom = classroom;
  saveLocalState();
  renderApp();
}

/**
 * บันทึกคะแนนทั้งหมดของห้องนี้ลง Google Sheets ในชีท Gradebook
 */
async function saveGradebookToSheet() {
  if (!appState.settings.gasUrl) {
    showModernAlert({
      title: 'ยังไม่ได้ระบุ Web App URL',
      message: 'โปรดระบุ Google Apps Script Web App API URL ในหน้าตั้งค่าก่อนบันทึกลงชีท',
      icon: '⚙️'
    });
    return;
  }

  const students = getFilteredStudents();
  if (students.length === 0) {
    showToast('⚠️ ไม่พบข้อมูลนักเรียนในห้องนี้');
    return;
  }

  showToast(`⏳ กำลังบันทึกทะเบียนคะแนนห้อง ${appState.activeClassroom} ลง Google Sheets...`);
  updateSyncIndicator('syncing');

  const recordsToSave = students.map(s => getOrCreateGradeRecord(s));

  try {
    const res = await fetch(appState.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveGradebook',
        token: appState.settings.apiToken || '',
        records: recordsToSave
      })
    });

    const result = await res.json();
    if (result.success) {
      appState.isDirty = false;
      saveLocalState();
      updateSyncIndicator('saved');
      showToast(`✅ บันทึกคะแนนห้อง ${appState.activeClassroom} (${recordsToSave.length} คน) ลง Google Sheets (ชีท Gradebook) สำเร็จ`);
    } else {
      updateSyncIndicator('offline');
      showModernAlert({
        title: 'บันทึก Sheets ไม่สำเร็จ',
        message: 'ไม่สามารถบันทึกลง Google Sheets ได้: ' + (result.error || result.message || 'โปรดตรวจสอบสิทธิ์การเข้าถึง'),
        icon: '⚠️',
        buttonClass: 'btn-danger'
      });
    }
  } catch (err) {
    updateSyncIndicator('offline');
    console.error('Save gradebook error:', err);
    showModernAlert({
      title: 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
      message: 'ไม่สามารถเชื่อมต่อกับ Google Sheets ได้: ' + err.message,
      icon: '⚠️',
      buttonClass: 'btn-danger'
    });
  }
}

/**
 * ส่งออกทะเบียนคะแนนเป็น CSV ที่เข้ากันได้กับ SGS และ Excel
 */
function exportGradebookSGS() {
  const students = getFilteredStudents();
  if (students.length === 0) {
    showToast('⚠️ ไม่มีข้อมูลนักเรียนสำหรับส่งออก');
    return;
  }

  const subj = getActiveSubjectObj();
  const room = appState.activeClassroom;
  const ratio = appState.gradebookRatio || '70/30';

  const headers = [
    'เลขที่', 'รหัสประจำตัว', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'วิชา',
    'มา_ก่อนกลาง', 'งาน_ก่อนกลาง', 'รวมก่อนกลาง',
    'กลางภาค_ข้อเขียน', 'กลางภาค_ช่วย', 'สรุปกลางภาค',
    'มา_หลังกลาง', 'งาน_หลังกลาง', 'รวมหลังกลาง',
    'รวมระหว่างภาค',
    'ปลายภาค_ข้อเขียน', 'ปลายภาค_ตัวหาร', 'ปลายภาค_ช่วย', 'สรุปปลายภาค',
    'คะแนนรวม100', 'เกรด', 'สถานะ_SGS', 'หมายเหตุ'
  ];

  const rows = [headers];

  students.forEach(s => {
    const rec = getOrCreateGradeRecord(s);
    rows.push([
      rec.no || s.no,
      `="${rec.studentId}"`,
      rec.fullName,
      room,
      subj.code,
      rec.attPre,
      rec.workPre,
      rec.sumPre,
      rec.midRaw,
      rec.midHelp,
      rec.midScore,
      rec.attPost,
      rec.workPost,
      rec.sumPost,
      rec.termScore,
      rec.finalRaw,
      rec.finalDiv,
      rec.finalHelp,
      rec.finalScore,
      rec.totalScore,
      rec.grade,
      rec.sgsStatus,
      rec.note || ''
    ]);
  });

  const csvContent = '\uFEFF' + rows.map(r => 
    r.map(cell => {
      let str = String(cell === null || cell === undefined ? '' : cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        str = '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  ).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ปพ5_SGS_${subj.code}_${room}_สัดส่วน${ratio.replace('/', '-')}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 ส่งออกไฟล์คะแนน SGS เรียบร้อยแล้ว');
}

/**
 * โหลดข้อมูลต้นฉบับ 434 คนจากไฟล์ backup_grades_2569.json ของโรงเรียนธาตุพนม
 */
async function loadOriginalSchoolGrades() {
  showModernConfirm({
    title: 'โหลดข้อมูลผลการเรียนต้นฉบับ?',
    subtitle: 'ต้องการโหลดข้อมูลผลการเรียนต้นฉบับ (ม.4 ครบทั้ง 11 ห้อง 434 คน) เข้าสู่ระบบใช่หรือไม่?\n\nข้อมูลจะถูกเชื่อมต่อและแสดงผลในทุกห้องทันที',
    icon: '📊',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    iconBorder: 'rgba(59, 130, 246, 0.25)',
    confirmText: '📥 ยืนยันโหลดข้อมูล',
    confirmClass: 'btn-primary',
    cancelText: 'ยกเลิก',
    onConfirm: async () => {
      try {
        showToast('⏳ กำลังโหลดข้อมูลต้นฉบับ...');
        const res = await fetch('./data/backup_grades_2569.json');
        if (!res.ok) throw new Error('ไม่พบไฟล์ข้อมูล backup_grades_2569.json');
        const records = await res.json();

        if (!Array.isArray(records) || records.length === 0) {
          throw new Error('ไฟล์ข้อมูลว่างเปล่า');
        }

        if (!appState.gradebook) appState.gradebook = {};

        const existingIds = new Set(appState.students.map(s => String(s.studentId)));
        const roomSet = new Set(appState.settings.classrooms || DEFAULT_CLASSROOMS);

        records.forEach(r => {
          const room = r.room || 'ม.4/1';
          roomSet.add(room);

          const sid = String(r.studentId);
          if (!existingIds.has(sid)) {
            appState.students.push({
              no: Number(r.no) || 1,
              studentId: sid,
              fullName: r.name,
              classroom: room,
              status: 'ปกติ'
            });
            existingIds.add(sid);
          }

          const subj = appState.activeSubject || 'ส31101';
          const key = subj + '_' + room + '_' + sid;

          const rawRec = {
            subject: subj,
            classroom: room,
            studentId: sid,
            no: Number(r.no) || 1,
            fullName: r.name,
            attPre: Number(r.attPre) || 0,
            workPre: Number(r.workPre) || 0,
            sumPre: Number(r.sumPre) || 0,
            midRaw: Number(r.midRaw || 0),
            midDiv: 1,
            midHelp: Number(r.midHelp || 0),
            attPost: Number(r.attPost) || 0,
            workPost: Number(r.workPost) || 0,
            sumPost: Number(r.sumPost) || 0,
            finalRaw: Number(r.finalRaw || 0),
            finalDiv: appState.finalDivisor || 2,
            finalHelp: Number(r.finalHelp || 0),
            note: r.note || (r.sgsStatus === 'ร' ? 'ร' : (r.sgsStatus === 'มส' ? 'มส' : ''))
          };
          appState.gradebook[key] = calculateGradeRecord(rawRec, appState.gradebookRatio || '70/30');
        });

        appState.settings.classrooms = sortClassroomNames(Array.from(roomSet));
        appState.isDirty = true;
        saveLocalState();
        renderApp();
        showToast('🎉 นำเข้าข้อมูลนักเรียนและคะแนนครบ 434 คนเรียบร้อยแล้ว!');
      } catch (err) {
        console.error('Error loading backup grades:', err);
        showModernAlert({
          title: 'ไม่สามารถโหลดไฟล์ข้อมูลต้นฉบับได้',
          message: err.message,
          icon: '⚠️',
          buttonClass: 'btn-danger'
        });
      }
    }
  });
}


// ==========================================================================
// Floating Scoring Keypad Bar สำหรับ iPad, Tablet และมือถือ (ตัดเกรด)
// ==========================================================================

const GBF_COL_NAMES = {
  attPre: 'จิตพิสัย (ก่อนกลาง)',
  workPre: 'คะแนนเก็บ (ก่อนกลาง)',
  midRaw: 'สอบกลางภาค (ข้อเขียน)',
  midHelp: 'กลางภาค (คะแนนช่วย)',
  attPost: 'จิตพิสัย (หลังกลาง)',
  workPost: 'คะแนนเก็บ (หลังกลาง)',
  finalRaw: 'สอบปลายภาค (ข้อเขียน)',
  finalHelp: 'ปลายภาค (คะแนนช่วย)',
  note: 'หมายเหตุ (ร / มส)'
};

let gbfActiveInput = null;
let gbfRow = 0;
let gbfCol = '';
let gbfSid = '';
let gbfJustFocused = false;
let gbfEnabled = (localStorage.getItem('sg_keypad_mode') !== 'system');

function toggleGradebookFloatingMode() {
  gbfEnabled = !gbfEnabled;
  localStorage.setItem('sg_keypad_mode', gbfEnabled ? 'floating' : 'system');
  const btn = document.getElementById('gb-toggle-keypad-btn');
  if (btn) {
    btn.classList.toggle('active', gbfEnabled);
    btn.innerHTML = gbfEnabled ? '📱 แป้นลอย (ON)' : '⌨️ แป้นระบบ (OFF)';
  }
  
  // อัปเดต attribute ของทุกช่องในตารางตัดเกรดทันที
  document.querySelectorAll('.gb-score-input').forEach(inp => {
    if (gbfEnabled) {
      inp.setAttribute('readonly', 'readonly');
      inp.setAttribute('inputmode', 'none');
    } else {
      inp.removeAttribute('readonly');
      if (inp.classList.contains('gb-note-input')) {
        inp.setAttribute('inputmode', 'text');
      } else {
        inp.setAttribute('inputmode', 'decimal');
      }
    }
  });

  if (!gbfEnabled) {
    closeGradebookFloatingKeypad();
    showToast('สลับใช้แป้นพิมพ์พื้นฐานของระบบแล้ว (แตะช่องเพื่อพิมพ์ด้วยแป้นพิมพ์ปกติ)', 'info');
  } else {
    showToast('เปิดใช้แป้นกดคะแนนลอยแล้ว (ปิดแป้นพิมพ์ระบบไม่ให้เด้งบังจอ)', 'success');
  }
}

function openGradebookFloatingKeypad(input, rowIdx, colName, studentId) {
  if (!gbfEnabled) return;
  if (appState.currentTab !== 'gradebook') return;

  const keypad = document.getElementById('gb-floating-keypad');
  if (!keypad) return;

  if (gbfActiveInput && gbfActiveInput !== input) {
    gbfActiveInput.classList.remove('gbf-cell-active');
  }

  gbfActiveInput = input;
  gbfRow = rowIdx;
  gbfCol = colName;
  gbfSid = studentId;
  gbfJustFocused = true;

  input.classList.add('gbf-cell-active');

  const s = appState.students.find(st => String(st.studentId) === String(studentId)) || { no: rowIdx + 1, fullName: 'นักเรียน' };

  const noElem = document.getElementById('gbf-no');
  const nameElem = document.getElementById('gbf-name');
  const colElem = document.getElementById('gbf-col');
  const valElem = document.getElementById('gbf-val-display');

  if (noElem) noElem.textContent = 'เลขที่ ' + (s.no || (rowIdx + 1));
  if (nameElem) nameElem.textContent = s.fullName || '';
  if (colElem) colElem.textContent = GBF_COL_NAMES[colName] || colName;
  if (valElem) valElem.textContent = (input.value === '' ? '-' : input.value);

  renderFloatingKeypadButtons(colName);
  keypad.style.display = 'block';
}

function renderFloatingKeypadButtons(colName) {
  const actionsContainer = document.getElementById('gbf-actions');
  if (!actionsContainer) return;

  if (colName === 'note') {
    actionsContainer.innerHTML = `
      <div class="gbf-row-note">
        <button type="button" class="gbf-btn gbf-btn-r" onclick="gbfSetNote('ร')">ติด ร</button>
        <button type="button" class="gbf-btn gbf-btn-ms" onclick="gbfSetNote('มส')">ติด มส</button>
        <button type="button" class="gbf-btn gbf-btn-clear" onclick="gbfSetNote('')">ล้าง (ปกติ)</button>
        <button type="button" class="gbf-btn gbf-btn-prev" onclick="gbfNavigate(-1)" title="คนก่อนหน้า">⬆️ ก่อน</button>
        <button type="button" class="gbf-btn gbf-btn-ok" onclick="gbfConfirmAndNext()" title="บันทึกและลงคนถัดไป">ตกลง ⬇️</button>
      </div>
    `;
    return;
  }

  let presets = [0, 5, 10, 15, 20, 25, 30];
  if (colName === 'attPre' || colName === 'attPost') {
    presets = [0, 5, 8, 9, 10];
  } else if (colName === 'midHelp' || colName === 'finalHelp') {
    presets = [0, 1, 2, 3, 5, 10];
  } else if (colName === 'midRaw' || colName === 'finalRaw') {
    presets = [0, 10, 15, 20, 25, 30, 40, 50, 60];
  }

  actionsContainer.innerHTML = `
    <div class="gbf-row-presets">
      <span class="gbf-row-label">ด่วน:</span>
      <div class="gbf-presets-list">
        ${presets.map(p => `
          <button type="button" class="gbf-btn gbf-preset-btn" onclick="gbfSetScore(${p})">${p}</button>
        `).join('')}
      </div>
      <button type="button" class="gbf-btn gbf-btn-del" onclick="gbfBackspace()" title="ลบตัวเลขหลัง">⌫</button>
      <button type="button" class="gbf-btn gbf-btn-clear" onclick="gbfClear()" title="ล้างค่า">ล้าง</button>
    </div>
    <div class="gbf-row-digits">
      <div class="gbf-digits-strip">
        ${['1','2','3','4','5','6','7','8','9','0','.'].map(d => `
          <button type="button" class="gbf-btn gbf-digit-btn" onclick="gbfAppendDigit('${d}')">${d}</button>
        `).join('')}
      </div>
      <div class="gbf-nav-strip">
        <button type="button" class="gbf-btn gbf-btn-prev" onclick="gbfNavigate(-1)" title="คนก่อนหน้า">⬆️ ก่อน</button>
        <button type="button" class="gbf-btn gbf-btn-ok" onclick="gbfConfirmAndNext()" title="บันทึกและเลื่อนลงคนถัดไป">ตกลง ⬇️</button>
      </div>
    </div>
  `;
}

function gbfAppendDigit(digit) {
  if (!gbfActiveInput) return;
  let cur = String(gbfActiveInput.value || '');
  if (gbfJustFocused) {
    cur = digit === '.' ? '0.' : digit;
    gbfJustFocused = false;
  } else {
    if (digit === '.' && cur.includes('.')) return;
    cur += digit;
  }
  gbfActiveInput.value = cur;
  const valElem = document.getElementById('gbf-val-display');
  if (valElem) valElem.textContent = cur;
  updateGradebookCell(gbfSid, gbfCol, cur);
}

function gbfBackspace() {
  if (!gbfActiveInput) return;
  let cur = String(gbfActiveInput.value || '');
  cur = cur.slice(0, -1);
  gbfActiveInput.value = cur;
  const valElem = document.getElementById('gbf-val-display');
  if (valElem) valElem.textContent = cur === '' ? '-' : cur;
  updateGradebookCell(gbfSid, gbfCol, cur);
  gbfJustFocused = false;
}

function gbfClear() {
  if (!gbfActiveInput) return;
  gbfActiveInput.value = '';
  const valElem = document.getElementById('gbf-val-display');
  if (valElem) valElem.textContent = '-';
  updateGradebookCell(gbfSid, gbfCol, '');
  gbfJustFocused = false;
}

function gbfSetScore(score) {
  if (!gbfActiveInput) return;
  gbfActiveInput.value = score;
  const valElem = document.getElementById('gbf-val-display');
  if (valElem) valElem.textContent = score;
  updateGradebookCell(gbfSid, gbfCol, score);
  gbfJustFocused = false;
}

function gbfSetNote(val) {
  if (!gbfActiveInput) return;
  gbfActiveInput.value = val;
  const valElem = document.getElementById('gbf-val-display');
  if (valElem) valElem.textContent = val === '' ? '(ปกติ)' : val;
  updateGradebookCell(gbfSid, 'note', val);
  gbfJustFocused = false;
}

function gbfConfirmAndNext() {
  if (!gbfActiveInput) return;
  gbfActiveInput.dispatchEvent(new Event('change'));
  const nextRow = gbfRow + 1;
  const nextInput = document.querySelector(`.gb-score-input[data-row="${nextRow}"][data-col="${gbfCol}"]`);
  if (nextInput) {
    navigateToGradebookCell(nextRow, gbfCol);
  } else {
    showToast('กรอกครบนักเรียนคนสุดท้ายในคอลัมน์นี้แล้ว 🎉', 'success');
  }
}

function gbfNavigate(dir) {
  const targetRow = gbfRow + dir;
  navigateToGradebookCell(targetRow, gbfCol);
}

function closeGradebookFloatingKeypad() {
  const keypad = document.getElementById('gb-floating-keypad');
  if (keypad) keypad.style.display = 'none';
  if (gbfActiveInput) {
    gbfActiveInput.classList.remove('gbf-cell-active');
    gbfActiveInput = null;
  }
}

// Global listener สำหรับตรวจจับการแตะช่องในตารางตัดเกรด เพื่อเปิด Floating Keypad Bar
function handleGradebookCellInteraction(e) {
  if (appState.currentTab !== 'gradebook' || !gbfEnabled) return;
  const input = e.target && e.target.closest ? e.target.closest('.gb-score-input') : e.target;
  if (input && input.classList && input.classList.contains('gb-score-input')) {
    const row = parseInt(input.getAttribute('data-row'));
    const col = input.getAttribute('data-col');
    const sid = input.getAttribute('data-sid');
    if (!isNaN(row) && col && sid) {
      openGradebookFloatingKeypad(input, row, col, sid);
    }
  }
}

document.addEventListener('focusin', handleGradebookCellInteraction);
document.addEventListener('click', handleGradebookCellInteraction);

// Listener สำหรับคีย์บอร์ดจริง (เช่น Magic Keyboard, Laptop) ให้พิมพ์ตัวเลขและกด Enter ได้ลื่นไหล
document.addEventListener('keydown', (e) => {
  if (!gbfEnabled || !gbfActiveInput || appState.currentTab !== 'gradebook') return;

  if (document.activeElement && document.activeElement !== gbfActiveInput && 
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') &&
      !document.activeElement.classList.contains('gb-score-input')) {
    return;
  }

  if (gbfCol === 'note') {
    if (e.key === 'r' || e.key === 'R' || e.key === 'พ' || e.key === 'ร') {
      gbfSetNote('ร');
      e.preventDefault();
    } else if (e.key === 'm' || e.key === 'M' || e.key === 'ม') {
      gbfSetNote('มส');
      e.preventDefault();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      gbfSetNote('');
      e.preventDefault();
    } else if (e.key === 'Enter') {
      gbfConfirmAndNext();
      e.preventDefault();
    }
    return;
  }

  if (e.key >= '0' && e.key <= '9') {
    gbfAppendDigit(e.key);
    e.preventDefault();
  } else if (e.key === '.') {
    gbfAppendDigit('.');
    e.preventDefault();
  } else if (e.key === 'Backspace') {
    gbfBackspace();
    e.preventDefault();
  } else if (e.key === 'Delete') {
    gbfClear();
    e.preventDefault();
  } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
    gbfConfirmAndNext();
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    gbfNavigate(-1);
    e.preventDefault();
  }
});
