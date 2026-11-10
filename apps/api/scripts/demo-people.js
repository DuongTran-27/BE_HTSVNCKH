// Thay họ tên/mã/email của một số tài khoản mẫu trên DB dev bằng danh sách người thật đặt trong
// prisma/demo-people.local.json (đã gitignore, không commit). Chạy sau `prisma db seed`: npm run demo:people -w @nckh/api
// Sinh viên thật thay sinh viên mẫu thứ 21 trở đi; giảng viên thật thay GV001 trở đi. Mật khẩu và dữ liệu khác giữ nguyên.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertSeedAllowedDb, seedStudentCode } from '../prisma/seed.js';

export const FIRST_STUDENT_SLOT = 21;
const MAX_STUDENTS = 40 - FIRST_STUDENT_SLOT + 1;
const MAX_LECTURERS = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kiểm tra file và lập danh sách cập nhật: [{ codes: [mã mẫu, mã mới], data }]; sai → ném lỗi tiếng Việt */
export function planDemoPeople({ students = [], lecturers = [] }) {
  if (!Array.isArray(students) || !Array.isArray(lecturers)) throw new Error('students và lecturers phải là mảng.');
  if (students.length > MAX_STUDENTS) throw new Error(`Tối đa ${MAX_STUDENTS} sinh viên.`);
  if (lecturers.length > MAX_LECTURERS) throw new Error(`Tối đa ${MAX_LECTURERS} giảng viên.`);
  const seen = new Set();
  const plan = students.map((s, k) => {
    const code = String(s?.code ?? '').trim();
    const fullName = String(s?.fullName ?? '').trim().replace(/\s+/g, ' ');
    if (!code || !fullName) throw new Error(`Sinh viên thứ ${k + 1}: thiếu mã hoặc họ tên.`);
    if (seen.has(code)) throw new Error(`Mã sinh viên ${code} bị trùng.`);
    seen.add(code);
    return { codes: [seedStudentCode(FIRST_STUDENT_SLOT + k), code], data: { code, fullName, email: `${code.toLowerCase()}@nckh.example` } };
  });
  lecturers.forEach((l, k) => {
    const fullName = String(l?.fullName ?? '').trim().replace(/\s+/g, ' ');
    const email = String(l?.email ?? '').trim().toLowerCase();
    if (!fullName || !EMAIL_RE.test(email)) throw new Error(`Giảng viên thứ ${k + 1}: thiếu họ tên hoặc email sai.`);
    if (seen.has(email)) throw new Error(`Email ${email} bị trùng.`);
    seen.add(email);
    const code = `GV00${k + 1}`;
    plan.push({ codes: [code, code], data: { fullName, email } });
  });
  return plan;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Không chạy dữ liệu demo trên môi trường production.');
  const file = new URL('../prisma/demo-people.local.json', import.meta.url);
  if (!existsSync(file)) throw new Error('Chưa có apps/api/prisma/demo-people.local.json.');
  const plan = planDemoPeople(JSON.parse(readFileSync(file, 'utf8')));
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await assertSeedAllowedDb(prisma); // chỉ DB dev/demo đã bật cờ nckh.seed_allowed
    await prisma.$transaction(async (tx) => {
      for (const { codes, data } of plan) {
        // Tìm theo mã mẫu hoặc mã mới: chạy lại lần hai vẫn đúng
        const user = await tx.user.findFirst({ where: { code: { in: codes } }, select: { id: true } });
        if (!user) throw new Error(`Không thấy tài khoản mẫu ${codes[0]} – chạy seed trước.`);
        await tx.user.update({ where: { id: user.id }, data });
      }
    });
    console.log(`Đã cập nhật ${plan.length} tài khoản demo.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
