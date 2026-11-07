# Review T707 bước A (chỉ tài liệu) – reviewer v1
Kết luận: **APPROVED** (0 BLOCKER, 0 MAJOR, 3 MINOR)

## Đã kiểm
- `git diff --stat`: chỉ `docs/VAN_HANH.md`, `docs/agents/design/API_GD6.md` đổi; thêm `TRUY_VET.md`, `reports/T707a.md`. Không có file code/test bị đổi, nên không chạy lint/test.
- TRUY_VET: lấy mẫu 18 ID bằng grep (TC-FR16-C5, FR25-C8, FR14-P01, FR13-D01, FR21-E01, FR06-E09, NFR04-04, NFR07-E01, FR27-E05, FR03-C1, NFR05-01, NFR06-01, NFR08-03, FR04-20, FR25-IMP-01, FR05-E08, FR07-E06, FR06-90). Cả 18 tồn tại đúng file nêu và đúng FR/NFR. File `T609`, `T703b`, `T703c-bao-mat`, `T608`, `T606`, `perf/T704.perf.js` tồn tại. `ci.yml` không có e2e/playwright, đúng như báo cáo. Đủ M1–M5, FR01–27, NFR01–10. Khoảng trống ghi "KHÔNG CÓ", "SAU DEPLOY" và "chưa xác minh" trung thực. Mục 5 nêu đúng hạn chế khoa học của FR06.
- G45: `rounds/service.js:17-25` đúng `passes(old) && !passes(new)`. Tài liệu đã khớp code và lý do (đề tài kẹt sẵn không được chặn việc nới tham số) hợp lý.
- G46: `topics/service.js:112` dùng `isMember || isCurrentAdvisor || inStaffScope`. `snapshotService.js:66` ẩn theo `role === 'LECTURER'`, nên đúng là lệch nhau (`T609…test.js:92` so với `:166`). Quy tắc theo quan hệ chấp nhận được: `reason` là ghi chú vận hành, không thuộc phạm vi FR08/FR06 che, người chỉ đọc lịch sử chỉ nhận `null`, an toàn quyền. Đề xuất B1 đổi assertion `:166` là do đổi đặc tả, không phải làm yếu test. Yêu cầu ghi rõ trong báo cáo B1 và thêm ca GV cũ, SV đã rời (đã nằm trong B1).
- G47: `PastTopicsPage.jsx:87` đúng là dùng `SimilarityBadge` không có cờ. Đề xuất B2 hợp lý, không đổi API.
- VAN_HANH §4 bước 5 khớp `notifications/routes.js:48-51`. §6.4 điều kiện đóng MAJOR T703c mục 3 rõ ràng.
- Bước B: B1–B16 phủ đủ từng mục của dòng T707 (§2.6/§9.7, §1.1, G45, `reason`, MINOR T702b gồm B3/B4/B5/B6, T704-v2 gồm B7/B8, T705 gồm B9/B10, T706b gồm B11/B12/B13, VAN_HANH, truy vết). B5 hoãn chấp nhận (đặc tả không yêu cầu, T607b ghi không bắt buộc). B13 hoãn đúng trình tự (phải đo trước khi gỡ mã đo).

## MINOR (không chặn)
1. `API_GD6.md` §9.5/G46: nên ghi rõ SV đã rời nhận `reason: null` vì `rel.isMember` chỉ đúng với thành viên hiện tại. B1 phải có test khẳng định điều này.
2. B14 (E2E trong CI) cần chốt trước T708: làm, hoặc ghi vào hạn chế của T708. Tôi khuyên làm, vì "E2E chạy trên Linux" hiện chưa có bằng chứng.
3. `TRUY_VET.md` mục 2 có ô FR24 "chưa mở từng ca" (hết hạn 5 phút, ghi lượt tải). T708 hoặc QA phải xác minh. Ghi trung thực là đủ cho bước A.

Trả lời câu hỏi: (1) chấp nhận G46. (2) chấp nhận hoãn B5 và B13. (3) nên bắt buộc B14 hoặc ghi hạn chế vào T708.
