# Review T401 – reviewer v2

Kết luận: **APPROVED** (T401 + BUG-009). Tự chạy trên `nckh_t401rv_test` sau reset: lint sạch; shared 68/68, api 512/512, web 144/144.

- M1 (migration): ĐÃ SỬA. `createdById` nullable -> backfill COALESCE(GVHD hiện hành, trưởng nhóm/thành viên sớm nhất) -> SET NOT NULL; `updatedAt` thêm DEFAULT rồi DROP DEFAULT (khớp @updatedAt). Không DROP dữ liệu.
- m1 (PATCH không đổi): ĐÃ SỬA, có test (version giữ 0, không audit, vẫn kiểm version).
- Đề tài không có GVHD lẫn thành viên: SET NOT NULL sẽ lỗi. Theo schema (Topic không có cột người tạo) về lý thuyết xảy ra, nhưng mốc chỉ tạo cho đề tài IN_PROGRESS luôn có thành viên nên thực tế không gặp. MINOR, không chặn: nếu muốn chắc, thêm nhánh cuối COALESCE lấy một STAFF/ADMIN bất kỳ.
- Chưa tự chạy lại migrate trên DB có dữ liệu cũ; tin bằng chứng báo cáo (migrate diff rỗng).
