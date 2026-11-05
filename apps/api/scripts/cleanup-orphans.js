// T608 + T403 (FR26, API_GD45 §5.7): dọn file mồ côi trên Cloudinary. Mặc định DRY-RUN (chỉ in); `--apply` mới xóa.
// Mồ côi = (a) public_id có trên kho file (raw/authenticated, trong <CLOUDINARY_FOLDER>/) nhưng không Document nào tham chiếu, cũ hơn 24h;
//          (b) Document còn UPLOADING quá 24h (chỉ báo cáo; không xóa dòng DB nào – trigger chặn).
// Không bao giờ xóa publicId có trong Document (mọi tài liệu đã nộp). Mỗi file xóa ghi AuditLog STORAGE_ORPHAN_DELETE.
// CLI: node --env-file-if-exists=.env scripts/cleanup-orphans.js [--apply [--max-delete=N]] [--storage-list=file.json]
//   --apply bắt buộc CLOUDINARY_FOLDER đặt tường minh; từ chối khi mồ côi > 10 file hoặc > 10% số file trừ khi --max-delete=N đủ lớn.
//   Có CLOUDINARY_URL: liệt kê thẳng từ Cloudinary. Không có: dùng file.json [{ "publicId", "createdAt" }] (chỉ dry-run).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { recordAudit } from '../src/modules/audit/service.js';
import { defaultStorageFolder } from '../src/lib/storage.js';

// Chốt chặn: DB không khớp thư mục kho (vd. DB dev + kho production) làm mọi file thành "mồ côi".
export const MAX_AUTO_DELETE = 10;
export const MAX_AUTO_RATIO = 0.1;

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

// Liệt kê hết các trang (next_cursor) của storage.list (lib/storage.js).
export async function listStorageFiles(storage, prefix) {
  const out = [];
  let cursor = null;
  do {
    const page = await storage.list({ prefix, cursor });
    for (const r of page.resources) out.push({ publicId: r.public_id, createdAt: r.created_at, bytes: r.bytes });
    cursor = page.next_cursor;
  } while (cursor);
  return out;
}

// Trả { storageOrphans, staleUploads, deleted, failed }. Lỗi xóa một file không dừng cả lượt (đếm vào failed).
export async function runCleanup({ prisma, storage, folder, storageFiles, apply = false, maxDelete = null, now = new Date(), log = console.log }) {
  const files = storageFiles ?? (await listStorageFiles(storage, `${folder}/`));
  const documents = await prisma.document.findMany({ select: { id: true, publicId: true, status: true, uploadedAt: true } });
  const r = findOrphans({ storageFiles: files, documents, now });
  const deleted = [];
  const failed = [];
  if (apply) {
    const n = r.storageOrphans.length;
    const overDefault = n > MAX_AUTO_DELETE || n > files.length * MAX_AUTO_RATIO;
    if (maxDelete == null ? overDefault : n > maxDelete) {
      throw new Error(`TỪ CHỐI xóa ${n}/${files.length} file mồ côi (vượt ngưỡng an toàn). Kiểm tra DB và CLOUDINARY_FOLDER có khớp nhau; nếu đúng, chạy lại với --max-delete=${n}. Không xóa gì.`);
    }
    for (const f of r.storageOrphans) {
      try {
        // Kiểm lại ngay trước khi xóa: tuyệt đối không xóa file đã có Document tham chiếu.
        if ((await prisma.document.count({ where: { publicId: f.publicId } })) > 0) continue;
        // Ghi AuditLog trước: lỗi ghi -> không xóa (đóng an toàn). Xóa lỗi sau đó -> lượt sau thử lại.
        await recordAudit(prisma, {
          actorId: null, action: 'STORAGE_ORPHAN_DELETE', entityType: 'StorageObject', entityId: f.publicId,
          after: { bytes: f.bytes ?? null, createdAt: f.createdAt },
        });
        await storage.destroy(f.publicId);
        deleted.push(f.publicId);
      } catch (e) {
        failed.push(f.publicId);
        log(`  LỖI xóa ${f.publicId}: ${e?.message}`);
      }
    }
  }
  const mode = apply ? 'APPLY' : 'DRY-RUN';
  log(`[${mode}] mồ côi trên kho file: ${r.storageOrphans.length}; đã xóa: ${deleted.length}; lỗi: ${failed.length}; Document UPLOADING quá 24h: ${r.staleUploads.length}`);
  r.storageOrphans.forEach((f) => log(`  kho: ${f.publicId}`));
  r.staleUploads.forEach((d) => log(`  document: ${d.id}`));
  return { ...r, deleted, failed };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const arg = process.argv.find((a) => a.startsWith('--storage-list='));
  const md = process.argv.find((a) => a.startsWith('--max-delete='));
  const maxDelete = md ? Number(md.split('=')[1]) : null;
  if (md && !(Number.isInteger(maxDelete) && maxDelete >= 0)) {
    console.error('--max-delete phải là số nguyên >= 0. Không xóa gì.');
    process.exit(2);
  }
  if (apply && !process.env.CLOUDINARY_FOLDER) {
    console.error('--apply cần đặt tường minh CLOUDINARY_FOLDER (không dùng mặc định). Không xóa gì.');
    process.exit(2);
  }
  let storage = null;
  if (process.env.CLOUDINARY_URL) {
    const { v2: cloudinary } = await import('cloudinary'); // SDK tự đọc CLOUDINARY_URL
    const { createCloudinaryStorage } = await import('../src/lib/storage.js');
    storage = createCloudinaryStorage({ cloudinary });
  } else if (apply) {
    console.error('--apply cần CLOUDINARY_URL (liệt kê và xóa trên Cloudinary). Không xóa gì.');
    process.exit(2);
  }
  const storageFiles = storage ? undefined : arg ? JSON.parse(readFileSync(arg.split('=')[1], 'utf8')) : [];
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const r = await runCleanup({ prisma, storage, folder: defaultStorageFolder(process.env), storageFiles, apply, maxDelete });
    if (r.failed.length) process.exitCode = 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
