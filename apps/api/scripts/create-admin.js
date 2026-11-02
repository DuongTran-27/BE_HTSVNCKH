// Tạo quản trị viên đầu tiên trên DB đang trỏ bởi DATABASE_URL (xem README "Tạo quản trị viên đầu tiên").
// Dùng (trong apps/api): node --env-file=.env scripts/create-admin.js --code QT001 --email a@khoa.edu.vn --name "Nguyễn Văn A" [--force]
// Mật khẩu tạm sinh ngẫu nhiên và in MỘT LẦN ra stdout; không nhận mật khẩu từ tham số/env. Đăng nhập xong phải đổi ngay.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { passwordHasher } from '../src/lib/password.js';
import { createFirstAdmin } from '../src/modules/accounts/bootstrapAdmin.js';

export async function main(argv, { prisma = new PrismaClient(), log = console.log } = {}) {
  const { values } = parseArgs({
    args: argv,
    options: { code: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, force: { type: 'boolean', default: false } },
  });
  try {
    const { user, temporaryPassword } = await createFirstAdmin(
      prisma,
      passwordHasher,
      { code: values.code, email: values.email, fullName: values.name },
      { force: values.force },
    );
    log(`Đã tạo quản trị viên ${user.code} (${user.email}).`);
    log(`Mật khẩu tạm (chỉ hiển thị lần này, hãy lưu ngay và đổi ở lần đăng nhập đầu): ${temporaryPassword}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`Lỗi: ${e.message}`);
    process.exitCode = 1;
  });
}
