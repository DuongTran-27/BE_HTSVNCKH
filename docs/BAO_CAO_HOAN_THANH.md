# Báo cáo hoàn thành – Website quản lý nghiên cứu khoa học sinh viên Khoa Công nghệ Thông tin

Ngày: 2026-11-20 (cập nhật sau phần bổ sung theo đề cương DC-00..24; các bản trước 2026-11-08, 2026-11-11). Kiểm tra cuối 2026-11-20: hai lượt cùng kết quả (mục 2), `docs/agents/reviews/FINAL-bao-mat-v3.md` APPROVED.

## 1. Tính năng
Đủ FR01–FR27 theo `docs/DAC_TA.md` (truy vết FR ↔ test: `docs/agents/TRUY_VET.md`; mọi FR có test mang mã `TC-FRxx`):
- Đăng nhập JWT + refresh token, Argon2id, khóa sau nhiều lần sai, bắt đổi mật khẩu tạm; quản lý tài khoản (tạo, sửa, khóa, đặt lại mật khẩu, **xóa tài khoản chưa phát sinh nghiệp vụ**), nhập CSV (FR01–FR02).
- Danh mục, đợt đăng ký, đăng ký đề tài và nhóm, kiểm tra tương tự FR06 (pg_trgm + TF-IDF), duyệt theo bảng chuyển trạng thái chung `packages/shared/src/transitions.js`, ghi `StatusHistory` (FR03–FR08).
- Thực hiện: mốc, tiến độ, nhận xét, tài liệu Cloudinary có phiên bản, kết quả nghiệm thu (FR09–FR12, FR17).
- Nhắc hạn theo lịch, thông báo, thống kê + xuất CSV, đề tài kẹt, nhật ký audit (FR13–FR16).
- Yêu cầu thay đổi sau duyệt, đổi giảng viên hướng dẫn, hủy, rời nhóm, sửa kết quả (FR18–FR24).
- Phân quyền ở backend, admin không có quyền nghiệp vụ (FR25); sao lưu pg_dump mã hóa + dọn file mồ côi (FR26); OpenAPI/Swagger (FR27).

Bổ sung sau bản 2026-11-08 (yêu cầu trực tiếp của chủ dự án, xem mục "Sau hoàn thành" trong `docs/agents/BANG_CONG_VIEC.md`):
- Giao diện dựng trên **shadcn/ui** (Radix + Tailwind), phong cách dashboard, giữ nhận diện Đại học Văn Lang, font Be Vietnam Pro tự host; chữ hiển thị viết đầy đủ, không viết tắt (TASK-UI-SHADCN, duyệt bởi kien-truc-su và reviewer).
- Xóa tài khoản an toàn: chỉ ADMIN, chặn khi có dữ liệu nghiệp vụ hoặc từng thực hiện thao tác (khóa ngoại `AuditLog.actorId`), không bao giờ còn 0 quản trị viên hoạt động; sửa race hai ADMIN khóa/xóa nhau (TASK-USER-DELETE, TASK-LOCK-ADMIN-RACE, bao-mat APPROVED).
- Lỗi khóa ngoại trả 409 với thông điệp tiếng Việt thay cho 500.
- Dữ liệu demo thống kê nhiều năm học: `npm run demo:stats -w @nckh/api` (chỉ DB dev/demo).

Bổ sung theo đề cương nhóm (2026-11-18 → 2026-11-20, FR28–FR39 trong `docs/DAC_TA.md` §9, TASK-DC-00..24, truy vết `docs/agents/TRUY_VET.md` mục 2b):
- Đăng nhập Google (FR28, chỉ tên miền trường, bật bằng biến môi trường) và email thông báo SMTP (FR29, hộp thư đi có thử lại, bật bằng biến môi trường).
- Hồ sơ cá nhân (FR30); giảng viên công bố đề tài tuyển, sinh viên ứng tuyển, giảng viên duyệt/từ chối và chốt nhóm (FR31–FR33).
- Điểm quá trình, đề nghị ra hội đồng, lập hội đồng (chặn xung đột lợi ích), chấm độc lập, thư ký/chủ tịch chốt nghiệm thu 2 bước, kết quả nguồn hội đồng (FR34–FR37).
- Kanban mốc (kéo thả + bàn phím, FR38), xuất Excel thống kê (FR39).

