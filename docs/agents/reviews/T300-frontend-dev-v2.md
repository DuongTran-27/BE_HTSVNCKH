# Review T300 – frontend-dev – vòng 2
Kết luận: APPROVED

## Tôi đã tự kiểm tra
Đã đọc: `CLAUDE.md`, `QUY_TRINH.md`, `reports/T300.md` (mục "Vòng sửa 1"), `design/UI.md` (toàn bộ 541 dòng), review vòng 1 của tôi, `design/API_GD2.md` (§1.2, §2, §5.1, §6, §7.1, §8.1–§8.4, §9.1), `BANG_CONG_VIEC.md` dòng T300–T309.

```
$ npm test
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/packages/shared
 Test Files  2 passed (2)
      Tests  21 passed (21)
 RUN  v4.1.12 D:/Website_HTWLHD_SV_NCKH_demo3/apps/api
 Test Files  9 passed (9)
      Tests  87 passed (87)

$ ls -A apps/web
(thư mục rỗng – chưa có lint/build web để chạy)
```

Đối chiếu thêm với hợp đồng:
- API §7.1 dòng 459: response `latest` là `{ similarityCheck }` "có thêm trường `isStale`" nhưng không nói đặt ở đâu. Vì vậy quyết định không `setQueryData` vào `['similarity-latest', id]` mà chỉ invalidate (§9.2) là đúng.
- API §8.1 dòng 527: SUBMIT/RESUBMIT trả `topic`, `submission`, `similarityCheck` cùng cấp. Vì vậy `setQueryData(['topic', id], r.topic)` + invalidate `['similarity-latest', id]` là đúng.
- API §8.2 dòng 536–537: cả hai mã lỗi FR06 đều có `details.similarityCheck`. Nhóm "sau lỗi có ghi dữ liệu" ở §9.2 khớp.
- API §2 dòng 159: ID là cuid (chuỗi). `useParams` trả về chuỗi, nên `['topic', id]` lấy từ URL và từ `r.topic.id` là cùng một khóa, không lệch kiểu.

## Vòng 1 → vòng 2
| # vòng 1 | Mức | Đã xử lý? | Vị trí |
|---|---|---|---|
| 1 Route giao task không phụ thuộc endpoint | MAJOR | Đạt. R4 giao hẳn T308. Bảng việc: T307 có T213 và T305, T309 phụ thuộc T305–T308, T305 phụ thuộc T306 và không còn T213 | §3, §9.1 "Phụ thuộc giữa task FE" |
| 2 Chủ thành phần theo kiểu "task nào trước" | MAJOR | Đạt. Bảng chủ cố định, không còn điều kiện. Đủ các thành phần tôi đã liệt kê (Toast, Dialog, Skeleton, EmptyState, ErrorState, FormField, `applyServerErrors`, `useUrlState`, `useCooldown`) | §9.1, U7 |
| 3 Khóa cache sai với response | MAJOR | Đạt, gồm cả (a)–(d). Thêm `['invitations']` sau REQUEST_ADVISOR và nhóm "sau lỗi" | §9.2 |
| 4 R15 sắp phía client | MAJOR | Đạt. Bỏ việc sắp phía client, dùng `pendingDays` tô cam, đề xuất T210 chốt thứ tự | §4.14 |
| 5–14 | MINOR | Đạt cả 10 | Như bảng trong báo cáo |

## Kiểm từ góc người hiện thực
- **Mỗi thành phần có đúng một chủ**: Đạt. Mỗi task chỉ dùng thành phần của task mà nó phụ thuộc, trực tiếp hoặc gián tiếp:
  - T302 dùng `Toast`, `FormField`, màn tải toàn trang (T301).
  - T305 gắn action SV vào `TopicActionBar` (T306). T305 phụ thuộc T306.
  - T307 dùng `SimilarityPanel` (T305) và gắn nút "Xét duyệt" vào R6 (T306). T307 phụ thuộc T305, T305 phụ thuộc T306.
  - T304, T308 chỉ dùng thành phần của T301 và T303.

  Không có vòng phụ thuộc. Chuỗi T301 → T302 → T303 → T306 → T305 → T307 làm được tuần tự. T304 và T308 chạy song song sau T303.
