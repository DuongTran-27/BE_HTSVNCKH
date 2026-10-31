---
description: Cổng kiểm tra cuối – chỉ tuyên bố hoàn thành dự án khi mọi mục đều đạt
---

Gọi subagent `reviewer` thực hiện kiểm tra sau, ghi kết quả vào `docs/agents/reviews/FINAL-reviewer.md`:

1. `BANG_CONG_VIEC.md`: mọi task và BUG ở DONE (BLOCKED chỉ được chấp nhận khi `CAU_HOI.md` có câu trả lời của con người đồng ý bỏ qua).
2. Chạy tuần tự, **hai lần liên tiếp**, ghi kết quả nguyên văn phần cuối:
   - `npm ci`
   - `npm run lint`
   - `npm test -- --coverage` (độ phủ ≥ 70% ở `apps/api/src/modules` và `packages/shared`)
   - `npm run build -w @nckh/web`
   - `npm run test:e2e -w @nckh/web`
3. `git grep -nE "\.only\(|\.skip\(|it\.todo|test\.fixme"` không có kết quả trong test.
4. `docs/agents/TRUY_VET.md`: mỗi FR mức P1, P2 có ít nhất một test tự động có mã `TC-FRxx` và test đó đạt ở bước 2.
5. Mỗi NFR có bằng chứng (test, báo cáo đo, hoặc cấu hình) được trích đường dẫn.
6. Không có bí mật trong repo (`git grep -nE "(postgres(ql)?://[^<\"]+:[^<\"]+@|CLOUDINARY_URL=cloudinary://[^<])"`).

Sau đó gọi `bao-mat` rà lại danh mục bảo mật toàn dự án, ghi `docs/agents/reviews/FINAL-bao-mat.md`.

Kết luận:
- Cả hai APPROVED → đánh dấu T708 DONE, viết `docs/BAO_CAO_HOAN_THANH.md` (tóm tắt tính năng, số test, độ phủ, kết quả hiệu năng, kết quả thực nghiệm FR06, việc con người cần làm để deploy) và báo người dùng **dự án hoàn thành**.
- Có mục không đạt → tạo BUG-xxx cho từng mục, chạy lại `/dieu-phoi`. Không tuyên bố hoàn thành.
