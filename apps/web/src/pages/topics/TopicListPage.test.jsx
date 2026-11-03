import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../../lib/api.js', () => ({ api: vi.fn() }));
import { api } from '../../lib/api.js';
import { auth } from '../../lib/auth.js';
import { RepositoryDetailPage, RepositoryPage } from './RepositoryPage.jsx';
import { TopicListPage } from './TopicListPage.jsx';

const topic = (over = {}) => ({
  id: 't1', code: 'NCKH-2026-0001', title: 'Đề tài một', status: 'WAITING_ADVISOR', round: { name: 'Đợt 1', registrationOpen: false },
  field: { name: 'AI' }, advisor: null, leader: { fullName: 'An' }, memberCount: 2, latestSimilarityLevel: null, result: null, updatedAt: '2026-01-01T00:00:00Z', ...over,
});
const page = (items) => ({ items, total: items.length, page: 1, pageSize: 20 });
const calls = () => api.mock.calls.map((c) => c[0]);

const mount = (ui, url, path = '*') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[url]}><Routes><Route path={path} element={ui} /></Routes></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (url) => {
    if (url.startsWith('/invitations')) return { items: [], total: 2, page: 1, pageSize: 1 };
    if (url.startsWith('/topics')) return page([topic()]);
    return { items: [], total: 0, page: 1, pageSize: 20 };
  });
});
afterEach(cleanup);

describe('R4 danh sách đề tài', () => {
  it('SV: nút Tạo đề tài, banner lời mời, "—" cho mức chưa rõ, badge đề tài kẹt', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'STUDENT' } });
    mount(<TopicListPage />, '/de-tai');
    expect(screen.getByRole('link', { name: 'Tạo đề tài' }).getAttribute('href')).toBe('/de-tai/moi');
    expect(await screen.findByText(/Bạn có 2 lời mời đang chờ/)).toBeTruthy();
    expect(await screen.findByText('Đã đóng đăng ký')).toBeTruthy();
    expect(screen.getByText(/Chưa có mức trùng lặp/)).toBeTruthy();
    expect(screen.queryByText('Giảng viên hướng dẫn')).toBeNull();
  });

  it('cán bộ: có lọc GVHD và lối tắt; bộ lọc trên URL đi vào query, giá trị sai bị bỏ', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'STAFF' } });
    mount(<TopicListPage />, '/de-tai?status=HAS_ADVISOR&sort=bad&academicYear=abc&page=2');
    expect(screen.getByLabelText('Giảng viên hướng dẫn')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đề tài chờ GVHD' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Tạo đề tài' })).toBeNull();
    await waitFor(() => expect(calls().some((u) => u.startsWith('/topics'))).toBe(true));
    const url = calls().find((u) => u.startsWith('/topics'));
    expect(url).toContain('status=HAS_ADVISOR');
    expect(url).toContain('page=2');
    expect(url).not.toContain('sort=');
    expect(url).not.toContain('academicYear');
    expect(screen.getByText('Năm học dạng 2026-2027')).toBeTruthy();
  });

  it('lỗi API hiện error.message; rỗng hiện câu thông báo', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'LECTURER' } });
    api.mockImplementation(async () => { throw Object.assign(new Error('Máy chủ bận'), { status: 500 }); });
    mount(<TopicListPage />, '/de-tai');
    expect(await screen.findByText('Máy chủ bận')).toBeTruthy();
    cleanup();
    api.mockImplementation(async () => page([]));
    mount(<TopicListPage />, '/de-tai');
    expect(await screen.findByText('Chưa có đề tài nào.')).toBeTruthy();
  });
});

describe('R25 kho đề tài', () => {
  it('rỗng, và chỉ hiện trường API trả', async () => {
    api.mockImplementation(async () => page([]));
    mount(<RepositoryPage />, '/kho');
    expect(await screen.findByText('Kho chưa có đề tài nào đã đóng đạt.')).toBeTruthy();
    cleanup();
    api.mockImplementation(async (u) => (u.startsWith('/repository') ? page([{ code: 'NCKH-1', title: 'Mẫu', summaryExcerpt: 'Tóm tắt ngắn', field: { name: 'AI' }, academicYear: '2026-2027', result: 'GOOD' }]) : { items: [] }));
    mount(<RepositoryPage />, '/kho?result=FAIL&academicYear=2026-2027');
    expect(await screen.findByText('Tóm tắt ngắn')).toBeTruthy();
    expect(screen.getAllByText('Tốt').length).toBe(2); // option lọc + badge
    const url = calls().filter((u) => u.startsWith('/repository')).pop();
    expect(url).toContain('academicYear=2026-2027');
    expect(url).not.toContain('result=');
  });

  it('chi tiết 404 -> "Đề tài không có trong kho"', async () => {
    api.mockRejectedValue(Object.assign(new Error('Không tìm thấy'), { status: 404 }));
    mount(<RepositoryDetailPage />, '/kho/NCKH-9', '/kho/:code');
    expect(await screen.findByText('Đề tài không có trong kho')).toBeTruthy();
  });
});
