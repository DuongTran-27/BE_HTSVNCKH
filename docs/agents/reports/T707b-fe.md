# T707 bước B – lượt FE (B2, B6, B8)

## Thay đổi
- B2: `apps/web/src/pages/topics/PastTopicsPage.jsx` – `PastTopicDetailPage` dùng `SimilarityLevelCell level/status/unchecked` (G47). Test mới trong `tests/change-requests.test.jsx`: lần gửi `unchecked` → "Gửi khi chưa kiểm tra", không có "Không trùng".
- B6: `apps/web/src/routes.jsx` – `hydrateFallbackElement` cho route `/dang-nhap` và route gốc (Layout), cả hai có loader.
- B8: `apps/web/src/pages/stats/StatsPage.jsx` – `<StuckTopics key={params.roundId} …>`; test mới `tests/stuck-topics.test.jsx`.

## Bằng chứng
- `npm run lint`: 0 lỗi, 0 cảnh báo.
- `npm test -w @nckh/web`: 28 file, 230 test passed.
- `npm run build -w @nckh/web`: built OK (chỉ cảnh báo kích thước chunk có sẵn).
- `npm run test:e2e -w @nckh/web` (sau `npm run db:test:up`): 54 passed; `grep -ci hydratefallback` trên log = 0.

## Hạn chế
Test B8 truyền `key` trong khung test (kiểm mẫu remount), không render `StatsPage` thật. `npm test` gốc chưa chạy toàn bộ (chỉ web).
