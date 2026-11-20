/**
 * ระบบบันทึกส่งงานนักเรียน (Student Assignment & Grading System)
 * Backend Google Apps Script Web App API
 * รองรับ ม.4 (11 ห้อง) และ ม.5 (2 ห้อง) รวม 13 ห้องเรียน และ 5 รายวิชา
 */

const SHEET_SETTINGS = 'Settings';
const SHEET_STUDENTS = 'Students';
const SHEET_ASSIGNMENTS = 'Assignments';
const SHEET_SUBMISSIONS = 'Submissions';

// ห้องเรียนทั้งหมด 13 ห้อง (ม.4 จำนวน 11 ห้อง, ม.5 จำนวน 2 ห้อง)
const DEFAULT_CLASSROOMS = [
  'ม.4/1', 'ม.4/2', 'ม.4/3', 'ม.4/4', 'ม.4/5', 'ม.4/6',
  'ม.4/7', 'ม.4/8', 'ม.4/9', 'ม.4/10', 'ม.4/11',
  'ม.5/1', 'ม.5/2'
];

// รายวิชาที่สอน 5 รายวิชา
const DEFAULT_SUBJECTS = [
  { id: 'SUB01', code: 'ส31101', name: 'สังคมศึกษา 1 (ม.4)' },
  { id: 'SUB02', code: 'ส31102', name: 'ประวัติศาสตร์ไทย 1 (ม.4)' },
  { id: 'SUB03', code: 'ส30226', name: 'กฎหมายที่ประชาชนควรรู้ (ม.ปลาย)' },
  { id: 'SUB04', code: 'ส32101', name: 'สังคมศึกษา 3 (ม.5)' },
  { id: 'SUB05', code: 'ส32102', name: 'ประวัติศาสตร์ไทย 2 (ม.5)' }
];

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📚 ระบบส่งงานนักเรียน')
    .addItem('⚙️ ตั้งค่าชีทเริ่มต้น (Init Sheets)', 'initSheets')
    .addItem('✨ ใส่ข้อมูลตัวอย่าง (ม.4 & ม.5)', 'seedSampleData')
    .addToUi();
}

function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetsExist(ss);
  SpreadsheetApp.getUi().alert('⚙️ ตั้งค่าชีทเริ่มต้นและโครงสร้างตารางเรียบร้อยแล้ว');
}

/**
 * ฟังก์ชันตรวจสอบความปลอดภัยด้วย API Token
 */
function verifyToken_(token) {
  const scriptProp = PropertiesService.getScriptProperties();
  const expectedToken = scriptProp.getProperty('API_TOKEN');
  if (!expectedToken || expectedToken.trim() === '') return true; // ยังไม่ได้ตั้ง Token ถือว่าเปิดให้ใช้งานได้
  return token && String(token).trim() === expectedToken.trim();
}

