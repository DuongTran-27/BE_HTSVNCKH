// Tạo quản trị viên ĐẦU TIÊN (production): chạy bằng CLI một lần (scripts/create-admin.js), không có mật khẩu công khai.
// Mật khẩu tạm sinh ngẫu nhiên, chỉ trả về cho lệnh CLI in một lần; DB chỉ lưu hash; AuditLog không có mật khẩu.
import { userCreateSchema, ROLES } from '@nckh/shared';
import { recordAudit } from '../audit/service.js';
import { generateTempPassword } from '../../lib/tempPassword.js';

export const createFirstAdmin = async (prisma, hasher, input, { force = false, genPassword = generateTempPassword } = {}) => {
  const parsed = userCreateSchema.safeParse({ ...input, role: ROLES.ADMIN });
  if (!parsed.success) {
    throw new Error(`Dữ liệu không hợp lệ – ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const { code, email, fullName } = parsed.data;
  const temporaryPassword = genPassword();
  const passwordHash = await hasher.hash(temporaryPassword, { temporary: true });
  const user = await prisma.$transaction(async (tx) => {
    // Khóa tư vấn: hai lệnh chạy đồng thời không cùng qua kiểm "chưa có quản trị viên"
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('create-first-admin'))`;
    if (!force && (await tx.user.count({ where: { role: ROLES.ADMIN } })) > 0) {
      throw new Error('Đã có quản trị viên. Cần tạo thêm thì dùng --force; bình thường hãy tạo qua giao diện bằng tài khoản quản trị.');
    }
    // Trùng mã (kể cả khác hoa/thường – unique index lower(code)) hoặc email -> P2002
    const row = await tx.user
      .create({ data: { code, email, fullName, role: ROLES.ADMIN, passwordHash, mustChangePassword: true } })
      .catch((e) => {
        throw e?.code === 'P2002' ? new Error('Mã hoặc email đã tồn tại') : e;
      });
    await recordAudit(tx, {
      actorId: null,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: row.id,
      before: null,
      after: { code, role: ROLES.ADMIN, email, fullName, via: 'cli:create-admin' },
    });
    return row;
  });
  return { user, temporaryPassword };
};
