# Review T400 – reviewer v1
- Phạm vi: `design/API_GD45.md` (628 dòng), `reports/T400.md`. Task tài liệu, không chạy lệnh. Đối chiếu: DAC_TA (FR09–FR14, FR24, FR27, mục 5), `transitions.js`, `stateMachine.js:39-43`, `schema.prisma`, API_GD2.
- **Kết luận: CHANGES_REQUESTED** (1 MAJOR, cần sửa vài dòng hoặc người dùng trả lời; không có BLOCKER). Sau khi xử lý MAJOR, các MINOR không chặn.

## Điểm mạnh (đã kiểm, đạt)
- Mọi điều kiện đạt FR09–FR14, FR24, FR27 có mục tương ứng; bảng đối chiếu trong báo cáo khớp nội dung hợp đồng.
- Chuyển trạng thái chỉ dùng 4 action sẵn có (`transitions.js:16-19`), `CANCEL` vẫn ngoài union; StatusHistory và `forcesFail` đúng.
- Khóa `FOR NO KEY UPDATE` cùng khóa với `applyTransition`, kiểm lại `IN_PROGRESS` dưới khóa, tính lại điều kiện đóng trong `extra` (§1.2, §7.2) là đúng cho FR27.3. Không tăng `Topic.version` hợp lý.
- Không gọi Cloudinary trong transaction, xác minh response, dọn mồ côi, URL ký `expires_at` + `attachment`, cấm URL giao hàng vĩnh viễn: đúng FR11/FR24.
- ADMIN 403 ở mọi endpoint nghiệp vụ; thứ tự kiểm quyền (403 trước 409) nhất quán.
- Hai test đồng thời (đóng ‖ tạo mốc; sửa ‖ nhận xét tiến độ) đủ để bắt lỗi khóa.

## MAJOR
**M1 – G26 lệch FR27.5** (§7.3 dòng 338, §12 dòng 613). FR27.5: "Hết hạn đợt mà đề tài **chưa đủ điều kiện**: gia hạn mốc hoặc đóng Không đạt". Hợp đồng cho `CLOSE_EXPIRED` cả khi đề tài **đã đủ** điều kiện, và ép kết quả FAIL, nên có thể làm trượt oan một đề tài đã đạt chỉ vì GVHD chưa bấm gửi đóng. Đề xuất (chọn một, ghi vào §7.3 + hỏi người dùng):
 (a) theo đặc tả: `CLOSE_EXPIRED` khi `closeConditions` thỏa → 409 mới `CLOSE_CONDITIONS_MET` ("Đề tài đã đủ điều kiện, hãy chờ GVHD gửi đóng"), tính lại trong `extra` dưới khóa; hoặc
 (b) giữ G26 nhưng ghi rõ là mở rộng ngoài FR27.5 và chờ người dùng xác nhận trước T405. Khuyến nghị (a): đề tài kẹt vì GV bỏ đi vẫn đóng được qua đường thay GV (FR19) hoặc đổi hạn.

## MINOR (không chặn)
- m1 – §5.2 bước 3 (dòng 187) mâu thuẫn với đoạn trạng thái (dòng 181-182): trạng thái phụ thuộc `stage`, mà `stage` là field multipart chưa đọc ở bước 3. Ghi rõ: bước 3 chỉ cho phép `status ∈ {DRAFT, NEEDS_REVISION, IN_PROGRESS}` + `isMember`; kiểm `TOPIC_NOT_EDITABLE` / `TOPIC_NOT_IN_PROGRESS` / mốc theo `stage` làm ở handler (bước 7) và lặp lại dưới khóa.
- m2 – G24 + `stateMachine.js:41`: tập mốc bắt buộc rỗng trả `MILESTONES_NOT_PASSED` với `details.milestones = []` và thông điệp "Còn mốc bắt buộc chưa Đạt" gây hiểu nhầm. Thêm thông điệp/`details` riêng (vd. `details: { milestones: [], reason: 'NO_REQUIRED_MILESTONE' }`, "Đề tài chưa có mốc bắt buộc") hoặc mã `NO_REQUIRED_MILESTONE`; cập nhật §2.
- m3 – Lỗ hổng lách điều kiện đóng: GVHD có thể `PATCH required=false` trên mốc chưa Đạt (§3.2) rồi đóng. Có AuditLog nhưng cán bộ không thấy. Đề xuất: `closeReadiness`/màn xác nhận cán bộ hiện số mốc đã bỏ cờ bắt buộc, hoặc thông báo cán bộ; tối thiểu ghi vào §7.3 làm rủi ro đã biết.
- m4 – §6.4 dòng 303 "Endpoint này trả 409 `TOPIC_NOT_IN_PROGRESS`" mơ hồ: chỉ POST. GET `results` vẫn đọc được sau CLOSED (cần cho FE và FR23).
- m5 – §7.3 `CLOSE_EXPIRED`: `summary = reason` nhưng `finalResultSchema.summary` tối thiểu 20 còn `reason` tối thiểu 5. Thống nhất (vd. `summary = 'Đóng do hết hạn đợt: ' + reason`).
- m6 – G31 nói "mỗi mốc rơi vào cửa sổ đúng một lần": thực tế nằm trong cửa sổ X ngày nên bị quét nhiều lần, chỉ `dedupeKey` chặn trùng. Sửa chữ để BE không thêm logic thừa.
- m7 – §4.1: `feedbacks` tối đa 20/mục nhưng không nêu cách chọn (mới nhất?). §8.3 link `/de-tai/:id/nhom`, `/xet-duyet/:id`: FE (T406/T504) phải xác nhận route tồn tại, nếu chưa có thì ghi route cần thêm.
- m8 – §8.1: ADMIN gọi được `/api/notifications` (rỗng, vô hại) nhưng chưa nói rõ trong §1.1; thêm một câu để QA không viết test 403 sai.

