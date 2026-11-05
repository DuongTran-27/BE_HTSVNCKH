# Review T403 – bao-mat – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
File đã đọc: `docs/agents/reviews/T403-bao-mat-v1.md`, `docs/agents/reports/T403.md` mục "Vòng 2", `apps/api/scripts/cleanup-orphans.js`, `.github/workflows/cleanup-orphans.yml`, `docs/VAN_HANH.md` §3.4, `apps/api/src/lib/upload.js` (`sanitizeFileName`), `apps/api/src/lib/storage.js` (`defaultStorageFolder`), `apps/api/src/modules/execution/routes.js` (`precheckLink`), `packages/shared/src/schemas.js` (`documentLinkSchema`), `apps/api/src/modules/execution/{documentService,prismaRepo}.js` (`list`, `listDocuments`), `apps/api/tests/T403-documents.test.js` (dòng 170–381), `apps/api/tests/security/T403-cleanup-guard.test.js`. Không đọc `.env`.

```
$ npm run db:test:up   -> Kiểm tra DB test: tất cả OK. DB test đã chạy.
$ npm run lint         -> eslint . (không lỗi)
$ npm test             -> shared 6 files 68/68 · api 44 files 549/549 · web 20 files 144/144
```

Thử chốt chặn CLI (dừng trước khi kết nối DB/kho):
```
$ env -u CLOUDINARY_FOLDER -u CLOUDINARY_URL node apps/api/scripts/cleanup-orphans.js --apply
--apply cần đặt tường minh CLOUDINARY_FOLDER (không dùng mặc định). Không xóa gì.   exit=2
$ ... --apply --max-delete=abc      -> --max-delete phải là số nguyên >= 0. Không xóa gì.   exit=2
$ CLOUDINARY_FOLDER=x ... --apply --max-delete=-1  -> như trên, exit=2
```

## Đối chiếu vấn đề vòng 1
| # | Mức v1 | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | MAJOR | **Đã sửa** | `--apply` bắt buộc `CLOUDINARY_FOLDER` tường minh (exit 2); `runCleanup` ném lỗi trước vòng xóa khi mồ côi > 10 file hoặc > 10 % số file liệt kê, trừ khi `maxDelete` >= số mồ côi; `main` bắt lỗi -> exit 3. Kiểm tra ngưỡng nằm trước mọi `recordAudit`/`destroy` nên từ chối = không xóa gì. Test bảo mật `tests/security/T403-cleanup-guard.test.js` không bị sửa, nay xanh (30/30 file còn nguyên). Job theo lịch vẫn chỉ dry-run (không `--apply`). VAN_HANH §3.4 dặn dry-run trước với cùng biến, kiểm `DATABASE_URL` production có quyền ghi. Không thấy lỗi mới. |
| 2 | MINOR | Đã sửa | Regex thêm `\p{Cf}`; test RLO + ZWSP (đầu vào latin1 như busboy) -> `axcod.pdf`. |
| 3 | MINOR | Đã sửa | AuditLog ghi trước `destroy`; ghi lỗi -> không xóa (test 0 xóa / 3 failed / 4 file còn). Xóa lỗi sau khi đã ghi AuditLog thì có dòng lịch sử thừa – an toàn hơn chiều ngược lại, chấp nhận được. |
| 4 | MINOR | Đã sửa | `precheckLink` (kiểm quyền theo `:id`) đứng trước `validate`; test lecA gửi body sai -> 403. Không drain là đúng vì `express.json` đã đọc xong thân. |
| 5 | MINOR | Không làm | Tùy chọn, cửa sổ hẹp – đồng ý. |
| 6 | MINOR | Đã sửa | Từ chối URL có username/password; test `https://u:p@evil.vn/x` -> 400. |
| 7 | MINOR | Đã sửa | Repo bỏ lọc stage; `isLatest` tính trên toàn chuỗi rồi mới lọc `stage`/`latestOnly`. Kiểm lại quyền: GV được đề nghị (G23) vẫn bị `canRead(t, user, q.stage)` chặn khi không có `?stage=PROPOSAL`, và bộ lọc sau đó loại mọi dòng khác PROPOSAL -> không lộ tài liệu giai đoạn khác (test G23 xanh). |

## Trả lời câu hỏi của agent: `maxDelete: 10` trong hai test `--apply` cũ có làm yếu test không?
**Không.** Bộ dữ liệu `mkStore` có 3 file trong `f/`, 2–3 mồ côi = 67–100 % > ngưỡng 10 %, nên theo hợp đồng mới mọi lượt `--apply` trên bộ này buộc phải có xác nhận tường minh. Hai test đó kiểm hành vi xóa (đúng file, AuditLog từng file, không đụng file có Document, lỗi một file vẫn chạy tiếp, kiểm lại trước khi xóa) – các kỳ vọng giữ nguyên, chặt như cũ. Chốt chặn được kiểm riêng: test mới (mặc định -> TỪ CHỐI, `maxDelete: 2` < 3 -> TỪ CHỐI, file còn 4, `maxDelete: 3` -> xóa 3) và test bảo mật (30 file, không truyền `maxDelete`).

## Vấn đề mới
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR (test) | `tests/T403-documents.test.js` ~358 | Chưa có test nhánh "dưới ngưỡng, không cần `--max-delete` vẫn xóa" (vd. 1 mồ côi / 20 file) và nhánh tuyệt đối > 10 file khi tỉ lệ < 10 % (vd. 11 / 200). Logic đọc thấy đúng. | Thêm hai ca khi tiện. |
| 2 | MINOR (vận hành) | `cleanup-orphans.js:52` | Kho nhỏ (< 100 file) hầu như mọi lượt có mồ côi đều vượt 10 % -> thường phải dùng `--max-delete`. Thông báo lỗi gợi ý sẵn `--max-delete=${n}`, người vận hành có thể chép theo mà không đọc danh sách. | Chấp nhận (thiên về an toàn); VAN_HANH đã yêu cầu dry-run trước. Có thể in kèm danh sách mồ côi khi từ chối. |
| 3 | MINOR | `prismaRepo.js:73` | `take: 1000` nay áp cho mọi stage (trước lọc stage ở DB). Giới hạn 50 bản/chuỗi nên thực tế không chạm. | Không cần sửa. |

Ngoài phạm vi: diff Prettier ở `scripts/{create-admin,db-dev,db-test,reset-test-db,test-db-guard}.js` – không xem xét. Chưa thử với Cloudinary thật (việc của con người).
