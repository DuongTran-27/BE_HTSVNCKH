// T608 (FR26): tìm file mồ côi. Mặc định DRY-RUN (chỉ in). Chưa có Cloudinary (T403) nên chưa có chế độ xóa thật.
// Mồ côi = (a) public_id có trên kho file nhưng không Document nào tham chiếu, cũ hơn 24h;
//          (b) Document còn UPLOADING quá 24h (upload hỏng giữa chừng).
// Không bao giờ chọn Document READY (tài liệu đã nộp). Logic thuần ở findOrphans để test.
// CLI: node --env-file-if-exists=.env scripts/cleanup-orphans.js [--storage-list=file.json]
//   file.json: [{ "publicId": "...", "createdAt": "ISO" }] (xuất từ kho file; bỏ qua thì chỉ kiểm (b)).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ORPHAN_AGE_MS = 24 * 3600 * 1000;

export function findOrphans({ storageFiles = [], documents, now = new Date(), ageMs = ORPHAN_AGE_MS }) {
  const cutoff = now.getTime() - ageMs;
  const referenced = new Set(documents.map((d) => d.publicId).filter(Boolean));
  const storageOrphans = storageFiles.filter((f) => {
    const t = Date.parse(f.createdAt);
    // Ngày không đọc được -> coi như mới (không xóa nhầm).
    return !referenced.has(f.publicId) && !Number.isNaN(t) && t < cutoff;
  });
  const staleUploads = documents.filter((d) => d.status === 'UPLOADING' && new Date(d.uploadedAt).getTime() < cutoff);
  return { storageOrphans, staleUploads };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--storage-list='));
  if (process.argv.includes('--apply')) {
    console.error('Chưa hỗ trợ --apply: cần bộ chứa file Cloudinary (T403) và ghi lịch sử xóa. Chỉ chạy dry-run.');
    process.exit(2);
  }
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const documents = await prisma.document.findMany({
      select: { id: true, publicId: true, status: true, uploadedAt: true },
    });
    const storageFiles = arg ? JSON.parse(readFileSync(arg.split('=')[1], 'utf8')) : [];
    const r = findOrphans({ storageFiles, documents });
    console.log(
      `[DRY-RUN] mồ côi trên kho file: ${r.storageOrphans.length}; Document UPLOADING quá 24h: ${r.staleUploads.length}`,
    );
    r.storageOrphans.forEach((f) => console.log(`  kho: ${f.publicId}`));
    r.staleUploads.forEach((d) => console.log(`  document: ${d.id}`));
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
