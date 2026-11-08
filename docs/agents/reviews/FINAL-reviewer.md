# FINAL-reviewer (T708) – lần 1

Kết luận: **CHANGES_REQUESTED** (chưa hoàn tất bước 2 do môi trường; thêm 1 mục không đạt ở bước 4).

## 1. BANG_CONG_VIEC: ĐẠT
Mọi dòng T/BUG ở DONE, trừ T708 (DOING). Không có dòng BLOCKED. (`grep` theo cột trạng thái.)

## 2. Chạy lệnh hai lần liên tiếp: CHƯA XÁC NHẬN (bị chặn bởi môi trường)
- `npm run db:test:up` -> "Kiểm tra DB test: tất cả OK", exit 0.
- `npm ci` (lần 1 và 2) -> exit 127 / EPERM:
  `npm error code EPERM ... unlink 'D:\Website_HTWLHD_SV_NCKH_demo3\node_modules\.prisma\client\query_engine-windows.dll.node'`
- Nguyên nhân: hai tiến trình node còn sót chiếm DLL Prisma: PID 16692 (`npx vitest run -w apps/api`) và PID 11776 (`vitest.mjs run -w apps/api`). Reviewer không có quyền kết thúc tiến trình này (bị chặn) và không phải tiến trình do reviewer khởi chạy.
- Hệ quả: `npm ci` đã xóa dở `node_modules` (còn ~26 thư mục) nên `lint`, `test:coverage`, `test`, `build`, `test:e2e` đều lỗi ngay (exit 1) ở cả hai lượt. Đây là lỗi môi trường, **không** phải bằng chứng code đỏ, nhưng cũng chưa có bằng chứng xanh.
- Việc cần làm: người dùng kết thúc hai tiến trình vitest trên, rồi chạy lại T708 (cần `npm ci` thành công trước).
- Lệnh coverage dự kiến: `npm run test:coverage` (gốc, `vitest run --coverage`, projects `packages/*` + `apps/*`, include `apps/api/src/modules/**` và `packages/shared/src/**`, xem `vitest.config.js`). Chưa chạy được.

## 3. `.only/.skip/it.todo/test.fixme`: ĐẠT
`git grep` chỉ thấy 4 dòng trong tài liệu (`docs/agents/reports/T203.md:182,241`, `reviews/T203-reviewer-v1.md:14`, `v2.md:14`), là chữ mô tả "grep .skip/.only/it.todo". Không có trong test hoặc code.

## 4. TRUY_VET (mã TC-FRxx): KHÔNG ĐẠT
Bảng FR ở `docs/DAC_TA.md` dòng 39-65. Mã `TC-FRxx` tìm thấy trong `apps`/`packages` (git grep): FR03, 04, 05, 06, 07, 08, 11, 12, 13, 14, 15, 16, 17, 21, 24, 25, 27.
**Thiếu mã TC-FRxx cho FR mức P1/P2: FR01, FR02, FR09, FR10 (P1); FR19, FR20, FR23, FR26 (P2).** (FR18, FR22 là P3, không bắt buộc.) Các FR này có test tích hợp nhưng chỉ ghi theo tên file/khối describe trong `TRUY_VET.md` (vd. FR01 `auth.test.js`, FR19 `T601-change-requests.test.js`). Đề xuất: thêm tiền tố `TC-FRxx-nn` vào tên ít nhất một test đạt của mỗi FR trên và cập nhật TRUY_VET. Ngoài ra FR04/FR15/FR17 chỉ có 1 mã, nằm ở `T203-qa-seed.test.js` (kiểm dữ liệu seed), yếu; nên bổ sung mã ở test thật. Việc xác nhận các test này **đạt** phụ thuộc bước 2 (chưa có).

## 5. NFR01–NFR10: ĐẠT CÓ ĐIỀU KIỆN (bằng chứng tài liệu, chưa chạy lại)
Bảng `docs/agents/TRUY_VET.md` mục 3 trích đường dẫn cho cả 10 NFR. Phần chỉ kiểm được sau deploy (người làm): NFR01 cookie Chrome/Safari; NFR02 CORS và header bảo mật trên Vercel thật; NFR03 anon key Data API, tách role; NFR04 p95 trên Render+Supabase (số đo T704 là máy dev, `reports/T704.md`); NFR10 toàn bộ (`docs/VAN_HANH.md` §6.4 chín mục, chưa có số đo); NFR09 chưa gắn `thresholds` 70%, chỉ báo cáo. Cấu hình: `apps/web/vercel.json`, `render.yaml`, `.github/workflows/*.yml`.

## 6. Bí mật trong repo: ĐẠT
`git grep` mẫu postgres/Cloudinary: toàn bộ là giá trị cục bộ/giả: `postgres:postgres@localhost:54329|54330` (`apps/api/.env.test`, `apps/api/scripts/db-dev.js`, `apps/web/e2e/env.js`, `README.md`), `u:p@...`/`.invalid` trong test, báo cáo và review, và mẫu lệnh trong `.claude/commands/kiem-tra-cuoi.md`. Chấp nhận được (DB test Docker/embedded cục bộ, đã có chốt chặn host cục bộ). Không có bí mật thật. Không đọc `.env`.

## Hạn chế đã biết
Job e2e trong CI chưa chạy thật trên GitHub.

## Mục không đạt / chưa xong
1. Bước 2 chưa xác nhận (tiến trình vitest PID 16692/11776 khóa Prisma DLL; `node_modules` đang hỏng sau `npm ci` thất bại, cần `npm ci` lại).
2. Bước 4: thiếu mã TC-FR cho FR01, FR02, FR09, FR10, FR19, FR20, FR23, FR26.
