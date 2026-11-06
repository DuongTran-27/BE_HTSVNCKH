# Review T701 – reviewer – vòng 1
Kết luận: APPROVED

## Đã tự chạy
- npm run lint: sạch. npm test: api 58 file / 735 test, web 24 file / 212 test, đều xanh (khớp báo cáo).

## Đối chiếu
- Shape body/query sinh từ Zod chung bằng z.toJSONSchema (spec.js:105-108); không chép tay. Đạt.
- Production: route chỉ mount khi NODE_ENV !== 'production' (app.js:48), test xác nhận 404 cho json và docs. Spec không chứa secret (test kiểm JWT secret). Đạt.
- CSP chỉ set trên GET /api/docs (app.js:51); các route khác giữ CSP helmet. Đạt.
- Test đối chiếu route: duyệt router.stack qua mount; thêm route mới mà quên khai báo thì `actual - documented` khác rỗng nên đỏ; ngược lại cũng đỏ. Router lồng cũng làm test đỏ có chủ đích. Đạt.
- Không đổi route nghiệp vụ. Đạt.

## BLOCKER / MAJOR
Không có.

## MINOR (không chặn)
1. spec.js:157-159 – CDN `swagger-ui-dist@5` chưa ghim phiên bản chính xác, không SRI. Quyết định: CHẤP NHẬN CDN + CSP riêng vì chỉ chạy ngoài production, không thêm npm. Nên ghim bản đầy đủ (vd `@5.x.y`) và thêm integrity khi rảnh.
2. Vai trò trong ROUTES chỉ là mô tả, không có test đối chiếu với guard thật (đã ghi trong báo cáo); có thể lệch âm thầm.
3. test dòng 46: `GET /api/health` viết cứng; route khai báo trực tiếp trên app khác sẽ không được test bắt. Test cũng bỏ sót mount dạng `app.use(router)` không tiền tố (chặn một phần bởi ngưỡng size > 80).
4. Biến ENABLE_SWAGGER trong env.js không dùng; nên xóa hoặc dùng để tránh gây hiểu nhầm.
5. Response 200 chưa có schema thân.
