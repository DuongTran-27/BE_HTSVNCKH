// T608 (FR26): chọn bản sao lưu cần xóa để chỉ giữ N bản mới nhất. Dùng trong .github/workflows/backup.yml.
// CLI: RUN_IDS=1,2 BRANCH=main node backup-prune.js [keep] < artifacts.json  -> in id cần xóa, mỗi dòng một id (không in gì nếu rỗng).
// Đầu vào: mảng { id, name, created_at, expired? } (dạng `gh api .../actions/artifacts`).
import { pathToFileURL } from 'node:url';

// runIds (Set) + branch: chỉ tính artifact sinh từ các run của backup.yml trên nhánh mặc định (artifact lạ cùng tiền tố bị bỏ qua).
export function selectBackupsToDelete(artifacts, { keep = 7, prefix = 'nckh-backup-', runIds, branch } = {}) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('keep phải là số nguyên >= 1');
  const mine = artifacts
    .filter((a) => !runIds || runIds.has(String(a.workflow_run?.id)))
    .filter((a) => a.workflow_run?.head_repository_id === a.workflow_run?.repository_id) // loại run từ PR fork
    .filter((a) => !branch || a.workflow_run?.head_branch === branch)
    .filter((a) => a.name?.startsWith(prefix) && !a.expired && !Number.isNaN(Date.parse(a.created_at)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || String(b.id).localeCompare(String(a.id)));
  return mine.slice(keep).map((a) => a.id);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let raw = '';
  for await (const c of process.stdin) raw += c;
  const keep = process.argv[2] ? Number(process.argv[2]) : 7;
  if (!process.env.RUN_IDS || !process.env.BRANCH) throw new Error('Thiếu RUN_IDS/BRANCH: không xóa gì'); // đóng khi lỗi
  const runIds = new Set(process.env.RUN_IDS.split(','));
  const ids = selectBackupsToDelete(JSON.parse(raw), { keep, runIds, branch: process.env.BRANCH });
  if (ids.length) console.log(ids.join('\n'));
}
