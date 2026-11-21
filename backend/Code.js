/**
 * ระบบบันทึกส่งงานนักเรียน (Student Assignment & Grading System)
 * Backend Google Apps Script Web App API
 * รองรับ ม.4 (11 ห้อง) และ ม.5 (2 ห้อง) รวม 13 ห้องเรียน และ 5 รายวิชา
 */

const SHEET_SETTINGS = 'Settings';
const SHEET_STUDENTS = 'Students';
const SHEET_ASSIGNMENTS = 'Assignments';
const SHEET_SUBMISSIONS = 'Submissions';
const SHEET_GRADEBOOK = 'Gradebook';

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
    .addItem('🎓 ตรวจสอบชีททะเบียนคะแนน & SGS', 'initGradebookSheet')
    .addItem('✨ ใส่ข้อมูลตัวอย่าง (ม.4 & ม.5)', 'seedSampleData')
    .addToUi();
}

function initGradebookSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetsExist(ss);
  SpreadsheetApp.getUi().alert('🎓 ตรวจสอบและสร้างชีท Gradebook (ทะเบียนคะแนน & SGS) เรียบร้อยแล้ว');
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
  if (!expectedToken || expectedToken.trim() === '') {
    // ป้องกันความปลอดภัย: หากยังไม่ได้ตั้ง API_TOKEN ใน Script Properties จะไม่อนุญาตให้เข้าถึง
    return false;
  }
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

    if (!verifyToken_(token)) {
      return createJsonResponse({ success: false, error: 'Unauthorized: รหัสความปลอดภัย (API Token) ไม่ถูกต้อง' });
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

    if (action === 'saveGradebook') {
      const saved = handleSaveGradebook(ss, payload.records || payload.gradebook || []);
      return createJsonResponse({ success: true, count: saved.length });
    }

    if (action === 'syncFullState') {
      if (payload.settings) handleUpdateSettings(ss, payload.settings);
      if (payload.students && payload.students.length > 0) handleSaveStudentList(ss, payload.students);
      if (payload.assignments && payload.assignments.length > 0) handleSaveAssignmentsList(ss, payload.assignments);
      if (payload.submissions && payload.submissions.length > 0) handleBatchSaveSubmissions(ss, payload.submissions);
      if (payload.gradebook && payload.gradebook.length > 0) handleSaveGradebook(ss, payload.gradebook);
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
        fullScore: Number(row[2]) || 5,
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

  // 5. Gradebook (ทะเบียนคะแนน & ตัดเกรด SGS)
  const gradebook = [];
  const gradebookSheet = ss.getSheetByName(SHEET_GRADEBOOK);
  if (gradebookSheet) {
    const gbRows = gradebookSheet.getDataRange().getValues();
    for (let i = 1; i < gbRows.length; i++) {
      const row = gbRows[i];
      if (row[3]) { // studentId
        gradebook.push({
          subject: String(row[0] || ''),
          classroom: String(row[1] || ''),
          no: Number(row[2]) || i,
          studentId: String(row[3]),
          fullName: String(row[4] || ''),
          attPre: Number(row[5]) || 0,
          workPre: Number(row[6]) || 0,
          sumPre: Number(row[7]) || 0,
          midRaw: Number(row[8]) || 0,
          midDiv: Number(row[9]) || 2,
          midHelp: Number(row[10]) || 0,
          midScore: Number(row[11]) || 0,
          attPost: Number(row[12]) || 0,
          workPost: Number(row[13]) || 0,
          sumPost: Number(row[14]) || 0,
          termScore: Number(row[15]) || 0,
          finalRaw: Number(row[16]) || 0,
          finalDiv: Number(row[17]) || 2,
          finalHelp: Number(row[18]) || 0,
          finalScore: Number(row[19]) || 0,
          totalScore: Number(row[20]) || 0,
          grade: String(row[21] !== undefined && row[21] !== null ? row[21] : '0'),
          sgsStatus: String(row[22] || 'ปกติ'),
          note: String(row[23] || ''),
          updatedAt: String(row[24] || '')
        });
      }
    }
  }

  // รวบรวมรายชื่อห้องเรียน: ยึดตามที่บันทึกไว้ใน settings.classrooms เป็นหลัก
  // หากมีห้องที่นักเรียนสังกัดอยู่จริงในชีท Students ให้รวมเข้ามาด้วย (ป้องกันห้องตกหล่น)
  // แต่จะไม่ดึงห้องตัวอย่างเริ่มต้น (DEFAULT_CLASSROOMS) ที่ครูลบออกไปแล้วกลับมาอีก
  let configuredClassrooms = Array.isArray(settings.classrooms) && settings.classrooms.length > 0 
    ? settings.classrooms 
    : DEFAULT_CLASSROOMS;
  const studentClassrooms = students.map(s => s.classroom).filter(Boolean);
  const classroomsInUse = [...new Set([...configuredClassrooms, ...studentClassrooms])];
  settings.classrooms = classroomsInUse;

  return {
    settings: settings,
    students: students,
    assignments: assignments,
    submissions: submissions,
    gradebook: gradebook,
    classes: classroomsInUse,
    subjects: settings.subjects || DEFAULT_SUBJECTS
  };
}

/**
 * บันทึกคะแนนทะเบียน ปพ.5 / SGS แบบ In-Memory Batch Write
 */
function handleSaveGradebook(ss, gradebookList) {
  if (!gradebookList || gradebookList.length === 0) return [];
  const sheet = ss.getSheetByName(SHEET_GRADEBOOK);
  const data = sheet.getDataRange().getValues();
  const rowIndexMap = {};

  const headers = [
    'รหัสวิชา', 'ห้องเรียน', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล',
    'มา_ก่อนกลาง', 'งาน_ก่อนกลาง', 'รวมก่อนกลาง',
    'กลางภาค_ข้อเขียน', 'กลางภาค_หาร', 'กลางภาค_ช่วย', 'สรุปกลางภาค',
    'มา_หลังกลาง', 'งาน_หลังกลาง', 'รวมหลังกลาง',
    'รวมระหว่างภาค',
    'ปลายภาค_ข้อเขียน', 'ปลายภาค_หาร', 'ปลายภาค_ช่วย', 'สรุปปลายภาค',
    'คะแนนรวม100', 'เกรด', 'ตรง_SGS', 'หมายเหตุ', 'อัปเดตเมื่อ'
  ];

  if (data.length === 0 || !data[0] || data[0].length < headers.length) {
    sheet.clearContents();
    sheet.appendRow(headers);
    formatHeaderRow(sheet);
    data[0] = headers;
  }

  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '') + '_' + String(data[i][1] || '') + '_' + String(data[i][3] || '');
    rowIndexMap[key] = i;
  }

  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  gradebookList.forEach(item => {
    const subj = String(item.subject || '');
    const room = String(item.classroom || '');
    const sid = String(item.studentId || '');
    const key = subj + '_' + room + '_' + sid;

    const rowArray = [
      subj,
      room,
      Number(item.no) || '',
      sid,
      String(item.fullName || item.name || ''),
      item.attPre !== null && item.attPre !== undefined && item.attPre !== '' ? Number(item.attPre) : 0,
      item.workPre !== null && item.workPre !== undefined && item.workPre !== '' ? Number(item.workPre) : 0,
      item.sumPre !== null && item.sumPre !== undefined && item.sumPre !== '' ? Number(item.sumPre) : 0,
      item.midRaw !== null && item.midRaw !== undefined && item.midRaw !== '' ? Number(item.midRaw) : 0,
      item.midDiv !== null && item.midDiv !== undefined && item.midDiv !== '' ? Number(item.midDiv) : 2,
      item.midHelp !== null && item.midHelp !== undefined && item.midHelp !== '' ? Number(item.midHelp) : 0,
      item.midScore !== null && item.midScore !== undefined && item.midScore !== '' ? Number(item.midScore) : 0,
      item.attPost !== null && item.attPost !== undefined && item.attPost !== '' ? Number(item.attPost) : 0,
      item.workPost !== null && item.workPost !== undefined && item.workPost !== '' ? Number(item.workPost) : 0,
      item.sumPost !== null && item.sumPost !== undefined && item.sumPost !== '' ? Number(item.sumPost) : 0,
      item.termScore !== null && item.termScore !== undefined && item.termScore !== '' ? Number(item.termScore) : 0,
      item.finalRaw !== null && item.finalRaw !== undefined && item.finalRaw !== '' ? Number(item.finalRaw) : 0,
      item.finalDiv !== null && item.finalDiv !== undefined && item.finalDiv !== '' ? Number(item.finalDiv) : 2,
      item.finalHelp !== null && item.finalHelp !== undefined && item.finalHelp !== '' ? Number(item.finalHelp) : 0,
      item.finalScore !== null && item.finalScore !== undefined && item.finalScore !== '' ? Number(item.finalScore) : 0,
      item.totalScore !== null && item.totalScore !== undefined && item.totalScore !== '' ? Number(item.totalScore) : 0,
      String(item.grade !== undefined && item.grade !== null ? item.grade : '0'),
      String(item.sgsStatus || 'ปกติ'),
      String(item.note || ''),
      now
    ];

    const existingIdx = rowIndexMap[key];
    if (existingIdx !== undefined) {
      data[existingIdx] = rowArray;
    } else {
      data.push(rowArray);
      rowIndexMap[key] = data.length - 1;
    }
  });

  if (data.length > 0) {
    sheet.getRange(1, 1, data.length, headers.length).setValues(data);
    if (data.length > 1) {
      sheet.getRange(2, 4, data.length - 1, 1).setNumberFormat('@');
    }
  }

  return gradebookList;
}