## Hai điểm lệch API_GD2
- **404 khi đánh dấu đọc thông báo của người khác: CHẤP THUẬN.** Dữ liệu cá nhân không gắn quan hệ đề tài, 404 chống dò id; ngoại lệ đã ghi tại §8.1. Cần ghi tương tự vào bảng §2 của API_GD2 hoặc test QA phải khẳng định đúng 404.
- **`label` trong JSON thống kê: CHẤP THUẬN.** Bảo đảm biểu đồ/bảng/CSV cùng chuỗi (FR14). Lưu ý `key = null` dùng `label` cố định; FE không tự dịch lại.

## Đánh giá giả định G15–G31
| G | Nhận định |
|---|---|
| G15, G17, G18, G19, G20, G21 | Hợp lý, không lệch đặc tả. |
| G16 | Đúng FR09 (mốc gắn từng đề tài do GVHD/cán bộ tạo). Không lệch. Mốc mẫu để sau. |
| G22, G23, G29, G30, G31, G32 | Hợp lý. G30: ghi khi cấp link là đúng FR24. |
| **G24** | **Mở rộng chặt hơn FR27** ("mọi mốc bắt buộc Đạt" đúng trên tập rỗng). Chấp nhận được làm mặc định an toàn, nhưng là quyết định nghiệp vụ -> **hỏi người dùng** (đã có trong §13). Kèm m2. |
| **G25** | Khớp FR27 ("của GVHD"). Hệ quả: sau thay GV (FR19) phải nhập lại, ở WAITING_CLOSE GV mới không ghi được (G15) nên cán bộ phải trả lại. Chấp nhận; ghi chú cho T601. |
| **G26** | **Lệch FR27.5** -> M1. **Hỏi người dùng** nếu chọn (b). |
| **G27** | Không rõ trong đặc tả (FR14 "kết quả", FR23 "phiên bản hiện hành"). Chỉ tính CLOSED là hợp lý cho báo cáo, nhưng tạo lệch quan sát được giữa `GET /api/topics?result=` (mọi trạng thái) và `/api/stats`. Mọi đề tài CLOSED đều có kết quả (CONFIRM_CLOSE cần, CLOSE_EXPIRED tạo FAIL) nên lệch chỉ ở IN_PROGRESS/WAITING_CLOSE có kết quả nháp. MINOR; **nên hỏi người dùng** thống nhất một định nghĩa (khuyến nghị: bộ lọc `result` của danh sách cũng chỉ tính đề tài CLOSED, sửa ở T503 hoặc T600). |
| **G28** | Không lệch đặc tả (FR12 không cấm). Quyết định hiển thị; hỏi cùng G27 cho gọn. |

## Câu hỏi cho người dùng (không chặn việc khác)
1. G26/FR27.5: cho phép cán bộ đóng "Không đạt" khi đề tài đã đủ điều kiện hay chặn?
2. G24: đề tài không có mốc bắt buộc có được đóng?
3. G27/G28: thống nhất kết quả "chính thức" chỉ sau CLOSED cho cả danh sách lẫn thống kê, và sinh viên thấy kết quả GV nhập trước khi đóng?
