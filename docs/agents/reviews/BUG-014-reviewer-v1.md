# Review BUG-014 – reviewer – v1

Kết luận: **APPROVED**

## Đã kiểm
1. `git diff -U0 -- apps`: 41 dòng chỉ đổi chuỗi tên `it` (thêm tiền tố `TC-FRxx-yy`), không đổi assert, không thêm `.skip`/`.only`.
2. Đối chiếu nội dung test với bảng FR (DAC_TA dòng 39-65): các mã đều gắn đúng hành vi.
   - FR02-05 (preview, không ghi DB) và -06 (confirm mới ghi) khớp "xem trước, chỉ ghi khi xác nhận".
   - FR10-04 (nhận xét khóa tiến độ, SV sửa → 409) khớp "không sửa sau khi GVHD nhận xét".
   - FR04-01 (ngừng dùng thay vì xóa, không có DELETE), -02 (mốc sai thứ tự), -03 (min > max) khớp.
   - FR26-01/-02 (dọn mồ côi, kiểm lại trước khi xóa), -03 (giữ 7 bản), -04 (chỉ >24h chưa tham chiếu) khớp. Phần diễn tập khôi phục được ghi rõ là chưa có test.
   - FR01, FR09, FR15, FR17, FR19, FR20, FR23 khớp. Không có mã bị trùng giữa các file.
3. `TRUY_VET.md`: 11 dòng FR có đủ số dòng file:dòng, đối chiếu bằng grep khớp 100% với vị trí `it(` trong code.
4. Tự chạy lại:
   - `npm run lint` -> sạch (`--max-warnings 0`).
   - `npm test` -> shared 73/73, api 945/945 (64 file), web 230/230 (28 file). Khớp báo cáo.

## Ghi chú nhỏ (không chặn)
- FR04-01 không kiểm riêng ca "đang được tham chiếu" (chỉ ngừng dùng/không có DELETE). Chấp nhận ở mức nhãn; có thể bổ sung sau.
- Ô Ghi chú trong TRUY_VET dán "**Mã (BUG-014):**" ngay sau câu cũ mà không có dấu chấm ngăn cách. Chỉ là cách trình bày.
