# Review T300 – frontend-dev – vòng 1
Kết luận: CHANGES_REQUESTED

## Tôi đã tự kiểm tra
Đã đọc: `CLAUDE.md`, `docs/agents/QUY_TRINH.md`, `reports/T300.md`, `design/UI.md` (toàn bộ 500 dòng), `design/API_GD2.md` (§1–§11), `packages/shared/src/{transitions,enums,schemas,index}.js`, `apps/api/src/modules/auth/{service,routes}.js`, `BANG_CONG_VIEC.md` (T206–T213, T300–T309, T504).

```
$ npm test
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
 Test Files  2 passed (2)
      Tests  21 passed (21)
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
 Test Files  9 passed (9)
      Tests  87 passed (87)

$ grep -cE "^\| R[0-9]+ \|" docs/agents/design/UI.md
25
$ grep -oE "API §[0-9]+[a-z]?(\.[0-9]+)?" docs/agents/design/UI.md | sort -u
API §1.1 §1.2 §1.3 §1.4 §1.7 §1.8 §10 §11 §2 §3.1 §3.2 §4.1 §4.2 §4.3 §5.1 §5.3 §5.4 §5.5 §6 §7.1 §7.2 §8.1 §8.2 §8.3 §8.4 §9.1 §9.2
```
Khớp báo cáo: 25 route, 27 mục API, mục nào cũng có thật. `apps/web` chưa tồn tại nên không có lint/build web để chạy.