/**
 * จัดการ CORS และ Output แบบ JSON
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle HTTP GET Requests
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getInitialData';
    const token = e && e.parameter && e.parameter.token;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    ensureSheetsExist(ss);

    if (action !== 'ping' && !verifyToken_(token)) {
      return createJsonResponse({ success: false, error: 'Unauthorized: รหัสความปลอดภัย (API Token) ไม่ถูกต้อง' });
    }

    if (action === 'getInitialData') {
      const data = fetchAllData(ss);
      return createJsonResponse({ success: true, data: data });
    }

    if (action === 'ping') {
      return createJsonResponse({ success: true, message: 'API is running', timestamp: new Date().toISOString() });
    }

    return createJsonResponse({ success: false, message: 'Unknown action: ' + action });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handle HTTP POST Requests with LockService
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    return createJsonResponse({ success: false, error: 'ระบบกำลังประมวลผลคำขออื่น โปรดลองใหม่อีกครั้ง' });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetsExist(ss);

    let payload = {};
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = e.parameter || {};
      }
    } else {
      payload = e.parameter || {};
    }

    const action = payload.action;
    const token = payload.token || (e && e.parameter && e.parameter.token);

    if (action !== 'setApiToken' && !verifyToken_(token)) {
      return createJsonResponse({ success: false, error: 'Unauthorized: รหัสความปลอดภัย (API Token) ไม่ถูกต้อง' });
    }

    if (action === 'setApiToken') {
      const scriptProp = PropertiesService.getScriptProperties();
      const currentToken = scriptProp.getProperty('API_TOKEN') || '';
      const oldToken = payload.oldToken || '';
      const newToken = payload.newToken || '';

      if (currentToken && currentToken !== oldToken) {
        return createJsonResponse({ success: false, error: 'รหัสผ่าน Token เดิมไม่ถูกต้อง' });
      }

      scriptProp.setProperty('API_TOKEN', newToken.trim());
      return createJsonResponse({ success: true, message: 'ตั้งค่า Token ความปลอดภัยเรียบร้อยแล้ว' });
    }

    if (action === 'batchSaveSubmissions') {
      const results = handleBatchSaveSubmissions(ss, payload.submissions || []);
      return createJsonResponse({ success: true, count: results.length });
    }

    if (action === 'saveSubmission') {
      handleSaveSingleSubmission(ss, payload);
      return createJsonResponse({ success: true });
    }

    if (action === 'createAssignment') {
      const newAssignment = handleCreateAssignment(ss, payload);
      return createJsonResponse({ success: true, assignment: newAssignment });
    }

    if (action === 'deleteAssignment') {
      handleDeleteAssignment(ss, payload.id);
      return createJsonResponse({ success: true });
    }

    if (action === 'updateSettings') {
      handleUpdateSettings(ss, payload.settings || {});
      return createJsonResponse({ success: true });
    }

    if (action === 'syncFullState') {
      if (payload.settings) handleUpdateSettings(ss, payload.settings);
      if (payload.students && payload.students.length > 0) handleSaveStudentList(ss, payload.students);
      if (payload.assignments && payload.assignments.length > 0) handleSaveAssignmentsList(ss, payload.assignments);
      if (payload.submissions && payload.submissions.length > 0) handleBatchSaveSubmissions(ss, payload.submissions);
      return createJsonResponse({ success: true, message: 'ซิงค์ข้อมูลทั้งหมดสำเร็จ' });
    }

    if (action === 'saveAssignmentsList') {
      handleSaveAssignmentsList(ss, payload.assignments || []);
      return createJsonResponse({ success: true });
    }

    // ฟังก์ชันนำเข้านักเรียนแบบกลุ่ม (รองรับแยกห้อง หรือเขียนทับเฉพาะห้อง)
    if (action === 'importStudents') {
      const count = handleImportStudents(ss, payload);
      return createJsonResponse({ success: true, count: count });
    }

    if (action === 'saveStudentList') {
      handleSaveStudentList(ss, payload.students || []);
      return createJsonResponse({ success: true });
    }

    return createJsonResponse({ success: false, message: 'Invalid action: ' + action });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงข้อมูลรวมทั้งหมด
 */
