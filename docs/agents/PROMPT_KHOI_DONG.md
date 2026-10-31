# Hướng dẫn khởi động Claude Code

## 1. Chuẩn bị (làm một lần)
1. Giải nén bộ code Giai đoạn 1, chép toàn bộ bộ này (`CLAUDE.md`, `.claude/`, `docs/agents/`) vào **gốc** repo.
2. Xuất tài liệu đặc tả (Claude Doc) ra Markdown, lưu thành `docs/DAC_TA.md`.
3. `git init && git add -A && git commit -m "Khởi tạo"` – mỗi task DONE sẽ là một commit, dễ quay lại.
4. Cài Docker (cho database test) và Node.js LTS.
5. Mở Claude Code tại gốc repo, gõ `/agents` để kiểm tra đủ 7 agent.

## 2. Prompt khởi động (dán nguyên văn vào Claude Code)

```
Bạn là điều phối viên dự án NCKH Khoa CNTT. Đọc CLAUDE.md, docs/DAC_TA.md, docs/LO_TRINH.md,
docs/agents/QUY_TRINH.md và docs/agents/BANG_CONG_VIEC.md.

Trước khi giao việc, làm 3 việc và báo lại cho tôi, CHƯA code gì:
1. Chạy npm install và npm test, báo kết quả hiện trạng Giai đoạn 1.
2. Rà bảng việc: chỉ ra task nào thiếu phụ thuộc, trùng phạm vi, hoặc chưa phủ FR nào trong đặc tả.
   Đề xuất chỉnh sửa (không tự sửa).
3. Liệt kê những gì cần tôi cung cấp (tài khoản, biến môi trường, quyết định nghiệp vụ).

Sau khi tôi đồng ý, chạy /dieu-phoi và tiếp tục vòng lặp giao việc → báo cáo md → review chéo → sửa
cho đến khi mọi task DONE và /kiem-tra-cuoi đạt. Tuân thủ tuyệt đối QUY_TRINH.md: không tự đánh dấu
DONE khi thiếu review, không sửa hay bỏ qua test để cho qua, không deploy, không đọc .env.
Báo tiến độ ngắn sau mỗi task. Gặp việc cần con người thì ghi CAU_HOI.md và làm task khác.
```

## 3. Các lệnh dùng hằng ngày

| Lệnh | Khi nào |
|---|---|
| `/dieu-phoi` | Chạy vòng lặp tự động. Có thể giới hạn: `/dieu-phoi chỉ làm 3 task` |
| `/lam-task T209` | Làm trọn một task cụ thể |
| `/review T212 bao-mat` | Bắt một agent review lại task |
| `/trang-thai` | Xem tiến độ, BUG, câu hỏi đang chờ |
| `/kiem-tra-cuoi` | Cổng cuối; chỉ khi đạt mới tuyên bố hoàn thành |

## 4. Mẹo vận hành
- Chạy theo từng giai đoạn (`/dieu-phoi chỉ làm giai đoạn 2`), đọc `/trang-thai` rồi mới sang giai đoạn sau. Ngữ cảnh mỗi phiên có giới hạn; trạng thái thật nằm trong các file md nên mở phiên mới vẫn tiếp tục được.
- Khi mở phiên mới: gõ `/trang-thai` rồi `/dieu-phoi`.
- Trả lời câu hỏi bằng cách điền cột "Trả lời" trong `docs/agents/CAU_HOI.md`, rồi chạy lại `/dieu-phoi`.
- Thấy agent đi sai hướng: dừng (Esc), sửa trực tiếp file báo cáo/bảng việc, chạy lại `/lam-task <ID>`.
- Deploy cuối cùng do bạn làm theo `docs/VAN_HANH.md` (agent devops viết ở T706).