Đã đối chiếu thêm:
- `publicUser` có `id`, `code`, `fullName`. Vì vậy R15 dùng được `q={user.code}`, ngoại lệ 2 dùng được `user.id`, header hiện được họ tên.
- `changePassword` thu hồi mọi phiên trừ họ phiên hiện tại. Thông điệp "Các phiên đăng nhập khác đã bị đăng xuất" ở 4.2 là đúng.
- 9 action ở mục 5.1 khớp `TRANSITIONS` và API §8.1. UI không có đường đi nào ngoài bảng.

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |
|---|---|---|
| Sitemap theo 4 vai trò + khách; ADMIN không có menu nghiệp vụ (FR25) | Đạt | 2.1–2.6, 1.2 |
| Route ↔ vai trò ↔ endpoint | Đạt một phần | Route và endpoint đều đúng. Task được giao lệch phụ thuộc trên bảng việc (vấn đề 1) |
| Nút theo `availableActions` + `permissions`, không tự suy luồng | Đạt | Có 2 ngoại lệ, đều có lý do và backend vẫn kiểm |
| Tải / rỗng / lỗi từng màn | Đạt | Mục 6 + "Rỗng"/"Lỗi riêng" ở từng màn |
| Ánh xạ mã lỗi → tiếng Việt + lỗi theo trường | Đạt | Mục 7 đủ mọi mã ở API §2 và `SERVICE_BUSY`. Chưa giao task cho helper `details → setError` (vấn đề 2) |
| FR06: vàng/đỏ, top 5, hồ sơ ẩn, giải trình bắt buộc khi đỏ, không bao giờ hiện "Không trùng" khi lỗi | Đạt | 4.10, 4.13 |
| Responsive 360 px | Đạt | Mục 8 đủ cụ thể: điểm ngắt, bảng → thẻ, thanh hành động dính đáy, hộp thoại toàn màn, vùng chạm, ô nhập ≥ 16 px |
| Khóa cache / invalidate | Chưa đạt | Có chỗ sai với response thật (vấn đề 3) |
| Làm được với API hiện tại và công nghệ đã chốt | Đạt một phần | Vấn đề 4 và 5. Còn lại làm được bằng React Router + TanStack Query + RHF/Zod + Tailwind, không cần thêm thư viện |
| Phân chia thành phần giữa các task không chồng lấn | Chưa đạt | Vấn đề 1, 2 |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MAJOR | UI.md:138, 150, 495; BANG_CONG_VIEC T305, T307, T309 | Task được giao route nhưng không phụ thuộc endpoint mà route đó gọi. (a) R4 `/de-tai` là trang chủ của SV và do T308 làm, nhưng T309 (E2E: SV tạo đề tài…) chỉ phụ thuộc T305–T307. (b) T305 gắn nút "Tạo đề tài" và banner vào R4, nhưng T305 không phụ thuộc T213 (`GET /api/topics`). (c) R16 hàng chờ (T307) gọi `GET /api/topics?status=UNDER_REVIEW`, nhưng T307 chỉ phụ thuộc T212b, không phụ thuộc T213. | Ghi vào UI.md (mục 3 hoặc mục mới "Phụ thuộc") và đề nghị điều phối viên sửa bảng: thêm T213 vào phụ thuộc của T307; thêm T308 vào phụ thuộc của T309; giao rõ T308 làm khung R4, T305 chỉ thêm phần của SV, và T305 phụ thuộc T308 (hoặc T213). |
| 2 | MAJOR | UI.md:467, 469, 470–471, 495 (U7) | Cách giao "T304 hoặc T308 (task nào trước)", "T305 hoặc T306" và U7 "nếu T306 làm trước…" không xác định được chủ khi các task FE chạy song song. T304–T308 sau T303 chỉ còn chờ backend, nên rất dễ hai task cùng tạo một thành phần và xung đột khi gộp. Ngoài ra, nhiều thành phần mà mục 4.3, 6, 7, 1.3 bắt mọi màn dùng lại chưa có chủ: Toast, Dialog cơ sở, Skeleton, EmptyState, ErrorState (403/404 tại chỗ), FormField, helper `applyServerErrors(details → setError, focus ô đầu)`, hook đồng bộ query string (+ debounce `q`), xử lý `Retry-After` để tắt nút. | Chủ cố định, không dùng điều kiện "task nào trước". Thành phần giao diện không gắn nghiệp vụ (DataTable, Pagination, FilterBar, ConfirmDialog, ReasonDialog, Toast, Skeleton, EmptyState, ErrorState, FormField, `applyServerErrors`, `useUrlState`) giao T303. `applyServerErrors` có thể giao T301. Thành phần nghiệp vụ: khung R6 + `TopicActionBar` giao một task cố định, đề xuất T306 vì T210 xong trước T212a; T305 và T307 thêm action của mình. `SimilarityPanel` giao T305 và thêm T305 vào phụ thuộc của T307, hoặc giao T303 làm thành phần thuần hiển thị nhận `SimilarityCheckView`. |
| 3 | MAJOR | UI.md:477–478 | Khóa cache sai với response thật. (a) "Kiểm tra trước" trả `{ similarityCheck }` (API §7.1), không có `topic`, nên `setQueryData(['topic', id], response.topic)` sẽ ghi `undefined` vào cache. (b) Sau "Kiểm tra trước", `topic.latestSimilarity` (`level`, `isStale`) đã đổi nhưng không được làm mới. (c) SUBMIT/RESUBMIT tạo `SimilarityCheck` mới nhưng không làm mới `['similarity-latest', id]`. (d) APPROVE/REQUEST_REVISION/REJECT đổi `decision` của lần gửi nhưng không làm mới `['submission', id, seq]`, nên R12 hiển thị "Chưa xử lý" cũ. | Tách thành 3 quy tắc. PUT: `setQueryData(['topic', id], r.topic)` và invalidate `['similarity-latest', id]`, `['topics']`. Kiểm tra trước: `setQueryData(['similarity-latest', id], r)` và invalidate `['topic', id]`. `/actions`: như hiện tại, thêm invalidate `['similarity-latest', id]` và `['submission', id]` (theo tiền tố). |
| 4 | MAJOR | UI.md:284 | R15 phía cán bộ ghi "sắp đề nghị chờ lâu lên đầu", nhưng `GET /api/advisor-requests` không có `sort` và chưa định nghĩa thứ tự mặc định (API §6, `advisorRequestListQuerySchema`). Danh sách phân trang ở server nên sắp phía client chỉ đúng trong một trang. Với hợp đồng hiện tại không làm được như mô tả. | Có 3 cách: bỏ yêu cầu; ghi rõ "sắp trong trang hiện tại"; hoặc ghi câu hỏi cho kiến trúc sư chốt thứ tự mặc định `createdAt asc` cho endpoint này (chỉ là quy ước, T210 làm, không thêm tham số). |
| 5 | MINOR | UI.md:297 | "Lý do yêu cầu chỉnh sửa lần trước (từ R11)": item của `GET …/submissions` chỉ có `decision.{action, decidedAt}`, không có `reason`. | Ghi rõ: tải `GET …/submissions/{seq-1}` (khóa `['submission', id, seq-1]`) khi `seq > 1`. |
| 6 | MINOR | UI.md:213 | Lĩnh vực đã ngừng dùng mà hồ sơ đang giữ: PUT kiểm `fieldId` phải `isActive` (API §5.1). Hồ sơ giữ lĩnh vực này sẽ không lưu được thay đổi nào cho tới khi đổi lĩnh vực. Chỉ gắn nhãn "Ngừng dùng" thì người dùng sẽ gặp lỗi 400 mà không hiểu vì sao. SV không gọi được `includeInactive=true`, nên UI chỉ nhận ra lĩnh vực ngừng dùng khi `topic.field.id` không có trong danh sách đang dùng. | Thêm cảnh báo tại ô "Lĩnh vực đã ngừng dùng, hãy chọn lĩnh vực khác trước khi lưu" và ghi cách nhận biết. Có thể hỏi kiến trúc sư có nên cho giữ nguyên `fieldId` cũ khi PUT không. |
| 7 | MINOR | UI.md:217, 315 | Chặn rời trang bằng router blocker (`useBlocker`) chỉ hoạt động với data router (`createBrowserRouter` + `RouterProvider`). Nếu T301 dựng `<BrowserRouter>` thì T305 và T304 phải làm lại. | Ghi vào 1.1 hoặc 9.1 (phần T301): bắt buộc dùng data router. |
| 8 | MINOR | UI.md:18, 475 | Chưa rõ `user` được lưu ở đâu. Có khóa `['me']`, nhưng 1.1 lấy `user` từ login/refresh, còn `queryClient.clear()` sẽ xóa `['me']`. Khi đổi mật khẩu xong gọi `GET /me`, chưa rõ cập nhật vào đâu. | Chốt một nguồn: `user` + token để trong module auth ở bộ nhớ (có subscribe), bỏ khóa `['me']`; hoặc `setQueryData(['me'])` từ login/refresh. |
| 9 | MINOR | UI.md:15–16 | Ở dev, React StrictMode chạy effect 2 lần, tức gọi refresh 2 lần lúc khởi động. Lần thứ hai bị coi là dùng lại token và thu hồi cả họ phiên (API §1.1). Ngoài ra, `navigator.locks` không có trên trình duyệt cũ. | Ghi rõ: promise dùng chung đặt ở cấp module, không đặt trong state hay effect. Không có `navigator.locks` thì chỉ dùng promise trong tab. |
| 10 | MINOR | UI.md:215, 232, 241 | Gọi `topicSubmitSchema(cfg)` trên dữ liệu đã lưu cần đầu vào có `fieldId`, nhưng `TopicDetail` chỉ có `field: { id, name }`. Đưa thẳng `TopicDetail` vào thì ô lĩnh vực luôn bị báo thiếu. | Ghi rõ phép chuyển `{ title, summary, objectives, keywords, fieldId: topic.field?.id ?? '' }`. |
| 11 | MINOR | UI.md:303 | Toast "Đã {ACTION_LABEL} hồ sơ {code}" ghép nhãn hành động vào giữa câu, sai chữ hoa và ngữ pháp, ví dụ "Đã Yêu cầu chỉnh sửa hồ sơ…". | Viết sẵn 3 câu cố định: "Đã duyệt hồ sơ {code}", "Đã yêu cầu chỉnh sửa hồ sơ {code}", "Đã từ chối hồ sơ {code}". |
| 12 | MINOR | UI.md:453 | Hộp thoại toàn màn và ngăn kéo cần giữ focus bên trong, đóng được bằng Esc và chặn tương tác với nền. Không có thư viện thì mỗi task dễ tự viết theo một kiểu. | Ghi: dùng phần tử `<dialog>` gốc với `showModal()`, không thêm thư viện. |
| 13 | MINOR | UI.md:13, 313 | Nhập CSV gửi `FormData`. Nếu API client mặc định đặt `Content-Type: application/json` thì request multipart bị hỏng. | Ghi vào 1.1: khi body là `FormData`, client không tự đặt `Content-Type`. |
| 14 | MINOR | UI.md:185 | Bộ lọc GVHD của cán bộ chỉ bật khi đã chọn đợt. Không cần như vậy, vì `GET /api/users?role=LECTURER` (STAFF được gọi, server tự giới hạn theo phạm vi khoa, API §3.2) không bắt buộc `roundId`. | Đổi nguồn danh sách cho bộ lọc này sang `GET /api/users?role=LECTURER` (xem câu hỏi 5). |

