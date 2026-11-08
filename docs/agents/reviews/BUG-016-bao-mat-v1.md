# Review BUG-016 – bảo mật v1: APPROVED

## Kiểm tra
- env.js: access `.int().positive().max(900)`, refresh `.int().positive().max(30)`, mặc định 900/7. `apps/api/.env.example` đặt 900/7, không vượt trần. Không có `render.yaml`/VAN_HANH đặt TTL (grep không thấy). Trần 30 ngày hợp lý, đặc tả không nêu thời hạn refresh.
- Logger: `server.js` luôn truyền `createLogger(env)` nên production không đổi; nhánh `logger` rỗng chỉ dùng `level: 'silent'` + `LOG_REDACT`.
- Limiter: `/refresh` và `/logout` mỗi route một store riêng, key IP (ipv6Subnet 56, trust proxy 1), 300/15 phút. Cho SPA nhiều tab là đủ rộng, chỉ chặn lạm dụng. Không dùng chung store với `loginLimiter` (20 lần, chỉ tính lần thất bại) nên login không bị ảnh hưởng. Lỗi 429 là AppError chuẩn `RATE_LIMITED`.
- Workflow: cả 5 checkout (ci x3, backup, cleanup-orphans, migrate) đều có `persist-credentials: false`; không job nào cần push.

## Lệnh
- `npm run lint`: sạch (`--max-warnings 0`).
- `npm test`: shared 73, api 948 (65 file), web 230 đều đạt.

## Lưu ý nhỏ (không chặn)
Nhiều người dùng sau cùng NAT trường học dùng chung 300 lần/15 phút/IP cho refresh; thấp rủi ro vì mỗi phiên chỉ refresh ~mỗi 15 phút.