## 2. Kiểm thử (hai lượt liên tiếp, cùng kết quả – 2026-11-20)
| Lệnh | Kết quả |
|---|---|
| `npm ci`, `npm run lint`, `npm run build -w @nckh/web` | exit 0 |
| `npm test -- --coverage` | shared 115, api 1222, web 384 – tất cả đạt; độ phủ ≥ 70% (api lines 95,25%, shared lines 95,95%) |
| `npm run test:e2e -w @nckh/web` | 100/100 đạt (6,3 và 6,4 phút; desktop 1280 + 360 px) |

Sau review bảo mật cuối v3 (thêm CHECK điểm 0..10, limiter rút đơn, test bảo mật FINAL-v3): `npm test` shared 115, api 1227, web 384 đạt; lint 0; E2E 100/100 (6,3 phút).

### Lượt trước (2026-11-11)
| Lệnh | Kết quả |
|---|---|
| `npm ci`, `npm run lint`, `npm run build -w @nckh/web` | exit 0 |
| `npm test` | shared 73, api 972, web 236 – tất cả đạt |
| `npm run test:coverage` (ngưỡng 70% theo thư mục, tự đỏ khi dưới) | 1.281 test đạt, exit 0 |
| `npm run test:e2e -w @nckh/web` | 74/74 đạt (desktop + 360 px) |

Độ phủ: `apps/api/src/modules` lines 99,44% · statements 97,68% · functions 99,60% · branches 92,77%; `packages/shared/src` lines 100% · statements 98,75% · functions 87,76% · branches 79,46%.
E2E nay phủ cả FR04, FR09, FR10, FR18–FR20, FR22, FR23 (trước chỉ có integration). Bộ test web chạy song song hết chập chờn (thời gian chờ chung 3 s).

## 3. Hiệu năng (NFR04, `docs/agents/reports/T704.md`, máy dev, 2.000 đề tài)
| Chỉ số | p95 | Ngưỡng |
|---|---|---|
| Danh sách (mọi bộ lọc, kể cả `q` ngắn) | ≤ 31 ms | 1 s |
| Thống kê, xuất CSV | ≤ 11 ms | 2 s |
| Kiểm tra tương tự FR06 (kho 1.749) | 248 ms | 3 s |
| Xác nhận nhập CSV 2.000 dòng | ~23 s (trước BUG-013; nay băm mật khẩu tạm nhẹ hơn) | timeout proxy – đo lại trên Render |

Bundle web (gzip, JS + CSS): ~378 KB (+27 KB do shadcn/ui).

## 4. Thực nghiệm FR06 (`docs/agents/reports/T705.md`, 122 cặp gán nhãn)
| Mức | Precision | Recall |
|---|---|---|
| Cần xem xét trở lên | 92,9% | 92,9% (tiêu chí ≥ 80%: đạt) |
| Nghi trùng cao | 100% | 92,9% |

**Đã đo lại với `similarity()` pg_trgm thật của PostgreSQL** (TC-FR06-95, `docs/agents/reports/TASK-FR06-PGTRGM.md`): điểm tên khớp mô phỏng JS ở cả 122 cặp (chênh 0,000), số liệu trên giữ nguyên. Hạn chế còn lại: 4 cặp bỏ sót thuộc nhóm "khác từ ngữ hoàn toàn" (giới hạn TF-IDF, hướng phát triển là embedding); bộ dữ liệu một người soạn và gán nhãn nên lạc quan – nên bổ sung cặp thật từ kho đề tài cũ trước khi chốt ngưỡng.

