# Review T403 – bao-mat – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
File đã đọc: `CLAUDE.md`, `docs/agents/reports/T403.md`, `docs/agents/design/API_GD45.md` §1.1–1.4, §5.1–5.8, `docs/agents/design/QD_ZOD.md` §4.2–4.3, `apps/api/src/lib/{upload,storage}.js`, `apps/api/src/modules/execution/{documentService,routes,lock,prismaRepo}.js`, diff `topics/{reviewRepo,reviewService,snapshotService,routes}.js`, `app.js`, `server.js`, `config/env.js`, `packages/shared/src/schemas.js`, `scripts/cleanup-orphans.js`, `.github/workflows/cleanup-orphans.yml`, `docs/VAN_HANH.md` 3.4, `tests/T403-documents.test.js`, diff `tests/T212b-snapshots.test.js`. Không đọc `.env`.

```
$ npm run db:test:up        -> Kiểm tra DB test: tất cả OK. DB test đã chạy.
$ npm run lint              -> eslint . (không lỗi)
$ npm test                  -> shared 68/68 · api 43 files 546/546 · web 144/144 (xanh, trước khi thêm test bảo mật)
```

Thăm dò `sanitizeFileName` và `documentLinkSchema` (script tạm ngoài repo):
```
'../../etc/passwd.pdf' -> "passwd.pdf"   '..\..\x.pdf' -> "x.pdf"   '\0.pdf' -> "tai-lieu.pdf"   500 ký tự -> 200
'a‮xcod.pdf' -> "a‮xcod.pdf"   (ký tự đảo chiều RLO giữ nguyên)
javascript:… / http:// / data: / https:javascript:… -> từ chối;  https://u:p@evil.vn -> nhận
```

