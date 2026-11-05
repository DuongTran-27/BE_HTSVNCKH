# T504 – Review vòng 1 (reviewer)

Kết luận: **APPROVED** (không BLOCKER/MAJOR)

## Lệnh tự chạy
- `npm run lint` (max-warnings 0): xanh.
- `npm test`: shared 73/73, api 616/616, web 168/168: xanh.
- `npm run build -w @nckh/web`: xanh; còn cảnh báo chunk > 500 kB (index 522 kB, StatsPage 394 kB).

## Quyết định cho câu hỏi của dev
1. DRAFT trong widget kẹt: KHÔNG cần. FR16.5 (DAC_TA dòng 133) chỉ nói đề tài "vẫn ở Chờ GVHD"; UI.md dòng 131 nói widget "dùng cùng truy vấn" với lối tắt R4 (WAITING_ADVISOR/HAS_ADVISOR). Giữ nguyên.
2. Lazy-load: StatsPage đã lazy, Recharts đã nằm chunk riêng, không cần làm thêm. Chunk index 522 kB là bundle chính có từ trước, không thuộc T504. Ghi nhận cho T7xx, không chặn.
3. `api(..., { as: 'blob' })`: chấp nhận (đi qua client duy nhất, giữ Bearer và refresh 401; không đổi hợp đồng API).

## Đối chiếu
- CSV dùng đúng chuỗi query của biểu đồ/bảng (`StatsPage.jsx:32,36,44`, một biến `query`), có test.
- Quyền: menu Thống kê chỉ STAFF/LECTURER; route `[L, F]` (SV/Admin bị chặn); backend vẫn kiểm quyền (T503). `lecturerId` chỉ gửi với STAFF.
- Chuông: `refetchInterval` 60 s, TanStack mặc định không poll khi tab ẩn; ẩn khi `mustChangePassword`; lỗi poll im lặng (hợp lý).
- Lỗi tải: QueryBox có Thử lại, lỗi CSV hiển thị `role="alert"`.

## MINOR (không chặn)
- `StuckTopics.jsx:12`: cắt ở 100 đề tài/trạng thái, đã ghi `shortcut`; lọc `registrationOpen` phía client nên đợt lớn có thể bỏ sót. Nâng lên khi API có tham số lọc.
- Chưa kiểm bằng mắt ở 360 px (báo cáo đã nêu); nên kiểm ở E2E/T7xx.
- Test chỉ có 5 ca; biểu đồ mock trong jsdom, chấp nhận vì bảng là nguồn kiểm.
