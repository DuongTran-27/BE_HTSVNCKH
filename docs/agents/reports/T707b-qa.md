# T707b-qa – bước B lượt kiểm thử (B3, B4, B7, B9, B10, B12, B15, B16 + MINOR 3 FR24)
- Agent: kiem-thu · Trạng thái: REVIEW · Ngày: 2026-11-08
- FR/NFR: FR06, FR14, FR16, FR24, NFR08 · Phụ thuộc đã đọc: T707a, reviews/T707a-reviewer-v1, T707b-be, T707b-fe

## Đã làm
| Mục | Kết quả | Test |
|---|---|---|
| B3 job recheck E2E | Làm (không hoãn): FR06 làm hỏng thật bằng `ALTER FUNCTION immutable_unaccent RENAME` qua `db()` (hạ tầng giả lập, được phép theo `helpers.js`), trả lại trong `finally`; "hết lỗi" = trả tên hàm rồi gọi `POST /api/cron/similarity-rechecks` với `CRON_SECRET`. Kiểm `updated >= 1`, lần hai `updated = 0`, cờ "Gửi khi chưa kiểm tra" mất, cán bộ nhận "Đã kiểm tra lại trùng lặp cho lần gửi 1…" | `e/gd6.spec.js` TC-FR06-E10 |
| B4 SV gửi hồ sơ cờ G5 | SV mở `/de-tai/:id/gui`, thấy "Lý do: …" (G46), bấm Gửi xét duyệt khi FR06 lỗi → toast "chưa kiểm tra được"; hàng chờ cán bộ hiện "Gửi khi chưa kiểm tra" | TC-FR06-E10 |
| B7 stuck=true | STUDENT/LECTURER: 200, chỉ đề tài kẹt trong phạm vi mình (svA, svB, lect, lect2 [] ), đề tài UNDER_REVIEW của cùng người không lọt; fixture tạo rồi xóa trong `finally` (không đổi total các ca khác) | `T213-topic-list.test.js` TC-FR16-B7 |
| B9 synonyms | Đọc văn bản `prisma/seed.js` (không import), so `synonyms.json` | `fr06-dataset.test.js` TC-FR06-94 |
| B10 recall | TC-FR06-93 thêm assert `level ∈ {NONE,REVIEW,HIGH}` và recall ≥ 0,8 ở REVIEW+ (thực tế 92,9%) | TC-FR06-93 |
| B12 BUG-013 | 10 lần liên tiếp `BUG-013-temp-hash.test.js` khi 6 tiến trình đốt CPU chạy song song: 10/10 đạt (4/4 mỗi lần). Không chập chờn nên không sửa, không nới ngưỡng | – |
| B15 | E2E `TC-FR14-E01/E02` → `TC-FR14-E03/E04` (grep: chưa dùng). Chỉ đổi nhãn | `e/m5.spec.js` |
| B16 | Làm: E2E dùng kho giả trong bộ nhớ của API (không có `CLOUDINARY_URL`). SV trong nhóm bấm "Tải về": chặn điều hướng tới URL ký giả, kiểm `attachment=true`, `expires_at` còn 280–300 s, AuditLog `DOCUMENT_DOWNLOAD` +1; SV đề tài khác gọi API → 403 và không thêm lịch sử | `e/m4.spec.js` TC-FR24-E01 |
| MINOR 3 FR24 | Xác minh đọc `T403-documents.test.js` 221–248: TTL 290–300 s, attachment, `expires_at` khớp, `no-store`, AuditLog đúng actor (lecA, staff1, leader); 403 người ngoài/ADMIN không ghi lịch sử; link → 400; kho lỗi → STORAGE_UNAVAILABLE. Đã cập nhật ô FR24 trong `TRUY_VET.md` | – |

`TRUY_VET.md` đã cập nhật: M3, M4, M5, FR06, FR14, FR16, FR24, mục 4.

## File thay đổi
`apps/api/tests/T213-topic-list.test.js`, `apps/api/tests/fr06-dataset.test.js`, `apps/web/e2e/gd6.spec.js`, `apps/web/e2e/m4.spec.js`, `apps/web/e2e/m5.spec.js`, `docs/agents/TRUY_VET.md`, báo cáo này. Không sửa code sản phẩm.

## Bằng chứng chạy lệnh
- `npm run db:test:up`, `npm run db:test:reset`: OK.
- `npm run lint`: 0 lỗi, 0 cảnh báo.
- `npm test` (hai lần): shared 7 file/73 test; API 64 file/946 test; web 28 file/230 test; đều đạt cả hai lần.
- `npx vitest run tests/fr06-dataset.test.js tests/T213-topic-list.test.js`: 30/30 đạt.
- B12: vòng lặp 10 lần, mỗi lần `Tests 4 passed (4)`.
- E2E: xem mục dưới.

