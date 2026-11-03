# T213b – Review reviewer v1
Kết luận: **APPROVED** (0 BLOCKER, 0 MAJOR, 2 MINOR không chặn).

## Tự chạy (DB `nckh_t213brv2_test`, localhost:54329, `db:test:reset` OK)
- `npm run lint` xanh. `npm test -w @nckh/shared`: 68/68.
- `npm test -w @nckh/api`: lần 1 có 1 file/6 test đỏ (khả năng cao là file T214-* của QA đang sửa dở, ngoài phạm vi); chạy lại: 40 file pass, 492 pass + 3 expected fail. T213b + T213 = 25/25.
- Khớp báo cáo (web đỏ không thuộc task).

## Đối chiếu đặc tả
- FR08 / §9.2: chỉ `CLOSED` + kết quả hiện hành ∈ {EXCELLENT, GOOD, PASS} (`repositoryService.js:5`, `REPOSITORY_RESULTS` ở schemas.js). FAIL, chưa đóng, đóng chưa có kết quả đều ngoài kho; có test.
- CAU_HOI #5 (G14): FAIL vẫn nằm trong kho so trùng FR06, không bị ảnh hưởng vì đây là đường đọc riêng (`REPO_SELECT`), không đổi kho so trùng. Phân biệt đúng.
- G3: cần đăng nhập (401 có test); ADMIN được xem đúng §9.2 (test admin 200 cả list và chi tiết).
- Không lộ dữ liệu riêng: `select` chặt (`listRepo.js` REPO_SELECT) không `id`, thành viên, GVHD, file, nhận xét; test kiểm đúng tập key của list và chi tiết. Trường `result.summary` ("NX riêng") không bị chọn.
- `:code` được kiểm regex trước khi truy vấn; mã lạ 404.
- MINOR T213 `round: true` đã chuyển sang `select` (listRepo.js:6), T213 vẫn xanh.
- Không logic trạng thái ngoài TRANSITIONS (chỉ đọc); không test bị skip/làm yếu.

## MINOR
1. `repositoryService.js:16` và `:19`: `[...t.summary].slice(0,300)` cấp phát mảng toàn bộ summary mỗi dòng; chấp nhận được với độ dài summary bị schema giới hạn, có thể để DB `left()` nếu cần. Không chặn.
2. Test thiếu ca `q` khớp đề tài FAIL/ngoài kho không rò (đã đúng do `AND` với `inRepo`, nhưng chưa có assertion), và thiếu ca `result` hiện hành bị thay thế (`isCurrent=false` bản cũ GOOD, bản mới FAIL). Nên bổ sung khi tiện.