function fetchAllData(ss) {
  const settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  const studentsSheet = ss.getSheetByName(SHEET_STUDENTS);
  const assignmentsSheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  const submissionsSheet = ss.getSheetByName(SHEET_SUBMISSIONS);

  // 1. Settings
  const settings = {
    schoolName: 'โรงเรียนตัวอย่าง',
    academicYear: '2569',
    term: '2',
    teacherName: 'คุณครูผู้สอน',
    activeSubject: DEFAULT_SUBJECTS[0].code,
    activeClassroom: 'ม.4/1',
    subjects: DEFAULT_SUBJECTS,
    classrooms: DEFAULT_CLASSROOMS
  };
  const settingsValues = settingsSheet.getDataRange().getValues();
  for (let i = 1; i < settingsValues.length; i++) {
    const key = settingsValues[i][0];
    const val = settingsValues[i][1];
    if (key) {
      if (key === 'subjects' || key === 'classrooms') {
        try { settings[key] = JSON.parse(val); } catch (e) { settings[key] = val; }
      } else {
        settings[key] = val;
      }
    }
  }

  // 2. Students
  const students = [];
  const studentRows = studentsSheet.getDataRange().getValues();
  for (let i = 1; i < studentRows.length; i++) {
    const row = studentRows[i];
    if (row[1]) { // studentId
      students.push({
        no: Number(row[0]) || i,
        studentId: String(row[1]),
        fullName: String(row[2]),
        classroom: String(row[3] || 'ม.4/1'),
        status: String(row[4] || 'ปกติ')
      });
    }
  }

  // 3. Assignments
  const assignments = [];
  const assignRows = assignmentsSheet.getDataRange().getValues();
  for (let i = 1; i < assignRows.length; i++) {
    const row = assignRows[i];
    if (row[0]) {
      let dueDateFormatted = '';
      if (row[3] instanceof Date) {
        dueDateFormatted = Utilities.formatDate(row[3], 'Asia/Bangkok', 'yyyy-MM-dd');
      } else {
        dueDateFormatted = String(row[3] || '');
      }

      assignments.push({
        id: String(row[0]),
        title: String(row[1]),
        fullScore: Number(row[2]) || 10,
        dueDate: dueDateFormatted,
        subject: String(row[4] || ''),
        classroom: String(row[5] || 'ม.4/1')
      });
    }
  }

  // 4. Submissions
  const submissions = {};
  const subRows = submissionsSheet.getDataRange().getValues();
  for (let i = 1; i < subRows.length; i++) {
    const row = subRows[i];
    const assignId = String(row[0]);
    const studentId = String(row[1]);
    if (assignId && studentId) {
      const key = `${assignId}_${studentId}`;
      submissions[key] = {
        assignmentId: assignId,
        studentId: studentId,
        status: row[2] || 'ค้างส่ง',
        score: row[3] !== '' && row[3] !== null && row[3] !== undefined ? Number(row[3]) : null,
        note: row[4] || '',
        updatedAt: row[5] ? String(row[5]) : ''
      };
    }
  }

  // รวบรวมรายชื่อห้องเรียนที่มีจริงในระบบ
  const classroomsInUse = [...new Set([...DEFAULT_CLASSROOMS, ...students.map(s => s.classroom)])];

  return {
    settings: settings,
    students: students,
    assignments: assignments,
    submissions: submissions,
    classes: classroomsInUse,
    subjects: settings.subjects || DEFAULT_SUBJECTS
  };
}

/**
 * บันทึกคะแนนแบบกลุ่ม (Batch Save)
 */
