---
description: Review lại một task bởi một agent cụ thể – dùng: /review T212 bao-mat
---

Tham số: $ARGUMENTS (dạng `<ID task> <tên agent reviewer>`; thiếu tên agent thì dùng mọi reviewer trong cột Review của task).
Gọi subagent reviewer tương ứng, yêu cầu đọc `docs/agents/reports/<ID>.md`, các review trước, tự chạy lại lệnh, và ghi `docs/agents/reviews/<ID>-<agent>-v<n>.md` (n = số vòng tiếp theo).
Báo lại kết luận và các BLOCKER/MAJOR.
