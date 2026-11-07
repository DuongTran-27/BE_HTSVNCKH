import { expect, test } from '@playwright/test';
import { data, loggedIn, overflowX, settled } from './helpers.js';

// T702: UI GĐ6 với backend thật (FR21 người đã rời nhóm, G5 cờ chưa kiểm tra) và NFR07 ở 360 px.

test.describe('FR21 người đã rời nhóm', () => {
  test('TC-FR21-E01 SV xin rời nhóm, cán bộ duyệt; SV10 mở lịch sử, lần gửi và so sánh không gặp 403', async ({ browser }) => {
    const S = data();
    const { leave } = S.gd6;
    const sv = await loggedIn(browser, S.users.sv10.code);
    await sv.goto(`/de-tai/${leave.id}/yeu-cau`);
    await sv.getByRole('button', { name: 'Xin rời nhóm' }).click();
    const form = sv.getByRole('dialog', { name: /rời nhóm/i });
    await form.getByLabel('Lý do').fill('Tôi chuyển sang đề tài khác nên xin rời nhóm.');
    await form.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expect(sv.getByText('Đã gửi yêu cầu')).toBeVisible();

    const cb = await loggedIn(browser, S.users.cb.code);
    await cb.goto(`/de-tai/${leave.id}/yeu-cau`);
    await cb.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await cb.getByRole('dialog', { name: 'Duyệt yêu cầu' }).getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(cb.getByText('Đã cập nhật yêu cầu')).toBeVisible();

    const statuses = [];
    sv.on('response', (r) => { if (r.url().includes('/api/') && r.status() === 403) statuses.push(r.url()); });
    await sv.goto(`/de-tai/${leave.id}`);
    await expect(sv.getByText('Bạn không có quyền xem đề tài này')).toBeVisible(); // mất quyền xem đầy đủ
    statuses.length = 0;
    await sv.goto('/lich-su-tham-gia');
    await expect(sv.getByRole('link', { name: new RegExp(leave.code) })).toBeVisible();
    await sv.getByRole('link', { name: new RegExp(leave.code) }).click();
    await expect(sv.getByRole('heading', { name: 'Phiên bản trong thời gian tham gia' })).toBeVisible();
    await expect(sv.getByRole('link', { name: 'Lần gửi 1' })).toBeVisible();
    await sv.getByLabel('Chọn lần gửi 1 để so sánh').check();
    await sv.getByLabel('Chọn lần gửi 2 để so sánh').check();
    await sv.getByRole('button', { name: 'So sánh 2 lần đã chọn' }).click();
    await expect(sv.getByRole('heading', { name: 'So sánh các lần gửi' })).toBeVisible();
    await settled(sv);
    await sv.goBack();
    await sv.getByRole('link', { name: 'Lần gửi 2' }).click();
    await expect(sv.getByRole('heading', { name: 'Lần gửi 2' })).toBeVisible();
    await settled(sv);
    expect(statuses, '403 khi người đã rời mở SubmissionPage/SubmissionDiffPage').toEqual([]);
    await sv.context().close();
    await cb.context().close();
  });
});

test.describe('G5 cờ chưa kiểm tra', () => {
  test('TC-FR06-E09 FR06 lỗi: cán bộ cho phép gửi (bắt buộc lý do); SV thấy ghi chú; SV không có nút', async ({ browser }) => {
    const S = data();
    const { g5 } = S.gd6;
    const cb = await loggedIn(browser, S.users.cb.code);
    await cb.goto(`/de-tai/${g5.id}`);
    await cb.getByRole('button', { name: 'Cho phép gửi khi chưa kiểm tra' }).click();
    const dlg = cb.getByRole('dialog', { name: 'Cho phép gửi khi chưa kiểm tra' });
    await dlg.getByRole('button', { name: 'Cho phép', exact: true }).click();
    await expect(dlg).toBeVisible(); // thiếu lý do -> không gửi
    await dlg.getByLabel('Lý do').fill('Máy chủ kiểm tra trùng lặp đang bảo trì, hạn nộp sát.');
    await dlg.getByRole('button', { name: 'Cho phép', exact: true }).click();
    await expect(cb.getByText('Đã cho phép gửi khi chưa kiểm tra')).toBeVisible();
    await expect(cb.getByText(/Cán bộ đã cho phép gửi dù chưa kiểm tra được/)).toBeVisible();
    await expect(cb.getByRole('button', { name: 'Cho phép gửi khi chưa kiểm tra' })).toHaveCount(0); // đã cấp, không cấp lại

    const sv = await loggedIn(browser, S.users.sv17.code);
    await sv.goto(`/de-tai/${g5.id}`);
    await expect(sv.getByText(/Cán bộ đã cho phép gửi dù chưa kiểm tra được/)).toBeVisible();
    await expect(sv.getByRole('button', { name: 'Cho phép gửi khi chưa kiểm tra' })).toHaveCount(0);
    await sv.context().close();
    await cb.context().close();
  });
});

test.describe('NFR07 viewport', () => {
  test('TC-NFR07-E01 /thong-ke và /thong-bao không tràn ngang (mobile 360 px)', async ({ browser }) => {
    const S = data();
    const cb = await loggedIn(browser, S.users.cb.code);
    for (const path of ['/thong-ke', '/thong-ke?groupBy=academicYear', '/thong-bao', '/xet-duyet', '/yeu-cau']) {
      await cb.goto(path);
      await settled(cb);
      expect(await overflowX(cb), path).toBeLessThanOrEqual(0);
    }
    await cb.context().close();
  });
});