function handleBatchSaveSubmissions(ss, submissionsList) {
  const sheet = ss.getSheetByName(SHEET_SUBMISSIONS);
  const data = sheet.getDataRange().getValues();
  const rowIndexMap = {};

  for (let i = 1; i < data.length; i++) {
    const key = `${String(data[i][0])}_${String(data[i][1])}`;
    rowIndexMap[key] = i + 1;
  }

  const newRows = [];
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  submissionsList.forEach(item => {
    const assignId = String(item.assignmentId);
    const studentId = String(item.studentId);
    const status = item.status || 'ส่งแล้ว';
    const score = item.score !== null && item.score !== undefined && item.score !== '' ? Number(item.score) : '';
    const key = `${assignId}_${studentId}`;

    // รักษาหมายเหตุเดิมในชีทไว้ถ้าไม่มีการส่งหมายเหตุใหม่มา
    const existingNote = rowIndexMap[key] ? String(data[rowIndexMap[key] - 1][4] || '') : '';
    const note = (item.note !== undefined && item.note !== null && item.note !== '') ? String(item.note) : existingNote;

    if (rowIndexMap[key]) {
      const r = rowIndexMap[key];
      sheet.getRange(r, 3, 1, 4).setValues([[status, score, note, now]]);
    } else {
      newRows.push([assignId, studentId, status, score, note, now]);
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
  }

  return submissionsList;
}

function handleSaveSingleSubmission(ss, item) {
  handleBatchSaveSubmissions(ss, [item]);
}

/**
 * นำเข้ารายชื่อนักเรียนแบบกลุ่ม (Smart Bulk Import)
 * mode: 'replace_classroom' (เขียนทับเฉพาะห้องที่เลือก), 'replace_all', หรือ 'append'
 */
function handleImportStudents(ss, payload) {
  const sheet = ss.getSheetByName(SHEET_STUDENTS);
  const mode = payload.mode || 'replace_classroom';
  const targetClass = payload.classroom || 'ม.4/1';
  const incomingStudents = payload.students || [];

  if (incomingStudents.length === 0) return 0;

  let existingStudents = [];
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[1]) {
      existingStudents.push({
        no: Number(row[0]),
        studentId: String(row[1]),
        fullName: String(row[2]),
        classroom: String(row[3] || 'ม.4/1'),
        status: String(row[4] || 'ปกติ')
      });
    }
  }

  let finalStudents = [];

  if (mode === 'replace_classroom') {
    // เก็บห้องอื่นไว้ทั้งหมด แล้วลบเฉพาะห้องนี้เพื่อแทนที่ด้วยรายชื่อใหม่
    finalStudents = existingStudents.filter(s => s.classroom !== targetClass);
    incomingStudents.forEach((st, idx) => {
      finalStudents.push({
        no: Number(st.no) || (idx + 1),
        studentId: String(st.studentId || ''),
        fullName: String(st.fullName || ''),
        classroom: String(st.classroom || targetClass),
        status: String(st.status || 'ปกติ')
      });
    });
  } else if (mode === 'replace_all') {
    finalStudents = incomingStudents;
  } else { // append
    finalStudents = existingStudents.concat(incomingStudents);
  }

  // เรียงลำดับตามห้องเรียน และเลขที่
  finalStudents.sort((a, b) => {
    if (a.classroom !== b.classroom) return a.classroom.localeCompare(b.classroom, 'th');
    return a.no - b.no;
  });

  // เขียนกลับลงชีท
  sheet.clearContents();
  sheet.appendRow(['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'สถานะ']);
  formatHeaderRow(sheet);

  if (finalStudents.length > 0) {
    const rows = finalStudents.map(st => [
      st.no,
      String(st.studentId || ''),
      st.fullName,
      st.classroom,
      st.status
    ]);
    sheet.getRange(2, 2, rows.length, 1).setNumberFormat('@');
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }

  return incomingStudents.length;
}

function handleSaveStudentList(ss, studentsList) {
  handleImportStudents(ss, { mode: 'replace_all', students: studentsList });
}

function handleCreateAssignment(ss, payload) {
  const sheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  const id = 'A' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMddHHmmss');
  const title = payload.title || 'งานที่มอบหมายใหม่';
  const fullScore = Number(payload.fullScore) || 10;
  const dueDate = payload.dueDate || '';
  const subject = payload.subject || DEFAULT_SUBJECTS[0].code;
  const classroom = payload.classroom || 'ม.4/1';

  sheet.appendRow([id, title, fullScore, dueDate, subject, classroom, new Date()]);

  return {
    id: id,
    title: title,
    fullScore: fullScore,
    dueDate: dueDate,
    subject: subject,
    classroom: classroom
  };
}

function handleDeleteAssignment(ss, assignId) {
  const sheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(assignId)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function handleSaveAssignmentsList(ss, assignmentsList) {
  const sheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  sheet.clearContents();
  sheet.appendRow(['รหัสงาน', 'ชื่องาน', 'คะแนนเต็ม', 'กำหนดส่ง', 'วิชา', 'ห้องเรียน', 'สร้างเมื่อ']);
  formatHeaderRow(sheet);

  if (assignmentsList && assignmentsList.length > 0) {
    const rows = assignmentsList.map(a => [
      String(a.id || ''),
      String(a.title || 'ชื่องาน'),
      Number(a.fullScore) || 10,
      String(a.dueDate || ''),
      String(a.subject || ''),
      String(a.classroom || 'ม.4/1'),
      a.createdAt || new Date()
    ]);
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  }
}

function handleUpdateSettings(ss, settingsObj) {
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  sheet.clearContents();
  sheet.appendRow(['Key', 'Value']);
  Object.keys(settingsObj).forEach(k => {
    let val = settingsObj[k];
    if (typeof val === 'object') val = JSON.stringify(val);
    sheet.appendRow([k, val]);
  });
  formatHeaderRow(sheet);
}

function ensureSheetsExist(ss) {
  const reqSheets = [
    { name: SHEET_SETTINGS, headers: ['Key', 'Value'] },
    { name: SHEET_STUDENTS, headers: ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'สถานะ'] },
    { name: SHEET_ASSIGNMENTS, headers: ['รหัสงาน', 'ชื่องาน', 'คะแนนเต็ม', 'กำหนดส่ง', 'วิชา', 'ห้องเรียน', 'สร้างเมื่อ'] },
    { name: SHEET_SUBMISSIONS, headers: ['รหัสงาน', 'รหัสนักเรียน', 'สถานะ', 'คะแนน', 'หมายเหตุ', 'อัปเดตล่าสุด'] }
  ];

  reqSheets.forEach(item => {
    let sh = ss.getSheetByName(item.name);
    if (!sh) {
      sh = ss.insertSheet(item.name);
      sh.appendRow(item.headers);
      formatHeaderRow(sh);
    }
  });

  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่นงาน1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }
}

function formatHeaderRow(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1);
  header.setBackground('#1E293B')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
  sheet.setFrozenRows(1);
}