- **Đường găng**: T305 phải chờ T306. Nhưng T306 chỉ cần T210, còn T305 vốn đã cần T212a (sau T210), nên gần như không bị chậm thêm. Đồng ý với lập luận ở U7.
- **Cache §9.2 cài bằng TanStack Query**: làm được bằng API có sẵn, không cần thêm gì:
  - `retry: (n, e) => n < 2 && (e là lỗi mạng hoặc e.status === 503)` cho query, mutation để mặc định `retry: 0`.
  - Giữ dữ liệu cũ khi đổi trang bằng `placeholderData: keepPreviousData`.
  - `invalidateQueries({ queryKey: ['submission', id] })` khớp theo tiền tố.
  - Đăng xuất dùng `queryClient.clear()`.
  - `user` không nằm trong cache, mà ở module auth, đọc qua `useSyncExternalStore` (có sẵn trong React).
- **Không cần thêm thư viện**: Đúng. Data router và `useBlocker` có trong React Router. `<dialog>` là phần tử gốc. Phép diff theo từ tự viết. `zodResolver` thuộc `@hookform/resolvers`, gói đi kèm chuẩn của React Hook Form + Zod theo công nghệ đã chốt. T301 cần cài gói này, nhưng không phải thư viện mới.

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| 1 | MINOR | UI.md:224, 230, 515 | Sau "Kiểm tra trước" và sau 409 "Giữ nội dung của tôi" đều refetch `['topic', id]` khi R7 đang mở. Nếu T305 nạp form theo kiểu "dữ liệu query đổi thì `reset`" (ví dụ dùng prop `values` của RHF) thì refetch sẽ ghi đè các ô người dùng đang nhập. Như vậy "Giữ nội dung của tôi" không làm được và vi phạm "Không xóa dữ liệu người dùng đã nhập" (§6). | Ghi một câu ở §4.7: form nạp `defaultValues` một lần. Chỉ `reset` khi người dùng chọn "Tải bản mới" hoặc sau khi lưu thành công. Refetch chỉ cập nhật ô ẩn `version` (`setValue('version', …)`). T305 xử lý được mà không cần sửa UI.md, nhưng ghi ra thì tránh làm sai. |
| 2 | MINOR | UI.md:29 (§1.2, tiêu đề T303); BANG_CONG_VIEC T302 "bắt đổi mật khẩu lần đầu" | Chưa rõ task nào làm việc chuyển về `/doi-mat-khau` khi `mustChangePassword` hoặc khi nhận 403 `PASSWORD_CHANGE_REQUIRED`. §1.2 đặt dưới T303, `RequireAuth` cũng thuộc T303, nhưng bảng việc giao "bắt đổi mật khẩu lần đầu" cho T302, mà T302 chạy trước T303. Việc chuyển hướng khi nhận 403 lại cần bộ chuẩn hóa lỗi (T301) và router. | Ghi vào §9.1: T302 làm trang R2 và chuyển hướng ngay sau đăng nhập. `RequireAuth` (T303) chặn mọi route khác khi `mustChangePassword`. API client (T301) khi nhận 403 `PASSWORD_CHANGE_REQUIRED` thì cập nhật `user.mustChangePassword = true` trong module auth, để guard tự chuyển hướng. Không chặn duyệt. |

Hai điểm trên là hướng dẫn cài đặt, không phải lỗi thiết kế. Không chặn APPROVED, có thể ghi bổ sung khi T301/T305 nhận việc.

Kết luận: APPROVED – BLOCKER 0, MAJOR 0, MINOR 2.