Test tấn công tự viết (giữ lại vì phát hiện lỗi): `apps/api/tests/security/T403-cleanup-guard.test.js`
```
$ npx vitest run tests/security/T403-cleanup-guard.test.js   (apps/api)
 × toàn bộ file của thư mục đều không có Document (DB sai): không xóa gì nếu không có xác nhận rõ ràng
AssertionError: expected +0 to be 30
 Test Files  1 failed (1)   Tests  1 failed (1)
```

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Quyền backend: upload/link chỉ STUDENT `isMember`; ADMIN 403 (FR25) | Đạt | `requireRole('STUDENT')` + `precheck` theo `:id`; test 403 GVHD/cán bộ/SV ngoài/ADMIN. |
| 401/403 trước khi file vào RAM (QD §4.3.3) | Đạt | guard → role → limiter → precheck (`drainThen`) → multer; test xác nhận kho không bị gọi. |
| Mốc thuộc đề tài khác (IDOR) | Đạt | `assertMilestone` so `topicId`, cả trước upload và dưới khóa; test 404. |
| Đọc/tải: `canReadExecution` + GV được đề nghị chỉ PROPOSAL, kiểm mỗi lần | Đạt | `canRead` dùng ở list và download-url; cán bộ khoa khác, DRAFT ngoài phạm vi, ADMIN 403; 403 không ghi lịch sử. |
| Kiểm loại trên nội dung buffer + đuôi, không tin mimetype | Đạt | `fileFilter` đồng bộ theo đuôi; `contentMatches` `%PDF-` / ZIP + `[Content_Types].xml` + `word/|ppt/|xl/`, không giải nén; `mimeType` do server gán. |
| Giới hạn dung lượng ở backend | Đạt | multer `fileSize` 10 MB + `files/fields/parts/fieldSize`; thêm trần theo cấu hình đợt; `toUploadError` 413/400. multer 2.5.0. |
| Tên file / path traversal | Đạt | Tên hiển thị đã làm sạch; `publicId` do server sinh `<folder>/topics/<topicId>/<uuid>.<ext>`, tên client không vào đường dẫn kho. Còn ký tự bidi – #2. |
| Cloudinary `raw` + `authenticated`, `overwrite:false`, xác minh response | Đạt | Kiểm `public_id/type/resource_type/bytes`; lỗi → 503 + destroy; không gọi kho trong transaction. |
| URL ký 5 phút, `attachment`, không URL cố định (FR24, M2 T199) | Đạt | `private_download_url` (api.cloudinary.com, `expires_at`), test SDK thật không gọi mạng; `Cache-Control: no-store`; `publicId` không bao giờ trả ra. |
| Lịch sử lượt tải | Đạt | AuditLog `DOCUMENT_DOWNLOAD` sau khi kiểm quyền + ký; ghi lỗi → không trả URL (đóng an toàn). |
| Link ngoài scheme an toàn | Đạt | Chỉ `https` (zod `z.url({ protocol: /^https$/ })`); `javascript:`, `data:`, `http:` bị từ chối. |
| Transaction + khóa khi tạo phiên bản | Đạt | `withLockTx` + `lockTopicRow` `FOR NO KEY UPDATE`, kiểm lại trạng thái/mốc dưới khóa, `version = max+1`, giới hạn 50; test hai upload đồng thời. |
| Production bắt buộc Cloudinary thật | Đạt | `env.js` refine; kho giả chỉ khi thiếu `CLOUDINARY_URL` ngoài production. |
| Dọn mồ côi `--apply` an toàn (FR26, §5.7) | **Không đạt** | Không xóa file có Document, kiểm lại trước khi xóa, AuditLog từng file – đúng. Nhưng không có chốt chặn khi DB/thư mục không khớp – #1. |
| T212b `changes.documents: false` | Hợp lệ | API_GD45 §5.6 thêm `changes.documents: boolean`; sửa kỳ vọng thêm đúng khóa mới, giữ `toEqual` chặt – không làm yếu test. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | `apps/api/scripts/cleanup-orphans.js` `runCleanup` (nhánh `if (apply)`) + `docs/VAN_HANH.md` 3.4 | **`--apply` xóa sạch kho khi DB không khớp thư mục.** Mồ côi = "không Document nào trong DB đang kết nối tham chiếu". Nếu chạy với DB sai (VAN_HANH hướng dẫn đúng lệnh `--env-file-if-exists=apps/api/.env`, tức `.env` dev) nhưng `CLOUDINARY_URL` + `CLOUDINARY_FOLDER` của production, mọi file > 24 giờ trong `nckh/production/` đều là "mồ côi" và bị `destroy(invalidate)` – mất toàn bộ tài liệu SV đã nộp, không khôi phục được (pg_dump không chứa file). Kiểm lại trước khi xóa cũng hỏi cùng DB sai nên không cứu. Chứng minh: `tests/security/T403-cleanup-guard.test.js` (30/30 file bị xóa). | Thêm chốt chặn trước khi xóa, ví dụ: (a) `--apply` bắt buộc `CLOUDINARY_FOLDER` đặt tường minh (không dùng mặc định `nckh/<NODE_ENV>`); (b) từ chối (exit ≠ 0, không xóa gì) khi số mồ côi vượt ngưỡng an toàn (vd. > 10 file **hoặc** > 10 % số file liệt kê) trừ khi có `--max-delete=N` tường minh; (c) VAN_HANH 3.4: dặn chạy dry-run trước với cùng biến, ghi rõ URL DB production có quyền ghi. Test bảo mật trên phải xanh, không sửa test (nếu chọn cơ chế xác nhận khác, giữ nguyên ý: lượt chạy mặc định với tỉ lệ mồ côi 100 % không xóa gì). |
| 2 | MINOR | `apps/api/src/lib/upload.js` `sanitizeFileName` | Không bỏ ký tự định dạng Unicode (`\p{Cf}`: U+202E RLO, U+200E…). Tên hiển thị có thể giả đuôi (vd. `hoso‮xcod.pdf` hiển thị như `hosofdp.docx`). Đuôi/mime thật do server gán nên chỉ là giả mạo hiển thị. | Thêm `\p{Cf}` vào regex loại bỏ. |
| 3 | MINOR | `scripts/cleanup-orphans.js` `runCleanup` | `destroy` trước, `recordAudit` sau: ghi AuditLog lỗi thì file đã mất mà không có dòng lịch sử (chỉ log + `failed`). | In rõ "ĐÃ XÓA nhưng chưa ghi AuditLog" hoặc thử ghi lại; chấp nhận được vì FR26 chạy tay. |
| 4 | MINOR | `execution/routes.js` route `/documents/links` | `validate(documentLinkSchema)` chạy trước `precheck` → người ngoài gửi body sai nhận 400 thay vì 403 (API_GD45 §1.1 "người ngoài luôn nhận 403"). Không lộ trạng thái. | Đặt kiểm quyền theo `:id` trước `validate` như route upload. |
| 5 | MINOR | `documentService.js` `commit` | Dưới khóa chỉ kiểm lại trạng thái, không kiểm lại `isMember`: SV vừa bị loại khỏi nhóm giữa lúc upload vẫn ghi được một bản. Cửa sổ rất hẹp. | Đọc lại thành viên trong transaction (tùy chọn). |
| 6 | MINOR | `packages/shared/src/schemas.js` `documentLinkSchema` | Nhận `https://user:pass@host` (dễ dùng để lừa đảo hiển thị). | Tùy chọn: từ chối URL có userinfo. |
| 7 | MINOR (chức năng) | `documentService.js` `list` | Lọc `?stage=MIDTERM` trên chuỗi mốc tính `isLatest` chỉ trên các dòng đã lọc → bản cũ có thể được đánh `isLatest` khi bản mới hơn mang nhãn khác. Không phải lỗ hổng. | Tính `isLatest` từ `chainStats`/toàn chuỗi trước khi lọc. |

Ngoài phạm vi: diff Prettier ở `scripts/{create-admin,db-dev,db-test,reset-test-db,test-db-guard}.js` – không xem xét. Chưa thử với Cloudinary thật (việc của con người, như báo cáo ghi).
