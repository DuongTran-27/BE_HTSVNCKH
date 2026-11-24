// Email thông báo FR29 (API_GD7 §9). Hộp thư đi là các cột email* của Notification; gửi NGOÀI transaction nghiệp vụ
// nên lỗi SMTP không bao giờ làm request lỗi. Bảo đảm "ít nhất một lần" (m6d): sập giữa gửi và đánh dấu SENT → gửi lại sau 15 phút.

export const MAX_ATTEMPTS = 3;
export const STALE_MS = 15 * 60 * 1000;
const PREFIX = '[NCKH Khoa CNTT] ';

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// m6a BM: title chứa tên đề tài do SV nhập – thay ký tự điều khiển (CR/LF…) để không chèn được header
// eslint-disable-next-line no-control-regex -- cố ý khớp ký tự điều khiển
export const mailSubject = (title) => `${PREFIX}${title}`.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);

// m6b BM: link null/không phải đường dẫn nội bộ → trang thông báo
export const mailLink = (appUrl, link) =>
  `${appUrl}${typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : '/thong-bao'}`;

/** Thư chỉ gồm tiêu đề thông báo + đường dẫn vào hệ thống (§9.3) – không thêm dữ liệu nào khác. */
export function buildMail(n, { to, from, appUrl }) {
  const url = mailLink(appUrl, n.link);
  return {
    from,
    to,
    subject: mailSubject(n.title),
    text: `${n.title}\n\nĐăng nhập để xem chi tiết: ${url}\n`,
    html: `<!doctype html><html lang="vi"><meta charset="utf-8"><body><p>${escapeHtml(n.title)}</p>`
      + `<p><a href="${escapeHtml(url)}">Đăng nhập để xem chi tiết</a></p></body></html>`,
  };
}

/**
 * Gửi tối đa `limit` thư đang chờ. Nhiều tiến trình chạy song song không lấy trùng dòng (FOR UPDATE SKIP LOCKED + SENDING).
 * transport: đối tượng có sendMail(msg) (nodemailer hoặc giả trong test). Trả số dòng theo kết quả.
 */
export async function dispatchEmails({ prisma, transport, from, appUrl, logger, limit = 50, now = () => new Date() }) {
  const stale = new Date(now().getTime() - STALE_MS);
  // 0. m6c BM: SENDING treo đã hết lượt → FAILED, không treo vĩnh viễn
  await prisma.notification.updateMany({
    where: { emailStatus: 'SENDING', emailClaimedAt: { lt: stale }, emailAttempts: { gte: MAX_ATTEMPTS } },
    data: { emailStatus: 'FAILED' },
  });
  // 1. Nhận việc: một câu lệnh = một transaction ngắn
  const rows = await prisma.$queryRaw`
    UPDATE "Notification" SET "emailStatus" = 'SENDING', "emailClaimedAt" = ${now()}, "emailAttempts" = "emailAttempts" + 1
    WHERE id IN (
      SELECT id FROM "Notification"
      WHERE "emailAttempts" < ${MAX_ATTEMPTS}
        AND ("emailStatus" = 'PENDING' OR ("emailStatus" = 'SENDING' AND "emailClaimedAt" < ${stale}))
      ORDER BY "createdAt" LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING id, "userId", title, link, "emailAttempts"`;
  // 2. Gửi ngoài transaction
  const result = { sent: 0, retry: 0, failed: 0, skipped: 0 };
  for (const n of rows) {
    const user = await prisma.user.findUnique({ where: { id: n.userId }, select: { email: true, isLocked: true } });
    if (!user?.email || user.isLocked) {
      await prisma.notification.update({ where: { id: n.id }, data: { emailStatus: 'SKIPPED' } });
      result.skipped += 1;
      continue;
    }
    try {
      await transport.sendMail(buildMail(n, { to: user.email, from, appUrl }));
      await prisma.notification.update({ where: { id: n.id }, data: { emailStatus: 'SENT', emailedAt: now() } });
      result.sent += 1;
    } catch (e) {
      const last = n.emailAttempts >= MAX_ATTEMPTS;
      await prisma.notification.update({ where: { id: n.id }, data: { emailStatus: last ? 'FAILED' : 'PENDING' } });
      result[last ? 'failed' : 'retry'] += 1;
      // Không log địa chỉ, nội dung hay thông điệp lỗi (có thể chứa địa chỉ) – chỉ mã thông báo và mã lỗi
      logger?.warn({ notificationId: n.id, attempt: n.emailAttempts, errCode: e?.code ?? e?.name }, 'Gửi email thông báo thất bại');
    }
  }
  return result;
}