### E2E (`npm run test:e2e -w @nckh/web`, 58 test = 29 x 2 project)
- Lần 1 (trước khi sửa thứ tự E10): 56 đạt, 2 đỏ (chỉ TC-FR06-E10, lỗi của test, đã sửa).
- Sau sửa, hai lần liên tiếp đầy đủ: **lần A 57 đạt, 1 đỏ** (`[mobile] roles.spec.js TC-FR07-E05`); **lần B 58/58 đạt**. Thêm 3 lần `gd6 + roles` (prepare mới mỗi lần): 16/16 cả ba.
- **Chập chờn**: TC-FR07-E05 (mobile) đỏ 1/7 lần; không lưu được chi tiết lỗi. Nghi ngờ: `if (await just.count()) await just.fill(...)` (roles.spec.js dòng ~90) đọc ô giải trình trước khi kiểm tra tự động xong, nên khi kết quả ra REVIEW/HIGH thì bị chặn gửi; hồ sơ g5 mới (TC-FR06-E10) làm kho so thêm một đề tài giống nội dung nên có thể tăng xác suất. Chưa xác nhận. Đề xuất cho chủ trì FE/QA: chờ `settled` trước khi đếm ô giải trình. Không sửa trong lượt này (test của spec khác).
- Giữ nguyên quy tắc: không skip, không nới.

## Phát hiện / lỗi tìm thấy
| BUG | Mức | Trạng thái |
|---|---|---|
| (không có lỗi sản phẩm mới) | – | – |

Lỗi test của chính tôi đã sửa trong lượt: E10 lần đầu mở trang gửi trước khi làm hỏng FR06 nên trang tự chạy kiểm tra thật (OK/HIGH) và nút bị khóa; đã đổi thứ tự.

## Hạn chế
- TC-FR24-E01 không tải byte thật (kho giả, URL ký giả); chỉ kiểm URL, hạn và lịch sử. Cloudinary thật chỉ kiểm được sau deploy.
- TC-FR06-E10 làm hỏng hàm DB dùng chung của DB E2E trong vài giây; an toàn vì `workers: 1`, và có `finally` trả lại. Nếu tiến trình bị kill giữa chừng, `prepare.js` dựng lại DB ở lần chạy sau.
- TC-FR06-E10 phụ thuộc E09 (quyền đã cấp) theo thứ tự trong file; TC-FR24-E01 phụ thuộc FR11-E01 trong khối serial (theo quy ước sẵn có của spec).
- B12 chỉ chạy trên một máy, 6 tiến trình đốt CPU; không phải bằng chứng cho CI.
- `eval:fr06` không chạy (không đổi engine/dữ liệu).
- Chưa làm: B14 (CI E2E, việc DO), B13, B5 (hoãn theo T707a).

## Sửa ca chập chờn (TC-FR07-E05 [mobile])
- Nguyên nhân (suy từ luồng, không có trace của lần đỏ): `SubmitPage` tự chạy kiểm tra trùng lặp sau khi tải `similarity-latest`. `settled` đơn thuần không đủ vì trước khi lần chạy bắt đầu chưa có chỉ báo "Đang kiểm tra". Test đếm ô "Giải trình" ngay khi panel đã hiện (bản cũ/chưa có kết quả) nên bỏ qua giải trình, rồi nút Gửi bị khóa khi kết quả ra REVIEW/HIGH.
- Sửa `apps/web/e2e/roles.spec.js`: `await settled(sv)` rồi `expect.poll` đến khi nút "Gửi lại sau chỉnh sửa" mở HOẶC ô "Giải trình" xuất hiện, sau đó mới đếm/điền. Assert không đổi, không nới.
- Chạy: `npm run lint` sạch; `npm run test:e2e -w @nckh/web` 3 lần liên tiếp: 58 passed, 58 passed, 58 passed (mỗi lần 2,8 phút). Không dùng `--repeat-each` vì ca này đổi trạng thái đề tài (chạy lặp trên cùng DB sẽ đỏ theo thiết kế), nên bằng chứng là 3 lần chạy đủ, mỗi lần dựng lại DB bằng `prepare.js`.
- Giới hạn: 3 lần xanh không chứng minh tuyệt đối (tỉ lệ đỏ trước đó 1/7).
