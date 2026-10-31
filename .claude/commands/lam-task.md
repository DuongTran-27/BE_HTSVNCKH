---
description: Chạy trọn một task (làm → báo cáo → review chéo → sửa) – dùng: /lam-task T209
---

Thực hiện riêng task **$ARGUMENTS** theo đúng bước 3–6 của `.claude/commands/dieu-phoi.md`:
kiểm tra phụ thuộc đã DONE (chưa thì dừng và báo), giao cho agent chủ trì, kiểm báo cáo, gọi đủ reviewer trong cột Review, lặp sửa tối đa 3 vòng, cập nhật `docs/agents/BANG_CONG_VIEC.md`, commit khi DONE.
Cuối cùng báo: trạng thái task, số vòng review, các vấn đề đáng chú ý đã sửa.