## 5. Việc con người cần làm để deploy
Agent không deploy, không tạo tài khoản dịch vụ, không đọc `.env`. Hướng dẫn chi tiết: `docs/VAN_HANH.md`.
1. Tạo dịch vụ Supabase, Render, Vercel, Cloudinary; đặt biến môi trường theo §6.1–§6.2; repo GitHub để **private**, environment `production` bật Required reviewers.
2. Tách role `nckh_app` / `backup_ro` trên Supabase (§5, §3.1); tắt Data API; chạy migrate qua workflow `migrate.yml` (§6.3). Migration `20261111000000_audit_actor_fk` dừng có thông báo nếu DB thật có dòng AuditLog mồ côi (DB mới thì không).
3. **Bắt buộc trước khi dùng thật** – checklist sau deploy §6.4: đo số hop rồi đặt `trust proxy` đúng (MAJOR T703c mục 3, đặt sai sẽ hỏng giới hạn đăng nhập theo IP), sau đó gỡ `LOG_PROXY_HOPS`; kiểm gọi thẳng Render nhận 404, cron qua domain Vercel trả 200, `/api/docs` 404 ở production, header bảo mật/CSP, cookie trên Chrome/Safari, nhập CSV 2.000 dòng không bị proxy cắt.
4. **CSP với giao diện mới** – đã kiểm cục bộ trên build production với header của `vercel.json` (`docs/agents/reports/TASK-CSP-CHECK.md`): thuộc tính `style` không bị chặn; vi phạm `eval` của Zod đã sửa; còn một vi phạm đã biết khi mở hộp thoại (Radix chèn `<style>` khóa cuộn nền → chỉ mất khóa cuộn) – **chờ quyết**: giữ CSP nghiêm (đề xuất) hay thêm `'unsafe-inline'` riêng cho `style-src-elem` (cần bao-mat duyệt). Sau deploy vẫn xem Console trên bản preview theo `VAN_HANH.md` §6.4 mục 8.
5. Cấu hình secret sao lưu và diễn tập khôi phục một lần có biên bản (§3.1–§3.3).
6. **Google SSO + SMTP (tùy chọn)** – `docs/VAN_HANH.md` §6.5–§6.6: tạo OAuth client (Internal, redirect URI `https://<domain web>/api/auth/google/callback`, `GOOGLE_ALLOWED_DOMAINS` = tên miền trường), tài khoản SMTP có STARTTLS + SPF/DKIM/DMARC; nhập biến `sync: false` trên Render. Migration mới `20261120000000_dc20_email_status_check`, `20261120010000_final_score_range_check` chạy qua workflow Migrate.
7. Trả lời `docs/agents/CAU_HOI.md` #10–#12 (G33, G37/G41, G44) – hệ thống đang chạy theo phương án đề xuất ghi trong đó.

## 6. Hạn chế đã biết
- Số đo NFR01–NFR04, NFR10 trên hạ tầng thật chỉ có sau deploy (§6.4).
- Limiter `/api/auth/refresh` 300 lần/15 phút/IP – nếu cả trường đi chung một IP NAT (> ~250 phiên đồng thời) thì nâng mức này sau khi đo thật. API không khởi động nếu `ACCESS_TOKEN_TTL_SECONDS` > 900 hoặc `REFRESH_TOKEN_TTL_DAYS` > 30.
- `npm audit`: 4 lỗ hổng mức moderate ở `minimatch` qua `eslint` (chỉ dùng khi phát triển); `npm audit --omit=dev` = 0. Theo dõi bản vá eslint.
- Hoãn (ngoài đặc tả): phân trang nhận xét (B5).
- `npm audit --omit=dev`: 2 moderate `uuid` qua `exceljs` – không khai thác được (exceljs chỉ gọi `uuid.v4()` không `buf`; bao-mat DC-20 + FINAL v3 chấp nhận); theo dõi bản exceljs mới.
- FR29 (email) không có E2E – cần SMTP thật, kiểm sau deploy. Kanban kéo thả bằng chuột chỉ test trong jsdom; E2E đi qua bàn phím.
- FINAL-bao-mat-v3 m3 (MINOR, chấp nhận): `DefenseScore`/`CouncilAssignment` chưa có trigger chặn TRUNCATE – chỉ khai thác được khi có quyền DB trực tiếp.
- Bộ E2E dùng khoảng 160/300 lượt refresh mỗi project (`QUY_TRINH.md`, ghi chú E2E).
