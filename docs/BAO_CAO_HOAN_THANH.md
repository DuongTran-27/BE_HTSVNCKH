# Báo cáo hoàn thành – Website quản lý NCKH sinh viên Khoa CNTT

Ngày: 2026-11-08. Kiểm tra cuối: `docs/agents/reviews/FINAL-reviewer.md` (lần 2, APPROVED), `docs/agents/reviews/FINAL-bao-mat.md` (APPROVED).

## 1. Tính năng
Đủ FR01–FR27 theo `docs/DAC_TA.md` (truy vết FR ↔ test: `docs/agents/TRUY_VET.md`; mọi FR mức P1/P2 có test mang mã `TC-FRxx`):
- Đăng nhập JWT + refresh token, Argon2id, khóa sau nhiều lần sai, bắt đổi mật khẩu tạm; quản lý tài khoản, nhập CSV (FR01–FR02).
- Danh mục, đợt đăng ký, đăng ký đề tài và nhóm, kiểm tra tương tự FR06 (pg_trgm + TF-IDF), duyệt theo bảng chuyển trạng thái chung `packages/shared/src/transitions.js`, ghi `StatusHistory` (FR03–FR08).
- Thực hiện: mốc, tiến độ, nhận xét, tài liệu Cloudinary có phiên bản, kết quả nghiệm thu (FR09–FR12, FR17).
- Nhắc hạn theo lịch, thông báo, thống kê + xuất CSV, đề tài kẹt, nhật ký audit (FR13–FR16).
- Yêu cầu thay đổi sau duyệt, đổi GVHD, hủy, rời nhóm, sửa kết quả (FR18–FR24).
- Phân quyền ở backend, admin không có quyền nghiệp vụ (FR25); sao lưu pg_dump mã hóa + dọn file mồ côi (FR26); OpenAPI/Swagger (FR27).

## 2. Kiểm thử (hai lượt liên tiếp, cùng kết quả)
| Lệnh | Kết quả |
|---|---|
| `npm ci`, `npm run lint`, `npm run build -w @nckh/web` | exit 0 |
| `npm test` | shared 73, api 945, web 230 – tất cả đạt |
| `npm run test:coverage` (ngưỡng 70% theo thư mục, tự đỏ khi dưới) | 1.248 test đạt, exit 0 |
| `npm run test:e2e -w @nckh/web` | 58/58 đạt |

Độ phủ: `apps/api/src/modules` lines 99,43% · statements 97,71% · functions 99,60% · branches 92,75%; `packages/shared/src` lines 100% · statements 98,75% · functions 87,76% · branches 79,46%.

## 3. Hiệu năng (NFR04, `docs/agents/reports/T704.md`, máy dev, 2.000 đề tài)
| Chỉ số | p95 | Ngưỡng |
|---|---|---|
| Danh sách (mọi bộ lọc, kể cả `q` ngắn) | ≤ 31 ms | 1 s |
| Thống kê, xuất CSV | ≤ 11 ms | 2 s |
| Kiểm tra tương tự FR06 (kho 1.749) | 248 ms | 3 s |
| Xác nhận nhập CSV 2.000 dòng | ~23 s (trước BUG-013; nay băm mật khẩu tạm nhẹ hơn) | timeout proxy – đo lại trên Render |

## 4. Thực nghiệm FR06 (`docs/agents/reports/T705.md`, 122 cặp gán nhãn)
| Mức | Precision | Recall |
|---|---|---|
| Cần xem xét trở lên | 92,9% | 92,9% (tiêu chí ≥ 80%: đạt) |
| Nghi trùng cao | 100% | 92,9% |

4 cặp bỏ sót đều thuộc nhóm "khác từ ngữ hoàn toàn" – giới hạn TF-IDF đã ghi trong đặc tả. Dữ liệu tự soạn nên lạc quan; nên bổ sung cặp thật từ kho NCKH cũ trước khi chốt ngưỡng.

## 5. Việc con người cần làm để deploy
Agent không deploy, không tạo tài khoản dịch vụ, không đọc `.env`. Hướng dẫn chi tiết: `docs/VAN_HANH.md`.
1. Tạo dịch vụ Supabase, Render, Vercel, Cloudinary; đặt biến môi trường theo §6.1–§6.2; repo GitHub để **private**, environment `production` bật Required reviewers.
2. Tách role `nckh_app` / `backup_ro` trên Supabase (§5, §3.1); tắt Data API; chạy migrate qua workflow `migrate.yml` (§6.3).
3. **Bắt buộc trước khi dùng thật** – checklist sau deploy §6.4: đo số hop rồi đặt `trust proxy` đúng (MAJOR T703c mục 3, đặt sai sẽ hỏng giới hạn đăng nhập theo IP), sau đó gỡ `LOG_PROXY_HOPS`; kiểm gọi thẳng Render nhận 404, cron qua domain Vercel trả 200, `/api/docs` 404 ở production, header bảo mật/CSP, cookie trên Chrome/Safari, nhập CSV 2.000 dòng không bị proxy cắt.
4. Cấu hình secret sao lưu và diễn tập khôi phục một lần có biên bản (§3.1–§3.3).
5. Trả lời `docs/agents/CAU_HOI.md` #10–#12 (G33, G37/G41, G44) – hệ thống đang chạy theo phương án đề xuất ghi trong đó.

## 6. Hạn chế đã biết
- Job E2E trong CI chưa chạy thật trên GitHub (chỉ chạy cục bộ).
- Số đo NFR01–NFR04, NFR10 trên hạ tầng thật chỉ có sau deploy (§6.4).
- MINOR bảo mật không chặn (`FINAL-bao-mat.md`): cận trên TTL token, cookie test in ra log CI, `persist-credentials: false` trong `ci.yml`, limiter cho `/api/auth/refresh` và `/logout`.
- Hoãn: phân trang nhận xét (B5).