/**
 * บันทึกคะแนนแบบกลุ่ม (Batch Save) ด้วย In-Memory Batch Write รวดเร็วในคำสั่งเดียว
 */
function handleBatchSaveSubmissions(ss, submissionsList) {
  if (!submissionsList || submissionsList.length === 0) return [];
  const sheet = ss.getSheetByName(SHEET_SUBMISSIONS);
  const data = sheet.getDataRange().getValues();
  const rowIndexMap = {};

  // ตรวจสอบหัวตาราง
  if (data.length === 0 || !data[0] || data[0].length < 6) {
    sheet.clearContents();
    sheet.appendRow(['รหัสงาน', 'รหัสนักเรียน', 'สถานะ', 'คะแนน', 'หมายเหตุ', 'อัปเดตเมื่อ']);
    formatHeaderRow(sheet);
    data[0] = ['รหัสงาน', 'รหัสนักเรียน', 'สถานะ', 'คะแนน', 'หมายเหตุ', 'อัปเดตเมื่อ'];
  }

  for (let i = 1; i < data.length; i++) {
    const key = `${String(data[i][0])}_${String(data[i][1])}`;
    rowIndexMap[key] = i; // 0-based index in data array
  }

  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  submissionsList.forEach(item => {
    const assignId = String(item.assignmentId);
    const studentId = String(item.studentId);
    const status = item.status || 'ส่งแล้ว';
    const score = item.score !== null && item.score !== undefined && item.score !== '' ? Number(item.score) : '';
    const key = `${assignId}_${studentId}`;

    const existingIdx = rowIndexMap[key];
    const existingNote = (existingIdx !== undefined && data[existingIdx]) ? String(data[existingIdx][4] || '') : '';
    const note = (item.note !== undefined && item.note !== null && item.note !== '') ? String(item.note) : existingNote;

    if (existingIdx !== undefined) {
      // อัปเดตในหน่วยความจำทันที ไม่ต้องเรียก API ทีละแถว
      data[existingIdx][2] = status;
      data[existingIdx][3] = score;
      data[existingIdx][4] = note;
      data[existingIdx][5] = now;
    } else {
      const newRow = [assignId, studentId, status, score, note, now];
      data.push(newRow);
      rowIndexMap[key] = data.length - 1;
    }
  });

  // เขียนกลับลงชีททั้งหมดด้วยการเรียก setValues เพียงครั้งเดียว
  if (data.length > 0) {
    sheet.getRange(1, 1, data.length, 6).setValues(data);
    if (data.length > 1) {
      sheet.getRange(2, 1, data.length - 1, 2).setNumberFormat('@');
    }
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
  const fullScore = Number(payload.fullScore) || 5;
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
      Number(a.fullScore) || 5,
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
    { name: SHEET_SUBMISSIONS, headers: ['รหัสงาน', 'รหัสนักเรียน', 'สถานะ', 'คะแนน', 'หมายเหตุ', 'อัปเดตล่าสุด'] },
    {
      name: SHEET_GRADEBOOK,
      headers: [
        'รหัสวิชา', 'ห้องเรียน', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล',
        'มา_ก่อนกลาง', 'งาน_ก่อนกลาง', 'รวมก่อนกลาง',
        'กลางภาค_ข้อเขียน', 'กลางภาค_หาร', 'กลางภาค_ช่วย', 'สรุปกลางภาค',
        'มา_หลังกลาง', 'งาน_หลังกลาง', 'รวมหลังกลาง',
        'รวมระหว่างภาค',
        'ปลายภาค_ข้อเขียน', 'ปลายภาค_หาร', 'ปลายภาค_ช่วย', 'สรุปปลายภาค',
        'คะแนนรวม100', 'เกรด', 'ตรง_SGS', 'หมายเหตุ', 'อัปเดตเมื่อ'
      ]
    }
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

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ ยืนยันการใส่ข้อมูลตัวอย่าง',
    'การดำเนินการนี้จะล้างข้อมูลวิชา นักเรียน และภาระงานทั้งหมดในชีทเพื่อแทนที่ด้วยข้อมูลตัวอย่าง คุณแน่ใจหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) {
    ui.alert('ยกเลิกการใส่ข้อมูลตัวอย่างแล้ว');
    return;
  }

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
    ['A01', '01 ใบงานโครงสร้างสังคมและการขัดเกลา', 5, '2026-11-10', 'ส31101', 'ม.4/1', new Date()],
    ['A02', '02 แผนผังความคิดสิทธิมนุษยชน', 5, '2026-11-17', 'ส31101', 'ม.4/1', new Date()],
    ['A03', '03 แบบฝึกหัดการปกครองระบอบประชาธิปไตย', 5, '2026-11-24', 'ส31101', 'ม.4/1', new Date()],
    ['A04', '04 รายงานวิเคราะห์คดีตัวอย่างทางกฎหมาย', 5, '2026-12-01', 'ส31101', 'ม.4/1', new Date()],
    ['A05', '05 ชิ้นงานสรุปหลักธรรมสากล', 5, '2026-12-08', 'ส31101', 'ม.4/1', new Date()]
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
