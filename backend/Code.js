/**
 * ระบบบันทึกส่งงานนักเรียน (Student Assignment & Grading System)
 * Backend Google Apps Script Web App API
 */

const SHEET_SETTINGS = 'Settings';
const SHEET_STUDENTS = 'Students';
const SHEET_ASSIGNMENTS = 'Assignments';
const SHEET_SUBMISSIONS = 'Submissions';

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📚 ระบบส่งงานนักเรียน')
    .addItem('⚙️ ตั้งค่าชีทเริ่มต้น (Init Sheets)', 'initSheets')
    .addItem('✨ ใส่ข้อมูลตัวอย่าง (25 คน 10 งาน)', 'seedSampleData')
    .addToUi();
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ตรวจสอบและสร้างชีทหากยังไม่มี
    ensureSheetsExist(ss);

    if (action === 'getInitialData') {
      const data = fetchAllData(ss);
      return createJsonResponse({ success: true, data: data });
    }

    if (action === 'seedSample') {
      seedSampleData();
      const data = fetchAllData(ss);
      return createJsonResponse({ success: true, message: 'Sample data created', data: data });
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
 * Handle HTTP POST Requests
 */
function doPost(e) {
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

    if (action === 'updateSettings') {
      handleUpdateSettings(ss, payload.settings || {});
      return createJsonResponse({ success: true });
    }

    if (action === 'saveStudentList') {
      handleSaveStudentList(ss, payload.students || []);
      return createJsonResponse({ success: true });
    }

    return createJsonResponse({ success: false, message: 'Invalid action: ' + action });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * ดึงข้อมูลรวมทั้งหมดเพื่อแสดงผลหน้า Dashboard และตารางตรวจงาน
 */
function fetchAllData(ss) {
  const settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  const studentsSheet = ss.getSheetByName(SHEET_STUDENTS);
  const assignmentsSheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  const submissionsSheet = ss.getSheetByName(SHEET_SUBMISSIONS);

  // 1. Settings
  const settings = {};
  const settingsValues = settingsSheet.getDataRange().getValues();
  for (let i = 1; i < settingsValues.length; i++) {
    const key = settingsValues[i][0];
    const val = settingsValues[i][1];
    if (key) settings[key] = val;
  }

  // 2. Students
  const students = [];
  const studentRows = studentsSheet.getDataRange().getValues();
  for (let i = 1; i < studentRows.length; i++) {
    const row = studentRows[i];
    if (row[1]) { // studentId
      students.push({
        no: row[0],
        studentId: String(row[1]),
        fullName: row[2],
        classroom: row[3] || 'ป.4/1',
        status: row[4] || 'ปกติ'
      });
    }
  }

  // 3. Assignments
  const assignments = [];
  const assignRows = assignmentsSheet.getDataRange().getValues();
  for (let i = 1; i < assignRows.length; i++) {
    const row = assignRows[i];
    if (row[0]) { // assignmentId
      let dueDateFormatted = '';
      if (row[3] instanceof Date) {
        dueDateFormatted = Utilities.formatDate(row[3], 'Asia/Bangkok', 'yyyy-MM-dd');
      } else {
        dueDateFormatted = String(row[3] || '');
      }

      assignments.push({
        id: String(row[0]),
        title: row[1],
        fullScore: Number(row[2]) || 10,
        dueDate: dueDateFormatted,
        subject: row[4] || '',
        classroom: row[5] || 'ป.4/1'
      });
    }
  }

  // 4. Submissions
  // Map by assignmentId + '_' + studentId
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
        status: row[2] || 'ค้างส่ง', // 'ส่งแล้ว', 'ค้างส่ง', 'ลา'
        score: row[3] !== '' ? Number(row[3]) : null,
        note: row[4] || '',
        updatedAt: row[5] ? String(row[5]) : ''
      };
    }
  }

  return {
    settings: settings,
    students: students,
    assignments: assignments,
    submissions: submissions,
    classes: ['ป.4/1', 'ป.4/2', 'ป.5/1', 'ม.1/1', 'ม.4/1']
  };
}

/**
 * บันทึกคะแนนแบบกลุ่ม (Batch Save) เพื่อความรวดเร็วและลด Request
 */
