import { describe, it, expect } from 'vitest';
import { selectBackupsToDelete } from '../scripts/backup-prune.js';
import { findOrphans } from '../scripts/cleanup-orphans.js';

const art = (id, day, name = 'nckh-backup-x', extra = {}) => ({
  id,
  name,
  created_at: `2026-11-${String(day).padStart(2, '0')}T20:00:00Z`,
  ...extra,
});

describe('T608 giữ 7 bản sao lưu', () => {
  it('xóa các bản cũ nhất, giữ 7 mới nhất, bất kể thứ tự đầu vào', () => {
    const list = Array.from({ length: 10 }, (_, i) => art(i + 1, i + 1)).reverse();
    expect(selectBackupsToDelete(list).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
  it('không xóa gì khi <= 7 bản; bỏ qua artifact khác tiền tố và bản đã hết hạn', () => {
    const list = [
      ...Array.from({ length: 7 }, (_, i) => art(i + 1, i + 1)),
      art(99, 1, 'coverage'),
      art(98, 1, 'nckh-backup-y', { expired: true }),
    ];
    expect(selectBackupsToDelete(list)).toEqual([]);
  });
  it('chỉ tính artifact của run backup.yml trên nhánh mặc định; artifact lạ cùng tiền tố không đẩy bản thật ra', () => {
    const mine = Array.from({ length: 7 }, (_, i) =>
      art(i + 1, i + 1, 'nckh-backup-x', { workflow_run: { id: 100 + i, head_branch: 'main', repository_id: 1, head_repository_id: 1 } }),
    );
    const foreign = Array.from({ length: 8 }, (_, i) =>
      art(50 + i, 20 + i, 'nckh-backup-evil', { workflow_run: { id: 900 + i, head_branch: 'main', repository_id: 1, head_repository_id: 1 } }),
    );
    const pr = art(77, 28, 'nckh-backup-pr', { workflow_run: { id: 100, head_branch: 'feature', repository_id: 1, head_repository_id: 1 } });
    const fork = art(78, 29, 'nckh-backup-fork', { workflow_run: { id: 100, head_branch: 'main', repository_id: 1, head_repository_id: 2 } });
    const runIds = new Set(mine.map((a) => String(a.workflow_run.id)));
    expect(selectBackupsToDelete([...mine, ...foreign, pr, fork], { runIds, branch: 'main' })).toEqual([]);
  });
  it('từ chối keep không hợp lệ', () => {
    expect(() => selectBackupsToDelete([], { keep: 0 })).toThrow();
  });
});

describe('T608 file mồ côi', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  const old = '2026-11-02T00:00:00Z';
  const fresh = '2026-11-03T06:00:00Z';
  it('chỉ chọn file kho không được tham chiếu và cũ hơn 24h', () => {
    const documents = [{ id: 'd1', publicId: 'a', status: 'READY', uploadedAt: old }];
    const storageFiles = [
      { publicId: 'a', createdAt: old }, // có tham chiếu
      { publicId: 'b', createdAt: old }, // mồ côi
      { publicId: 'c', createdAt: fresh }, // còn mới
      { publicId: 'd', createdAt: 'hỏng' }, // ngày lỗi -> giữ
    ];
    expect(findOrphans({ storageFiles, documents, now }).storageOrphans.map((f) => f.publicId)).toEqual(['b']);
  });
  it('Document UPLOADING quá 24h là mồ côi; READY không bao giờ', () => {
    const documents = [
      { id: 'u1', publicId: null, status: 'UPLOADING', uploadedAt: old },
      { id: 'u2', publicId: null, status: 'UPLOADING', uploadedAt: fresh },
      { id: 'r1', publicId: 'z', status: 'READY', uploadedAt: old },
    ];
    expect(findOrphans({ documents, now }).staleUploads.map((d) => d.id)).toEqual(['u1']);
  });
});