## Trả lời câu hỏi mở (phần FE)
1. **Không phân biệt "kiểm lỗi" với "chưa kiểm" ở danh sách.** Phía FE ủng hộ thêm `latestSimilarityStatus`. Với hợp đồng hiện tại, hiện "—" là an toàn (đúng quy tắc 5), nên không chặn GĐ3.
2. **`permissions.viewHistory`.** Phía FE ủng hộ: thêm thì bỏ được ngoại lệ 2. Nếu chưa thêm, ngoại lệ 2 vẫn đúng ở GĐ2, vì chưa có GVHD cũ (`endAt` khác null) và FR21 thuộc GĐ6.
3. **`SERVICE_BUSY`.** Câu hỏi dành cho reviewer. Về phía FE, cách xử lý ở mục 7 và mục 6 (GET tự thử lại khi gặp 503, mutation không tự thử lại) làm được.
4. **Diff văn bản R13.** Đồng ý tự viết so sánh theo từ, không thêm thư viện. Quy mô: `summary` ≤ 5000 ký tự (khoảng 1000 từ), bảng LCS khoảng 10⁶ ô `Uint16Array`, khoảng 2 MB, chạy dưới 50 ms. Khi tách từ phải giữ khoảng trắng và xuống dòng làm token để hiển thị lại đúng. T307 viết unit test.
5. **Bộ lọc GVHD R4.** Không cần sửa API: dùng `GET /api/users?role=LECTURER` như vấn đề 14. Nếu giữ cách hiện tại thì cũng chấp nhận được.
6. **Phạm vi task.** (a) Đồng ý. (b) Không đồng ý dạng điều kiện "nếu… thì", cần chủ cố định (vấn đề 2). (c) Đồng ý. T308 đã phụ thuộc gián tiếp T210 qua chuỗi T213 → T212a → T210.

Kết luận: CHANGES_REQUESTED – BLOCKER 0, MAJOR 4, MINOR 10.
