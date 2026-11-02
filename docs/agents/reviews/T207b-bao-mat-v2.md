# Review T207b – bao-mat – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
- Đã đọc: `csvExt` trong `apps/api/src/modules/accounts/routes.js:39-46` và test đuôi file trong `tests/T207b-import.test.js:189`.
- `npx vitest run tests/T207b-import.test.js tests/security/T207b-multipart.test.js` (trong `apps/api`) → `Test Files 2 passed (2)`, `Tests 46 passed (46)`. Theo yêu cầu, tôi không chạy full suite và không reset DB.
- `node -e` kiểm regex: `/.csv$/i` trả `true` cho `u.exe_csv`, `evilcsv`, `u.CSV`, `u.csv`.

## Đối chiếu
| Điểm | Đạt? | Ghi chú |
|---|---|---|
| MAJOR 1 vòng 1: whitelist đuôi `.csv` (QD_ZOD §4.3.5–6) | Đạt | Middleware chạy sau upload và trước service, áp cho cả preview và confirm. Bị từ chối thì trả 400 `VALIDATION_ERROR` `details.file`. Có test cho `.exe`, `.txt`, `.csv.exe` và tên `csv`. Sau đó service vẫn kiểm nội dung (UTF-8, NUL, tiêu đề). |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | `apps/api/src/modules/accounts/routes.js:41` | Dấu `.` trong regex chưa được escape, nên `/.csv$/i` khớp mọi tên kết thúc bằng "csv", ví dụ `u.exe_csv`, `evilcsv`. Không khai thác được, vì nội dung vẫn phải là CSV UTF-8 đúng tiêu đề. | Đổi thành `/\.csv$/i` và thêm ca `evilcsv` vào `it.each` ở dòng 189. |

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 1
