# T407 – Review v1 (reviewer)
Kết luận: APPROVED

Tự chạy: db:test:up OK; test:e2e 16 passed (42.2s); lint sạch; npm test shared 69, api 578, web 163 xanh. Khớp báo cáo.

Đối chiếu: luồng nộp mốc -> nộp muộn (E02) -> nhận xét + đánh giá (E03) -> kết quả cuối, đủ điều kiện (E04) -> đề nghị đóng -> xác nhận đóng (E05); ca âm E06/E07; 360 px E08 (nút >= 44 px, không tràn). Không skip/fail/only. Không sửa code sản phẩm (diff chỉ prepare.js thêm dữ liệu seed).

MINOR
1. m4.spec.js:41-43 serial phụ thuộc state chung giữa E01-E05 (hợp lý vì là chuỗi nghiệp vụ). Không phụ thuộc m1: dữ liệu SVE2E4/5 và 2 đề tài do prepare.js tạo riêng; chỉ dùng chung tài khoản GVE2E/CBE2E và mật khẩu seed. Rủi ro: nếu m1 đổi mật khẩu/khóa GV hay CB thì m4 hỏng; hiện m1 chạy trước (alphabet) vẫn xanh. Nên ghi chú trong spec.
2. Nhãn "Nộp muộn" dựa vào hạn seed trong quá khứ, không phải nộp thực tế quá hạn qua giờ server; chấp nhận được, đã nêu trong báo cáo.
3. E06 chỉ khớp tên mốc trong hộp thoại, chưa kiểm mã lỗi; chấp nhận.
