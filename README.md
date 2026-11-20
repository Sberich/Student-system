# ระบบบันทึกส่งงานนักเรียน (The Modern Educator Platform)

ระบบบันทึกการส่งงานและให้คะแนนนักเรียน ออกแบบพิเศษเพื่อครูผู้สอนยุคใหม่ ตอบโจทย์การใช้งานจริงบน **iPad, แท็บเล็ต, สมาร์ตโฟน และคอมพิวเตอร์** เชื่อมต่อฐานข้อมูลโดยตรงกับ **Google Sheets** และพร้อมนำขึ้นโฮสต์บน **Cloudflare Pages**

---

## 🌟 จุดเด่นของระบบที่พัฒนาขึ้นใหม่

1. **In-App Touch Numpad (สำหรับ iPad และมือถือ):**
   - มีแป้นตัวเลขบนหน้าจอ แตะให้คะแนน `10`, `9`, `8`, `0` ได้ทันที
   - ไม่ต้องรอแป้นพิมพ์เสมือนของ iPad เด้งขึ้นมาบังตารางรายชื่อ
   - ระบบ **Auto-Advance (ตรวจเสร็จข้ามคนถัดไปอัตโนมัติ)** ช่วยให้ตรวจการบ้าน 40 เล่มเสร็จได้ด้วยมือข้างเดียวในเวลาไม่กี่นาที
2. **รายงานสรุปขนาด A4 แนวนอน (10 งานต่อหน้า):**
   - จัดรูปแบบตามมาตรฐานส่งฝ่ายวิชาการโรงเรียนไทย
   - มีจุดลงชื่อครูผู้สอนประจำวิชา
   - สั่งพิมพ์ (Print to PDF) หรือส่งออกเป็นไฟล์ Excel (CSV) ได้ทันที
3. **ฟังก์ชันอำนวยความสะดวก:**
   - ปุ่มลัด **"⚡ ส่งแล้วทุกคนที่เหลือ"** สำหรับวันที่เด็กส่งงานพร้อมกันทั้งห้อง
   - ปุ่มลัด **"🌟 ให้คะแนนเต็ม"**
   - ฟิลเตอร์คัดกรอง: ทั้งหมด / ส่งแล้ว / ค้างส่ง
   - ระบบนำเข้ารายชื่อนักเรียนด้วยการ Copy & Paste จาก Excel โรงเรียน
4. **ความทนทานและความปลอดภัยของข้อมูล (Offline-Ready):**
   - บันทึกข้อมูลลงเครื่องทันที (LocalStorage) ไม่ต้องกลัวเน็ตหลุดระหว่างตรวจ
   - ระบบ Sync เบื้องหลังส่งคะแนนขึ้น Google Sheets อัตโนมัติ

---

## 🏗️ สถาปัตยกรรมระบบ (Architecture)

- **หน้าบ้าน (Frontend):** HTML5, Modern CSS, Vanilla JavaScript (ไม่ต้องรอ Build, โหลดเร็วใน 0.1 วินาที) พร้อม Deploy บน **Cloudflare Pages**
- **ฐานข้อมูล (Database):** **Google Sheets** อยู่ใน Google Drive ของคุณครูเอง เปิดดู แก้ไข หรือคำนวณสูตรต่อได้ตลอดเวลา
- **ระบบหลังบ้าน (Backend API):** **Google Apps Script Web App** จัดการ Deploy และควบคุมผ่าน `clasp`

---

## 🚀 ลิงก์และข้อมูลการเชื่อมต่อปัจจุบัน

- **Google Spreadsheet (ชีทข้อมูลจริง):**
  [เปิดดูชีทใน Google Drive](https://docs.google.com/spreadsheets/d/1fP4g1aedTiymV9ZTIer0gWjTWZeewOrk6gJo2qfWjpU/edit)
- **Google Apps Script Project:**
  [เปิดสคริปต์ใน Apps Script Editor](https://script.google.com/d/1-85CDk7GozHoaVPDVe_uZfzrvYoI9MLq6QmeVivqPSaKVx_rkOhkl2zK/edit)
- **Web App API Endpoint (Deploy ล่าสุด):**
  `https://script.google.com/macros/s/AKfycbyGhv4Xzj1OFV0h7ckHx10UE4CdApjMcMInIkc-ZQJOvXqoWVqvFIYj1nytiRap8nsx/exec`

---

## 📱 วิธีใช้งานบน iPad / iPhone (ให้เหมือนแอปจริง)

1. เปิดเบราว์เซอร์ **Safari** บน iPad หรือ iPhone แล้วเปิดลิงก์ของระบบ
2. กดปุ่ม **แชร์ (Share Icon)** ที่แถบด้านบน
3. เลือก **"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)**
4. ระบบจะกลายเป็นไอคอนแอปบนหน้าจอ เปิดใช้งานได้เต็มจอ ไม่มีแถบ URL กวนใจ

---

## ☁️ วิธีนำขึ้น Cloudflare Pages ด้วย GitHub

1. สร้าง Repository ใหม่บน GitHub ของคุณ (เช่น `student-grading-system`)
2. Push โฟลเดอร์โปรเจกต์นี้ขึ้นไป:
   ```bash
   git add .
   git commit -m "Initial release of Student Grading System"
   git remote add origin https://github.com/<your-username>/student-grading-system.git
   git branch -M main
   git push -u origin main
   ```
3. เข้าที่ Dashboard ของ **Cloudflare** -> เมนู **Workers & Pages** -> กด **Create application** -> เลือกแท็บ **Pages** -> **Connect to Git**
4. เลือก Repository นี้ แล้วตั้งค่า:
   - **Root directory:** `frontend`
   - **Build command:** *(เว้นว่างไว้)*
   - **Build output directory:** `.`
5. กด **Save and Deploy** ภายใน 1 นาที คุณจะได้โดเมน `.pages.dev` ที่พร้อมใช้งานได้ทั่วโลกทันที!
