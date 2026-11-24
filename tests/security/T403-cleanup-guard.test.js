// bao-mat T403 v1: `--apply` không được xóa hàng loạt khi DB và thư mục kho không khớp nhau
// (vd. chạy với .env của dev nhưng CLOUDINARY_URL/CLOUDINARY_FOLDER của production).
// Mọi file trong thư mục đều "mồ côi" theo DB sai -> hiện tại runCleanup xóa sạch, không thể khôi phục.
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createMemoryStorage } from '../../src/lib/storage.js';
import { runCleanup } from '../../scripts/cleanup-orphans.js';

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe('cleanup-orphans --apply: chặn xóa hàng loạt', () => {
  it('toàn bộ file của thư mục đều không có Document (DB sai): không xóa gì nếu không có xác nhận rõ ràng', async () => {
    const old = new Date(Date.now() - 3 * 24 * 3600e3);
    const storage = createMemoryStorage({ now: () => old });
    const folder = `nckh/bm-guard-${Date.now()}`;
    for (let i = 0; i < 30; i += 1) await storage.upload(Buffer.from('%PDF-'), { publicId: `${folder}/topics/t${i}/f${i}.pdf` });

    const r = await runCleanup({ prisma, storage, folder, apply: true, log: () => {} }).catch((e) => ({ error: e }));

    // Chấp nhận: ném lỗi/từ chối, hoặc chạy nhưng không xóa file nào.
    expect(storage.files.size).toBe(30);
    if (!r.error) expect(r.deleted).toHaveLength(0);
  });
});
