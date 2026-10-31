# Review T199 – reviewer – vòng 1
Kết luận: APPROVED

Đây là task thiết kế (chỉ thêm `docs/agents/design/QD_ZOD.md` và báo cáo). Tôi review theo ba tiêu chí: quyết định có đúng không, có đủ không, backend-dev có làm theo được không. Mọi khẳng định kỹ thuật trong quyết định tôi đều tự kiểm bằng lệnh, không dựa vào báo cáo.

## Tôi đã tự kiểm tra
File đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `docs/DAC_TA.md` (NFR02, dòng 203), `docs/agents/reports/T199.md`, `docs/agents/design/QD_ZOD.md`, `packages/shared/src/schemas.js`, `apps/api/src/config/env.js`, `apps/api/src/middlewares/validate.js`, `apps/api/src/middlewares/errorHandler.js`, `apps/api/src/app.js`, `docs/agents/BANG_CONG_VIEC.md` (T199–T215).

| Lệnh | Kết quả |
|---|---|
| `npm ls zod` | `@nckh/api` → `zod@3.25.76`, `@nckh/shared` → `zod@3.25.76 deduped` (đúng, đang có một bản) |
| `npm audit` | `zod <4.6.6 · high · GHSA-mrhx-c7xc-m3w5 · CWE-770 · CVSS 7.5`, fixAvailable `zod@4.6.7` (isSemVerMajor). Khớp với QĐ. Ngoài ra còn `vitest` (critical, direct), `tinypool` (critical), `vite` (high): nằm ngoài phạm vi T199, xem vấn đề #5 |
| `npm view zod version` / `npm view zod@4.6.6 version` | `4.6.7` / `4.6.6` (có bản vá) |
| `npm test` | shared 5/5 passed, api 39/39 passed |
| `npm run lint` | Lỗi `'eslint' is not recognized`: ESLint chưa được cài, vẫn đang chờ T202. Task này không đổi code nên không tính lỗi cho T199 |
| `grep zod` trong `packages/*/package.json`, `apps/*/package.json`, `apps/api/src` | Chỉ có 3 file nguồn dùng zod: `schemas.js`, `env.js`, `validate.js`. `apps/web` hiện là thư mục rỗng. Khớp §2 |
| Cài `zod@4.6.7` ở scratchpad rồi chạy thử từng API mà QĐ nhắc đến | `z.string({ required_error })` khi đầu vào `undefined` → `"Invalid input: expected string, received undefined"`: tùy chọn này bị **bỏ qua im lặng**, đúng là chỗ phá vỡ. `z.string({ error: 'Chọn lĩnh vực' })` → `"Chọn lĩnh vực"`. `.min/.refine(…, 'msg')` vẫn nhận tham số chuỗi. `.optional().default('' / [])` → OK. `z.object` vẫn bỏ khóa lạ. `z.coerce.number()` với `''` → 0. `z.stringbool().default(false)`: `'false'` → false, `undefined` → false, `'abc'` → lỗi. `z.locales.vi` có, ra thông điệp kiểu `"Quá lớn: mong đợi string có <=3 ký tự"`. `z.array(el).max(2)` với mảng 10 000 phần tử thì phần tử được kiểm **0 lần**, tức bản 4.6.7 cắt sớm theo độ dài |
| `loadEnv({ ENABLE_SWAGGER: 'false', … })` trên code hiện tại | `true`: lỗi coerce.boolean là thật |
| Gửi body JSON 1,1 MB tới `POST /api/auth/login` (`createApp` + supertest, logger pino silent) | `500 {"error":{"code":"INTERNAL",…}}`: đúng như QĐ nói, `errorHandler` không xử lý `entity.too.large` |
| Rà `.max()` trong `schemas.js` | Đúng 4 nhóm vi phạm mà §5 liệt kê: `loginSchema` (dòng 27–28), `changePasswordSchema` (32–33), `topicSubmitSchema.summary/objectives` và phần tử `keywords` (20–22), `fieldId` ở cả hai schema (14, 23). `reasonSchema` đã có `.max(2000)`. Không sót chỗ nào |

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Có quyết định rõ: nâng 3 → 4 hay dùng biện pháp thay thế | Đạt | Chọn nâng lên `^4.6.6` **và** thêm lớp giới hạn body/`.max()`. Có nêu lý do bác phương án ở lại zod 3 và phương án dùng `zod/v4` trong 3.25.x |
| Ghi `design/QD_ZOD.md` | Đạt | Có đủ §1–§7 |
| Đánh giá mức phá vỡ chính xác | Đạt | Tôi xác nhận bằng chạy thử: chỉ `schemas.js:23` hỏng hành vi; các API còn lại giữ nguyên |
| NFR02 "Zod kiểm tra dữ liệu ở cả hai phía", lỗi trả mã chuẩn | Đạt (thiết kế) | Vẫn dùng chung schema cho client và server. Lỗi 413 có mã chuẩn và thông điệp tiếng Việt, thay cho 500 |
| Khả thi để BE làm theo | Đạt | T215 đã có trong bảng (dòng 18). Danh sách test và bằng chứng bắt buộc cụ thể. T206 phụ thuộc T215, nên T207–T211 cũng gián tiếp phải chờ T215 |
| Test tự động | Không áp dụng | Task thiết kế. Test đã giao cho T215 |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `docs/agents/design/QD_ZOD.md` §5, mục "Các chỗ hiện đang vi phạm" | Chưa ghi con số `.max()` cụ thể cho `topicSubmitSchema.summary/objectives`. Mức tham khảo ở §5.1 (tóm tắt 5000) không nhắc đến `objectives`, trong khi bản nháp đang dùng `objectives.max(3000)`. Nếu T215 chọn số khác bản nháp thì sẽ có hồ sơ lưu nháp được nhưng không gửi được, hoặc ngược lại | Ghi rõ: `summary.max(5000)`, `objectives.max(3000)`, phần tử `keywords.max(60)`, **trùng đúng với `topicDraftSchema`**. Tốt hơn nữa là tách các hằng/trường dùng chung giữa nháp và gửi để hai schema không lệch nhau. T215 có thể tự áp dụng, không cần sửa lại QĐ |
| 2 | MINOR | `QD_ZOD.md` §2, dòng `z.coerce.boolean()` | Nói "đặt `ENABLE_SWAGGER=false` trên production vẫn mở Swagger" là phóng đại. Hiện chưa có code nào đọc `ENABLE_SWAGGER` (grep `apps/api/src` chỉ thấy `env.js:11`), nên lỗi này mới tiềm ẩn. QĐ cũng chưa nói `z.stringbool()` sẽ **từ chối** giá trị lạ (vd `'abc'`), khiến `loadEnv` ném lỗi khi khởi động. Đây là thay đổi hành vi, dù là thay đổi tốt (fail-fast) | T215 thêm test `loadEnv({ENABLE_SWAGGER:'abc'})` ném lỗi, và ghi giá trị hợp lệ vào `.env.example` |
| 3 | MINOR | `QD_ZOD.md` §2, dòng locale `vi` | `z.config(z.locales.vi())` là cấu hình toàn cục, có tác dụng phụ ngay khi import. QĐ chưa nói đặt ở file nào. Nếu đặt trong `schemas.js` thì web và api đều nhận cấu hình, nhưng `env.js` (import `zod` trực tiếp) chỉ nhận khi `shared` được import trước | Đặt lời gọi ở đầu `packages/shared/src/schemas.js` (hoặc ở entry của shared), và chấp nhận `env.js` có thể ra thông điệp tiếng Anh vì đó là log khởi động, không phải giao diện người dùng. T215 ghi lại lựa chọn này trong báo cáo |
| 4 | MINOR | `QD_ZOD.md` §6 (danh sách test T215) | Thiếu một test hồi quy cho đúng lớp lỗi của advisory: mảng vượt `.max()` rất nhiều phần tử (nhưng body vẫn dưới 100kb) phải bị từ chối 400 mà không cần kiểm từng phần tử | Thêm test: `keywords` có khoảng 5 000 phần tử `"a"` (≈ 20 KB) → 400 `VALIDATION_ERROR`. Tùy chọn: test đơn vị đếm số lần refine của phần tử = 0 |
| 5 | MINOR | `QD_ZOD.md` §1, đoạn "Không chọn phương án…" | Lập luận "ở lại zod 3 thì audit đỏ mãi, bẻ CI T202" là đúng với riêng zod. Nhưng `npm audit` hiện còn `vitest` critical (direct), `tinypool` critical, `vite` high (đều là devDependency), nên sau T215 audit **vẫn đỏ**. T215 chỉ cần chứng minh hết GHSA-mrhx-c7xc-m3w5, không phải audit sạch, và QĐ đã viết đúng như vậy | Không bắt sửa QĐ. Điều phối viên nên mở task riêng (DO) cho chuỗi vitest/vite trước khi T202 bật cổng audit |

Không có BLOCKER/MAJOR. Các khẳng định chính đều đúng khi tôi kiểm lại bằng lệnh: một chỗ phá vỡ duy nhất, lỗi `ENABLE_SWAGGER`, body quá cỡ rơi vào 500 thay vì 413, danh sách vi phạm `.max()` đầy đủ, có bản vá 4.6.6/4.6.7, có locale `vi`. Đề xuất T215 hợp lý: phạm vi nhỏ, có test và bằng chứng cụ thể, và xếp trước T206–T211 là đúng vì tránh phải viết lại các schema GĐ2. Các MINOR #1–#4 nên được T215 áp dụng luôn khi thực hiện.

**Kết luận: APPROVED**