/**
 * ใส่ข้อมูลตัวอย่าง (สร้าง ม.4/1 ถึง ม.4/11 และ ม.5/1, ม.5/2 พร้อม 5 รายวิชา)
 */
function seedSampleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetsExist(ss);

  // 1. Settings
  const settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  settingsSheet.clearContents();
  const sampleSettings = [
    ['Key', 'Value'],
    ['schoolName', 'โรงเรียนสาธิตพัฒนาปัญญา'],
    ['academicYear', '2569'],
    ['term', '2'],
    ['teacherName', 'คุณครูผู้สอน'],
    ['activeSubject', 'ส31101'],
    ['activeClassroom', 'ม.4/1'],
    ['subjects', JSON.stringify(DEFAULT_SUBJECTS)],
    ['classrooms', JSON.stringify(DEFAULT_CLASSROOMS)]
  ];
  settingsSheet.getRange(1, 1, sampleSettings.length, 2).setValues(sampleSettings);
  formatHeaderRow(settingsSheet);

  // 2. Students: สร้างตัวอย่าง ม.4/1 (35 คน) และ ม.4/2 (35 คน)
  const studentsSheet = ss.getSheetByName(SHEET_STUDENTS);
  studentsSheet.clearContents();
  const sampleStudents = [
    ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'สถานะ']
  ];

  const firstNames = ['กิตติภพ', 'กัญจน์', 'ขจรศักดิ์', 'ชนนิกานต์', 'ญาณิศา', 'ณัฐดนัย', 'ธัญญลักษณ์', 'ธีรภัทร', 'นภัสสร', 'บวรนันท์', 'ปรียาพร', 'ภัทรกร', 'วรรณวิสาข์', 'ศุภวิชญ์', 'สลิลลา', 'อัครพงศ์', 'กานต์พิชชา', 'จักรภพ', 'จิดาภา', 'ชัยวัฒน์', 'ณิชาภา', 'ธนกร', 'ปานรพี', 'ภูริพัฒน์', 'วรินทร', 'ศิรดา', 'สหรัฐ', 'อนันต์', 'เปมิกา', 'มิ่งขวัญ', 'ศุภโชค', 'สุกัญญา', 'อภิชญา', 'ภาณุพงศ์', 'ธนดล'];
  const lastNames = ['กัลยาณมิตร', 'ปรีชาชาญ', 'สุขประเสริฐ', 'รัตนากร', 'วิจิตรศิลป์', 'สมบูรณ์ทรัพย์', 'บุญชู', 'ชาญวิทย์', 'สุทธิธรรม', 'มั่นคง', 'อริยทรัพย์', 'ศรีสวัสดิ์', 'มิ่งขวัญ', 'เกียรติไพบูลย์', 'ทองทาบ', 'เจริญผล', 'ภิรมย์รักษ์', 'ชัยชูเกียรติ', 'ประเสริฐยิ่ง', 'ภักดีชน', 'เกษมสุข', 'พงษ์ศิริ', 'ศศิประภา', 'จันทร์กระจ่าง', 'ดิลกคุณ', 'สิริโชค', 'มั่งคั่ง', 'กมลรัตน์', 'โชคประเสริฐ', 'วัฒนากูล', 'เตชะกุล', 'เลิศประเสริฐ', 'สุขเกษม', 'บริรักษ์', 'ทวีโชค'];

  // ม.4/1 (35 คน)
  for (let i = 0; i < 35; i++) {
    const prefix = i % 2 === 0 ? 'ด.ช. ' : 'ด.ญ. ';
    sampleStudents.push([i + 1, String(41001 + i), prefix + firstNames[i] + ' ' + lastNames[i], 'ม.4/1', 'ปกติ']);
  }
  // ม.4/2 (35 คน)
  for (let i = 0; i < 35; i++) {
    const prefix = i % 2 === 0 ? 'ด.ช. ' : 'ด.ญ. ';
    sampleStudents.push([i + 1, String(42001 + i), prefix + firstNames[34 - i] + ' ' + lastNames[i], 'ม.4/2', 'ปกติ']);
  }

  studentsSheet.getRange(1, 1, sampleStudents.length, 5).setValues(sampleStudents);
  formatHeaderRow(studentsSheet);

  // 3. Assignments: 5 งานตัวอย่างสำหรับ ม.4/1
  const assignmentsSheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  assignmentsSheet.clearContents();
  const sampleAssignments = [
    ['รหัสงาน', 'ชื่องาน', 'คะแนนเต็ม', 'กำหนดส่ง', 'วิชา', 'ห้องเรียน', 'สร้างเมื่อ'],
    ['A01', '01 ใบงานโครงสร้างสังคมและการขัดเกลา', 10, '2026-11-10', 'ส31101', 'ม.4/1', new Date()],
    ['A02', '02 แผนผังความคิดสิทธิมนุษยชน', 10, '2026-11-17', 'ส31101', 'ม.4/1', new Date()],
    ['A03', '03 แบบฝึกหัดการปกครองระบอบประชาธิปไตย', 10, '2026-11-24', 'ส31101', 'ม.4/1', new Date()],
    ['A04', '04 รายงานวิเคราะห์คดีตัวอย่างทางกฎหมาย', 10, '2026-12-01', 'ส31101', 'ม.4/1', new Date()],
    ['A05', '05 ชิ้นงานสรุปหลักธรรมสากล', 10, '2026-12-08', 'ส31101', 'ม.4/1', new Date()]
  ];
  assignmentsSheet.getRange(1, 1, sampleAssignments.length, 7).setValues(sampleAssignments);
  formatHeaderRow(assignmentsSheet);

  // 4. Submissions ตัวอย่าง
  const submissionsSheet = ss.getSheetByName(SHEET_SUBMISSIONS);
  submissionsSheet.clearContents();
  const sampleSubs = [
    ['รหัสงาน', 'รหัสนักเรียน', 'สถานะ', 'คะแนน', 'หมายเหตุ', 'อัปเดตล่าสุด']
  ];
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  for (let aIdx = 1; aIdx <= 5; aIdx++) {
    const aId = 'A0' + aIdx;
    for (let sIdx = 0; sIdx < 35; sIdx++) {
      const sId = String(41001 + sIdx);
      const isSub = Math.random() < 0.8;
      if (isSub) {
        sampleSubs.push([aId, sId, 'ส่งแล้ว', Math.floor(Math.random() * 4) + 7, '', now]);
      } else {
        sampleSubs.push([aId, sId, 'ค้างส่ง', '', '', now]);
      }
    }
  }
  submissionsSheet.getRange(1, 1, sampleSubs.length, 6).setValues(sampleSubs);
  formatHeaderRow(submissionsSheet);
}
