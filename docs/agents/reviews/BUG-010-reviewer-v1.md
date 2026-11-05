# BUG-010 – Reviewer v1

**Kết luận: APPROVED**

- Vế khóa nay là POST /api/progress/:id/feedbacks thật (lecA), chạy song song PATCH, 12 vòng (trước 4).
- Không bị làm yếu: giữ `lockedAt` khác null; thêm kiểm feedback 201, mã `PROGRESS_LOCKED`, DB=40 ở nhánh 409; nhánh 200 kiểm DB=99 và `f.body.progress.percent`=99 (bất biến T404). Cả hai nhánh có assert riêng. Bỏ so `updatedAt <= lockedAt` hợp lý (nguyên nhân đã nêu ở T404 v1).
- Không skip/xóa test; không đổi code sản phẩm.
- Tự chạy: T402 3 lần 10/10; lint sạch; npm test shared 68, api 562, web 144 xanh. Khớp báo cáo.
- MINOR: test không ép buộc cả hai nhánh xảy ra (vẫn có thể chỉ chạy một nhánh); chấp nhận được vì T404:120 bổ sung.