function handleBatchSaveSubmissions(ss, submissionsList) {
  const sheet = ss.getSheetByName(SHEET_SUBMISSIONS);
  const data = sheet.getDataRange().getValues();
  const rowIndexMap = {}; // key: assignId_studentId -> rowIndex (1-based)

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
    const note = item.note || '';
    const key = `${assignId}_${studentId}`;

    if (rowIndexMap[key]) {
      // Update existing row
      const r = rowIndexMap[key];
      sheet.getRange(r, 3, 1, 4).setValues([[status, score, note, now]]);
    } else {
      // Collect for append
      newRows.push([assignId, studentId, status, score, note, now]);
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
  }

  return submissionsList;
}

/**
 * บันทึกรายบุคคล
 */
function handleSaveSingleSubmission(ss, item) {
  handleBatchSaveSubmissions(ss, [item]);
}

/**
 * สร้างงานใหม่
 */
function handleCreateAssignment(ss, payload) {
  const sheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  const id = 'A' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMddHHmmss');
  const title = payload.title || 'งานที่มอบหมายใหม่';
  const fullScore = Number(payload.fullScore) || 10;
  const dueDate = payload.dueDate || '';
  const subject = payload.subject || 'คณิตศาสตร์ [ค15101]';
  const classroom = payload.classroom || 'ป.4/1';

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

/**
 * อัปเดตข้อมูล Settings
 */
function handleUpdateSettings(ss, settingsObj) {
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  sheet.clearContents();
  sheet.appendRow(['Key', 'Value']);
  Object.keys(settingsObj).forEach(k => {
    sheet.appendRow([k, settingsObj[k]]);
  });
}

/**
 * บันทึกรายชื่อนักเรียน
 */
function handleSaveStudentList(ss, studentsList) {
  const sheet = ss.getSheetByName(SHEET_STUDENTS);
  sheet.clearContents();
  sheet.appendRow(['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'สถานะ']);
  
  if (studentsList && studentsList.length > 0) {
    const rows = studentsList.map((st, idx) => [
      st.no || (idx + 1),
      String(st.studentId || (25000 + idx + 1)),
      st.fullName || '',
      st.classroom || 'ป.4/1',
      st.status || 'ปกติ'
    ]);
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
}

/**
 * ตรวจสอบชีทและสร้าง Headers ให้เรียบร้อย
 */
function ensureSheetsExist(ss) {
  const reqSheets = [
    {
      name: SHEET_SETTINGS,
      headers: ['Key', 'Value']
    },
    {
      name: SHEET_STUDENTS,
      headers: ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'สถานะ']
    },
    {
      name: SHEET_ASSIGNMENTS,
      headers: ['รหัสงาน', 'ชื่องาน', 'คะแนนเต็ม', 'กำหนดส่ง', 'วิชา', 'ห้องเรียน', 'สร้างเมื่อ']
    },
    {
      name: SHEET_SUBMISSIONS,
      headers: ['รหัสงาน', 'รหัสนักเรียน', 'สถานะ', 'คะแนน', 'หมายเหตุ', 'อัปเดตล่าสุด']
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

  // ลบ Sheet1 เริ่มต้นถ้ามี
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
 * ฟังก์ชันสร้างข้อมูลเริ่มต้น (Sample Data เหมือนในรูปของอาจารย์)
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
    ['teacherName', 'คุณครูผู้สอนตัวอย่าง'],
    ['subjectName', 'คณิตศาสตร์ [ค15101]'],
    ['classroom', 'ป.4/1']
  ];
  settingsSheet.getRange(1, 1, sampleSettings.length, 2).setValues(sampleSettings);
  formatHeaderRow(settingsSheet);

  // 2. Students (25 คน ตรงกับในรูปภาพ)
  const studentsSheet = ss.getSheetByName(SHEET_STUDENTS);
  studentsSheet.clearContents();
  const sampleStudents = [
    ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'สถานะ']
  ];
  const thaiNames = [
    'ด.ช. กิตติภพ กัลยาณมิตร', 'ด.ช. กัญจน์ ปรีชาชาญ', 'ด.ช. ขจรศักดิ์ สุขประเสริฐ',
    'ด.ญ. ชนนิกานต์ รัตนากร', 'ด.ญ. ญาณิศา วิจิตรศิลป์', 'ด.ช. ณัฐดนัย สมบูรณ์ทรัพย์',
    'ด.ญ. ธัญญลักษณ์ บุญชู', 'ด.ช. ธีรภัทร ชาญวิทย์', 'ด.ญ. นภัสสร สุทธิธรรม',
    'ด.ช. บวรนันท์ มั่นคง', 'ด.ญ. ปรียาพร อริยทรัพย์', 'ด.ช. ภัทรกร ศรีสวัสดิ์',
    'ด.ญ. วรรณวิสาข์ มิ่งขวัญ', 'ด.ช. ศุภวิชญ์ เกียรติไพบูลย์', 'ด.ญ. สลิลลา ทองทาบ',
    'ด.ช. อัครพงศ์ เจริญผล', 'ด.ญ. กานต์พิชชา ภิรมย์รักษ์', 'ด.ช. จักรภพ ชัยชูเกียรติ',
    'ด.ญ. จิดาภา ประเสริฐยิ่ง', 'ด.ช. ชัยวัฒน์ ภักดีชน', 'ด.ญ. ณิชาภา เกษมสุข',
    'ด.ช. ธนกร พงษ์ศิริ', 'ด.ญ. ปานรพี ศศิประภา', 'ด.ช. ภูริพัฒน์ จันทร์กระจ่าง',
    'ด.ญ. วรินทร ดิลกคุณ'
  ];

  for (let i = 0; i < thaiNames.length; i++) {
    const studentId = 25001 + i;
    sampleStudents.push([i + 1, String(studentId), thaiNames[i], 'ป.4/1', 'ปกติ']);
  }
  studentsSheet.getRange(1, 1, sampleStudents.length, 5).setValues(sampleStudents);
  formatHeaderRow(studentsSheet);

  // 3. Assignments (10 งาน ตรงกับในหน้ารายงานของอาจารย์)
  const assignmentsSheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  assignmentsSheet.clearContents();
  const sampleAssignments = [
    ['รหัสงาน', 'ชื่องาน', 'คะแนนเต็ม', 'กำหนดส่ง', 'วิชา', 'ห้องเรียน', 'สร้างเมื่อ'],
    ['A01', '01 ใบงานเศษส่วน', 10, '2026-10-25', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A02', '02 แบบฝึกหัดหน่วยที่ 1', 10, '2026-10-29', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A03', '03 แผนภาพจำนวนคละ', 10, '2026-11-05', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A04', '04 ใบงานการบวกเศษส่วน', 10, '2026-11-12', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A05', '05 แบบฝึกหัดการลบ', 10, '2026-11-19', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A06', '06 กิจกรรมแก้โจทย์ปัญหา', 10, '2026-11-26', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A07', '07 ชิ้นงานสรุปความรู้', 10, '2026-12-03', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A08', '08 แบบฝึกหัดเพิ่มเติม 8', 10, '2026-12-10', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A09', '09 แบบฝึกหัดเพิ่มเติม 9', 10, '2026-12-17', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()],
    ['A10', '10 แบบฝึกหัดเพิ่มเติม 10', 10, '2026-12-24', 'คณิตศาสตร์ [ค15101]', 'ป.4/1', new Date()]
  ];
  assignmentsSheet.getRange(1, 1, sampleAssignments.length, 7).setValues(sampleAssignments);
  formatHeaderRow(assignmentsSheet);

  // 4. Submissions (สุ่มตัวอย่างคะแนนและสถานะ)
  const submissionsSheet = ss.getSheetByName(SHEET_SUBMISSIONS);
  submissionsSheet.clearContents();
  const sampleSubs = [
    ['รหัสงาน', 'รหัสนักเรียน', 'สถานะ', 'คะแนน', 'หมายเหตุ', 'อัปเดตล่าสุด']
  ];

  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  
  // ให้งานที่ 1 และ 2 มีส่งเกือบครบ ส่วนงานหลังๆ มีส่งปานกลาง
  for (let aIdx = 1; aIdx <= 10; aIdx++) {
    const aId = 'A' + (aIdx < 10 ? '0' + aIdx : aIdx);
    for (let sIdx = 0; sIdx < 25; sIdx++) {
      const sId = String(25001 + sIdx);
      // ความน่าจะเป็นในการส่ง
      const submitRate = aIdx <= 2 ? 0.85 : 0.60;
      const isSubmitted = Math.random() < submitRate;
      
      if (isSubmitted) {
        // คะแนนสุ่ม 6 ถึง 10
        const score = Math.floor(Math.random() * 5) + 6;
        sampleSubs.push([aId, sId, 'ส่งแล้ว', score, '', now]);
      } else {
        sampleSubs.push([aId, sId, 'ค้างส่ง', '', '', now]);
      }
    }
  }

  submissionsSheet.getRange(1, 1, sampleSubs.length, 6).setValues(sampleSubs);
  formatHeaderRow(submissionsSheet);
}
