# Kịch bản kiểm thử – Website quản lý NCKH sinh viên Khoa CNTT

Phiên bản: 1.0 · Ngày lập: 2026-11-22 · Dùng cho: trình bày báo cáo / bảo vệ đồ án.
Nguồn sự thật: `docs/DAC_TA.md` (M1–M5, FR01–FR39, NFR01–NFR10). Truy vết ca ↔ test tự động: `docs/agents/TRUY_VET.md`. Số liệu chạy test: `docs/BAO_CAO_HOAN_THANH.md` mục 2.

---

## 1. Mục đích và phạm vi

| Mục | Nội dung |
|---|---|
| Mục đích | Chứng minh hệ thống đáp ứng mọi yêu cầu chức năng (FR01–FR39) và phi chức năng (NFR01–NFR10) của đặc tả; cung cấp kịch bản demo trực tiếp trước hội đồng. |
| Trong phạm vi | Xác thực, phân quyền, danh mục, đăng ký đề tài, kiểm tra trùng lặp (FR06), xét duyệt, thực hiện (mốc, tiến độ, tài liệu, nhận xét), đóng đề tài, thông báo, thống kê/CSV/Excel, yêu cầu thay đổi, tuyển sinh viên, hội đồng bảo vệ, Kanban, SSO, email. |
| Ngoài phạm vi | Kiểm thử trên hạ tầng thật (Vercel/Render/Supabase/Cloudinary) – chỉ làm được sau deploy (mục 8). Email SMTP thật, Google OAuth thật, trình duyệt Safari. |

## 2. Chiến lược kiểm thử

| Mức | Công cụ | Đối tượng | Lệnh |
|---|---|---|---|
| Unit (U) | Vitest | Bảng chuyển trạng thái, schema Zod, thuật toán FR06, CSV, quy đổi điểm | `npm test` |
| Integration (I) | Vitest + Supertest + PostgreSQL 16 thật | Mọi endpoint REST, transaction, đồng thời, quyền | `npm test` |
| Bảo mật (S) | Vitest + Supertest | IDOR, cookie, CORS, rate limit, lộ thông tin, CSV injection | `npm test` |
| Component web (W) | Vitest + Testing Library | Màn hình React, form, guard vai trò | `npm test` |
| E2E (E) | Playwright, 2 viewport (1280 px và 360 px) | Luồng nghiệp vụ trọn vẹn qua trình duyệt | `npm run test:e2e -w @nckh/web` |
| Hiệu năng (P) | Script đo p95 trên 2.000 đề tài | NFR04 | `npm run perf -w @nckh/api` |
| Thực nghiệm (V) | Bộ 122 cặp gán nhãn | Precision/recall FR06 | `npm run eval:fr06 -w @nckh/api` |
| Thủ công (M) | Trình duyệt | Kịch bản demo mục 5, kiểm tra sau deploy mục 8 | – |

**Kỹ thuật thiết kế ca:** phân vùng tương đương, giá trị biên (tóm tắt 99/100 từ, 2/3/5/6 từ khóa, điểm 4,99/5,00, file 10 MB), bảng quyết định (vai trò × trạng thái), chuyển trạng thái (13 + 6 lần chuyển ở `packages/shared/src/transitions.js`), đồng thời (hai yêu cầu cùng lúc), giả lập lỗi (lỗi DB giữa transaction, lỗi thuật toán FR06).

**Tiêu chí bắt đầu:** `npm ci`, `npm run lint` exit 0; DB test chạy (`docker compose -f docker-compose.test.yml up -d`).
**Tiêu chí kết thúc:** 100% ca P1/P2 đạt; không còn lỗi mức nghiêm trọng/cao mở; độ phủ ≥ 70% ở module nghiệp vụ (NFR09); E2E đạt trên cả 2 viewport.

## 3. Môi trường và dữ liệu kiểm thử

### 3.1 Chuẩn bị (máy demo)
Demo chạy trên **DB dev cục bộ** (embedded-postgres, `localhost:54330/nckh_dev`), không dùng Supabase: Supabase không cho bật cờ
`nckh.seed_allowed` nên không seed được, và nút "Đăng nhập nhanh" chỉ có ở chế độ dev. `.env` giữ nguyên (trỏ Supabase); URL DB dev
truyền qua biến môi trường, được ưu tiên hơn `.env`.

```bash
# Terminal 1 – BE_HTSVNCKH
npm run db:dev:up
export DATABASE_URL=postgresql://postgres:postgres@localhost:54330/nckh_dev DIRECT_URL=$DATABASE_URL
npx prisma migrate deploy && npx prisma db seed   # chỉ lần đầu (DB trống)
npm run demo:stats                                # tùy chọn: thống kê nhiều năm
npm run dev                                       # API http://localhost:4000/api/health

# Terminal 2 – FE_HTSVNCKH
npm run dev                                       # web http://localhost:5173
```
Swagger (chỉ dev): `/api/docs`. Sau buổi demo: Ctrl+C hai terminal rồi `npm run db:dev:down` (Ctrl+C không dừng DB).
Nếu cổng 4000 đang bị chiếm (API cũ chưa tắt), API mới in "Completed running" và mọi đăng nhập trỏ sang DB khác: tắt tiến trình cũ trước.

### 3.1a Đăng nhập nhanh khi demo
Ở `/dang-nhap` (chỉ khi chạy `npm run dev`) có khối **Đăng nhập nhanh (dữ liệu mẫu)**: một cú bấm điền mã + mật khẩu và đăng nhập luôn.

| Nút | Mã | Vào thẳng trang |
|---|---|---|
| Quản trị viên | `QT001` | `/quan-ly/tai-khoan` |
| Cán bộ khoa | `CB001` | `/xet-duyet` |
| Giảng viên | `GV001` | `/de-nghi-huong-dan` |
| Sinh viên | `2374801030010` | `/de-tai` |

Kiểm trước buổi demo (2 phút):

| Mã ca | Các bước | Kết quả mong đợi |
|---|---|---|
| DN-01 | Mở `/dang-nhap` | Thấy form và 4 nút đăng nhập nhanh |
| DN-02 | Bấm lần lượt từng nút (Đăng xuất giữa các lần) | Vào đúng trang ở bảng trên, không bị chuyển sang `/doi-mat-khau` |
| DN-03 | Nhập `CB001` + mật khẩu sai | Báo "Mã/email hoặc mật khẩu không đúng", ô mật khẩu bị xóa |
| DN-04 | Mở 3 cửa sổ ẩn danh, mỗi cửa sổ bấm một nút (SV, GV, CB) | Ba vai trò dùng song song, không phải đăng xuất khi chuyển vai |

Nếu DN-02 báo sai mật khẩu hoặc đòi đổi mật khẩu: các lần thử trước đã đổi mật khẩu trong DB dev. Seed mới đặt `mustChangePassword`
nên lần đầu luôn đòi đổi; để demo trơn, đặt lại toàn bộ về `Nckh@2026-dev` và bỏ cờ đổi mật khẩu (chỉ DB dev, có kiểm tên DB):

```bash
# BE_HTSVNCKH, cùng biến DATABASE_URL ở trên
node --input-type=module -e "
import { PrismaClient } from '@prisma/client'; import { passwordHasher } from './src/lib/password.js';
const p = new PrismaClient(); const [{ db }] = await p.\$queryRaw\`select current_database() db\`;
if (db !== 'nckh_dev') throw new Error('Không phải DB dev: ' + db);
const passwordHash = await passwordHasher.hash('Nckh@2026-dev');
console.log(await p.user.updateMany({ data: { passwordHash, mustChangePassword: false, failedLogins: 0, lockedUntil: null, isLocked: false } }));
await p.\$disconnect();"
```

### 3.2 Tài khoản mẫu (seed – chỉ dev, KHÔNG dùng trên production)
Mật khẩu chung: `Nckh@2026-dev`. Đăng nhập bằng **mã** hoặc email `<mã viết thường>@nckh.example`.

| Vai trò | Mã | Ghi chú |
|---|---|---|
| Quản trị (ADMIN) | `QT001` | Không có quyền nghiệp vụ (FR25) |
| Cán bộ khoa (STAFF) | `CB001`, `CB002` | Phạm vi Khoa CNTT |
| Giảng viên (LECTURER) | `GV001` … `GV008` | Hội đồng mẫu: GV002 Chủ tịch, GV003 Thư ký, GV004 Ủy viên |
| Sinh viên (STUDENT) | 40 SV, MSSV dạng `23` + mã ngành + 4 số, vd. `2374801030001`, `2374801040002`, `2374802010003` | Xem danh sách đầy đủ ở màn Quản lý tài khoản (CB001) |

Dữ liệu sẵn có: 1 khoa, 3 ngành, 6 lĩnh vực, 1 đợt đang mở đăng ký, 36 đề tài phủ đủ mọi trạng thái (3 đề tài mỗi trạng thái, gồm Đang tuyển sinh viên và Chờ bảo vệ), từ điển đồng nghĩa CNTT.

### 3.3 Tệp thử cần chuẩn bị
| Tệp | Mục đích |
|---|---|
| `bao-cao.pdf` (< 10 MB) | Nộp hợp lệ |
| `file-lon.pdf` (> 10 MB) | Kiểm giới hạn dung lượng |
| `virus.exe` hoặc `anh.png` | Kiểm loại file bị chặn |
| `tai-khoan.csv` UTF-8 có 1 dòng trùng mã, 1 dòng email sai | Kiểm nhập CSV báo lỗi theo dòng |

---

## 4. Ca kiểm thử chi tiết

Quy ước cột: **Mã ca** · **FR** · **Tiền điều kiện** · **Các bước** · **Kết quả mong đợi** · **Test tự động đối chiếu** (U/I/S/W/E như mục 2; `a/` = `apps/api/tests/`, `w/` = `apps/web/tests/`, `e/` = `apps/web/e2e/`) · **KQ** (kết quả lần chạy 2026-11-20; điền lại khi chạy tay).

### 4.1 Xác thực và tài khoản (NT – FR01, FR02, FR28, FR30)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| KT-01 | FR01 | Tài khoản `CB001` hoạt động | Đăng nhập đúng mã + mật khẩu | Vào trang Tổng quan; cookie refresh `httpOnly`, path `/api/auth` | I `a/auth.test.js` TC-FR01-01 | Đạt |
| KT-02 | FR01 | `GV005` hoạt động | Nhập sai mật khẩu 5 lần liên tiếp, lần 6 nhập đúng | Lần 6 vẫn bị từ chối, thông báo tạm khóa | I TC-FR01-02 | Đạt |
| KT-03 | FR01 | Đăng nhập `GV006` trên 2 trình duyệt A, B | Ở A đổi mật khẩu; ở B thao tác tiếp | B bị đăng xuất (phiên khác bị thu hồi); A vẫn dùng được | I TC-FR01-03/04 | Đạt |
| KT-04 | FR01 | Đang đăng nhập | Bấm Đăng xuất, bấm Back trình duyệt, F5 | Không vào lại được trang cần đăng nhập | W `w/security/logout-race.test.js` | Đạt |
| KT-05 | FR01 | `QT001` khóa tài khoản SV X khi X đang đăng nhập | X thao tác tiếp | Lần gọi kế tiếp bị từ chối, về trang đăng nhập | I `a/T205-auth-db.test.js` | Đạt |
| KT-06 | FR02 | Đăng nhập `QT001` | Tạo tài khoản trùng mã/email với tài khoản có sẵn | Báo lỗi tiếng Việt tại trường, không tạo | I TC-FR02-01..02 | Đạt |
| KT-07 | FR02 | `QT001` | Nhập CSV `tai-khoan.csv` → xem trước | Bảng xem trước báo lỗi đúng số dòng; chưa ghi DB cho tới khi bấm Xác nhận | I TC-FR02-05, -06 | Đạt |
| KT-08 | FR02 | `QT001` đặt lại mật khẩu cho SV | SV đăng nhập bằng mật khẩu tạm | Bị buộc sang `/doi-mat-khau` trước khi dùng chức năng khác | I `a/T207a-temp-password.test.js` | Đạt |
| KT-09 | FR02 | Chưa đăng nhập | Tìm chức năng đăng ký tài khoản | Không có màn/route tự đăng ký | Kiểm gián tiếp (không có route) | Đạt |
| KT-10 | FR28 | Không cấu hình biến môi trường Google | Mở `/dang-nhap` | Nút "Đăng nhập bằng Google" bị ẩn; API `/api/auth/google/start` trả 404 | I `a/DC03-sso.test.js`; E TC-FR28-E02 | Đạt |
| KT-11 | FR28 | Bật SSO (giả lập) | Đăng nhập bằng email sai tên miền / `email_verified=false` / chưa có tài khoản / tài khoản bị khóa / tài khoản ADMIN | Mọi trường hợp bị từ chối, chuyển về `/dang-nhap?sso_error=` kèm thông điệp tiếng Việt | I `a/DC03-sso.test.js` (khối "mọi nhánh lỗi") | Đạt |
| KT-12 | FR30 | Đăng nhập SV | `/ho-so` → sửa số điện thoại thành `0901234567`, rồi thử `12345` | Số hợp lệ lưu được; số sai báo lỗi tại trường; các trường họ tên, mã, email chỉ đọc | I `a/DC02-profile.test.js`; E TC-FR30-E01 | Đạt |

### 4.2 Phân quyền (FR25, NFR02)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| PQ-01 | FR25 | Đăng nhập `QT001` | Mở `/xet-duyet`, `/de-tai`, `/thong-ke` | Trang 403; gọi thẳng API nghiệp vụ trả 403 | E TC-FR25-E04; S `a/security/T703a-bao-mat.test.js` | Đạt |
| PQ-02 | FR25 | SV A không thuộc nhóm đề tài T | Gọi `GET /api/topics/<id T>` hoặc mở `/de-tai/<id T>` | 403/404, không lộ dữ liệu (chống IDOR) | S `a/security/T703c-bao-mat.test.js` › "T703c-1 IDOR" | Đạt |
| PQ-03 | FR25 | Đăng nhập SV | Gõ trực tiếp URL `/quan-ly/tai-khoan` | Màn 403 trên web và API từ chối | W `w/guards.test.jsx`; E TC-FR25-E05 | Đạt |
| PQ-04 | FR25 | GV không phải GVHD của đề tài T | Gửi nhận xét/đánh giá mốc của T qua API | 403 | I khối "quyền" ở `a/T404-feedback.test.js` | Đạt |
| PQ-05 | NFR02 | – | Gửi request lỗi (JSON sai, id không tồn tại) | Lỗi có mã + thông điệp chuẩn, không có stack trace | S `a/security/T215-bao-mat.test.js` | Đạt |

### 4.3 Danh mục và đợt (FR04)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| DM-01 | FR04 | `CB001` | Tạo đợt với mở đăng ký > đóng đăng ký | Báo lỗi thứ tự mốc tại trường, không lưu | U `s/catalog.test.js`; I TC-FR04-01 | Đạt |
| DM-02 | FR04 | Lĩnh vực "AI" đang được đề tài tham chiếu | Xóa lĩnh vực | Không cho xóa, chỉ cho Ngừng dùng | I TC-FR04-02 | Đạt |
| DM-03 | FR04 | `CB001` | Đặt tham số nhóm min = 4, max = 2 | Báo lỗi min ≤ max | I TC-FR04-03 | Đạt |
| DM-04 | FR04 | `CB001` | Tạo đợt mới hợp lệ | Tạo thành công, hiển thị trong `/quan-ly/dot` | E TC-FR04-E01 | Đạt |

### 4.4 Đăng ký đề tài – luồng sinh viên (M1: FR03, FR05, FR16, FR07, FR17)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| DK-01 | FR05 | SV chưa có đề tài hoạt động trong đợt | `/de-tai/moi` → nhập tên, lưu nháp | Đề tài ở trạng thái Nháp | E TC-FR05-E01 | Đạt |
| DK-02 | FR05 | Đề tài Nháp | Gửi khi tóm tắt 99 từ / 2 từ khóa / 6 từ khóa / thiếu lĩnh vực | Báo lỗi tại từng trường, không gửi | U `s/topics.test.js`; I `a/T209-topics.test.js` | Đạt |
| DK-03 | FR05 | Nhiều nhóm gửi cùng lúc | Gửi đồng thời | Mã đề tài sinh duy nhất, không trùng | I `a/T214-concurrency.test.js` | Đạt |
| DK-04 | FR03 | Trưởng nhóm | Mời SV B vào nhóm; B chưa chấp nhận | B chưa là thành viên; sau khi B chấp nhận ở `/loi-moi` mới là thành viên | I `a/T208-groups.test.js`; E TC-FR05-E01 | Đạt |
| DK-05 | FR03 | SV B đã có 1 đề tài hoạt động trong đợt (N = 1) | Mời B vào nhóm khác, B chấp nhận | Bị từ chối do vượt số đề tài hoạt động | I TC-FR03-C1..C4 | Đạt |
| DK-06 | FR03 | Thành viên (không phải trưởng nhóm) | Bấm Gửi xét duyệt | Không có nút; API trả 403 | I `a/T214-gd2-flow.test.js` TC-FR03-F3 | Đạt |
| DK-07 | FR16 | Đề tài Nháp, nhóm đủ min | `/de-tai/:id/moi-gvhd` → mời `GV001` | Đề tài chuyển "Chờ giảng viên hướng dẫn"; GV001 nhận thông báo | E TC-FR16-E02 | Đạt |
| DK-08 | FR16 | GV001 nhận đề nghị | Từ chối không nhập lý do | Báo lỗi bắt buộc lý do | I `a/T210-advisor.test.js` | Đạt |
| DK-09 | FR16 | GV đã đủ hạn mức 5 đề tài | Hai đề nghị được GV nhận đồng thời | Chỉ một thành công, không vượt hạn mức | I TC-FR16-C5, C6 | Đạt |
| DK-10 | FR16 | Đề nghị đang chờ | SV rút đề nghị | Đề tài về Nháp, mời được GV khác | I `a/T210-advisor.test.js` | Đạt |
| DK-11 | FR05 | Đợt đã đóng đăng ký | Gửi hồ sơ | Bị từ chối theo giờ server | I TC-NFR06-01..07 | Đạt |
| XD-01 | FR07 | Đề tài Chờ xét duyệt; `CB001` | `/xet-duyet/:id` → Yêu cầu chỉnh sửa không lý do | Báo lỗi bắt buộc lý do | I `a/T212a-review.test.js` | Đạt |
| XD-02 | FR07, FR17 | Như trên | Yêu cầu chỉnh sửa có lý do → SV sửa và gửi lại → mở `/de-tai/:id/so-sanh` | Có 2 snapshot; màn so sánh tô khác biệt; quyết định gắn đúng snapshot | I `a/T212b-snapshots.test.js` TC-FR17-01, -02; E TC-FR21-E01 | Đạt |
| XD-03 | FR07 | `CB001` | Duyệt đề tài | Trạng thái Đang thực hiện; ghi người duyệt + thời điểm; SV nhận thông báo | E TC-FR07-E04 | Đạt |
| XD-04 | FR07 | Hai cán bộ cùng xử lý một hồ sơ | Bấm duyệt đồng thời | Một thành công, một nhận lỗi xung đột | I TC-FR07-C7 | Đạt |

### 4.5 Kiểm tra tương tự (M5 – FR06)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| TT-01 | FR06 | Kho có "Nhận diện biển số xe bằng học sâu" | Soạn đề tài "Nhan dien bien so xe bang hoc sau" (bỏ dấu) → Kiểm tra trước | Mức Nghi trùng cao (đỏ), top 5 có điểm tên và điểm nội dung riêng | U `a/similarity.test.js`; E TC-FR06-E03 | Đạt |
| TT-02 | FR06 | Như trên | Đổi trật tự từ; thay "học sâu" bằng "deep learning" | Vẫn phát hiện (đồng nghĩa quy về một dạng) | U `a/similarity.test.js` | Đạt |
| TT-03 | FR06 | Mức đỏ | Gửi xét duyệt khi giải trình < 50 từ | Không gửi được; đủ 50 từ thì gửi được | E TC-FR06-E03 | Đạt |
| TT-04 | FR06 | Mức vàng | Gửi không giải trình | Gửi được (chỉ cảnh báo, không chặn) | I `a/T211-similarity.test.js` | Đạt |
| TT-05 | FR06 | Hồ sơ chờ duyệt của nhóm khác cùng đợt tương tự | SV xem kết quả | Chỉ thấy "Có 1 hồ sơ đang chờ duyệt trong đợt có nội dung tương tự" + điểm, không thấy tên/tóm tắt; cán bộ thấy đủ | I TC-FR06-01..05 | Đạt |
| TT-06 | FR06 | Hồ sơ Nháp/Bị từ chối/Đã hủy tương tự | Kiểm tra | Không xuất hiện trong top 5 | I TC-FR06-01..05 | Đạt |
| TT-07 | FR06 | Giả lập lỗi DB khi so | Gửi xét duyệt | Kết quả "Chưa kiểm tra được", **không phải "Không trùng"**; hồ sơ không gửi được | I TC-FR06-01..05; E TC-FR06-E09, E10 | Đạt |
| TT-08 | FR06 | Cán bộ cho phép gửi với cờ "chưa kiểm tra" | Hết lỗi, job kiểm tra lại chạy | Cờ được gỡ, snapshot cập nhật, có thông báo | E TC-FR06-E10 | Đạt |
| TT-09 | FR06 | `CB001` mở màn xét duyệt | Xem hồ sơ có cảnh báo | Thấy mức, top 5 và giải trình | E TC-FR07-E04 | Đạt |
| TT-10 | FR06 | Kho 2.000 đề tài | Đo thời gian kiểm tra | p95 ≤ 3 s (đo được 248 ms) | P TC-NFR04-04 | Đạt |
| TT-11 | FR06 | Bộ 122 cặp gán nhãn | `npm run eval:fr06` | Recall mức Cần xem xét ≥ 80% (đạt 92,9%) | V TC-FR06-90..95 | Đạt |

### 4.6 Thực hiện đề tài (M2, M3: FR09–FR12, FR22, FR24, FR38)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| TH-01 | FR09 | Đề tài Đang thực hiện; GVHD | `/de-tai/:id/moc` → tạo mốc (tên, đầu ra, hạn, bắt buộc) | Mốc xuất hiện với SV | I TC-FR09-01; E TC-FR09-E01 | Đạt |
| TH-02 | FR09 | Mốc có hạn | GVHD đổi hạn kèm lý do | Lưu lịch sử: hạn cũ, hạn mới, lý do, người đổi | I TC-FR09-03, -04 | Đạt |
| TH-03 | FR09 | Đăng nhập SV | Thử tạo/sửa mốc qua API | 403 | I TC-FR09-02 | Đạt |
| TH-04 | FR10 | SV thành viên | Cập nhật tiến độ % = 101 / -1 / 60 | 101 và -1 báo lỗi; 60 lưu, hiển thị "tự khai" | I TC-FR10-01..03; E TC-FR10-E01 | Đạt |
| TH-05 | FR10 | GVHD đã nhận xét bản tiến độ | SV sửa bản đó | Không sửa được | I TC-FR10-04 | Đạt |
| TH-06 | FR11 | SV | Nộp `bao-cao.pdf` | Nộp thành công sau khi xác minh tồn tại trên kho lưu trữ | E TC-FR11-E01 | Đạt |
| TH-07 | FR11 | SV | Nộp `file-lon.pdf` (> 10 MB) và `virus.exe` | Backend từ chối, thông báo lý do | U/I `a/T403-documents.test.js` | Đạt |
| TH-08 | FR11 | Đã có bản nộp | Nộp bản mới cùng mốc | Tạo phiên bản 2, bản 1 vẫn còn | I `a/T403-documents.test.js` | Đạt |
| TH-09 | FR11, NFR06 | Hạn mốc đã qua (giờ server) | Nộp bài khi giờ máy khách bị chỉnh lùi | Gắn nhãn "Nộp muộn" theo giờ server | E TC-FR11-E02 | Đạt |
| TH-10 | FR11 | Sản phẩm mã nguồn/video | Nộp bằng link | Lưu link, không đòi upload | I `a/T403-documents.test.js` | Đạt |
| TH-11 | FR24 | SV thành viên | Bấm tải tài liệu | Cấp link hết hạn ~5 phút (attachment); ghi lịch sử tải | I `a/T403-documents.test.js` (TTL 290–300 s); E TC-FR24-E01 | Đạt |
| TH-12 | FR24 | Người ngoài đề tài / ADMIN | Gọi `POST /api/documents/:id/download-url` | 403, không ghi lịch sử | I như trên | Đạt |
| TH-13 | FR12 | GVHD | Nhận xét bản nộp, đánh giá mốc "Đạt"/"Cần bổ sung" | Nhận xét gắn đúng bản nộp; SV nhận thông báo | I `a/T404-feedback.test.js`; E TC-FR12-E03 | Đạt |
| TH-14 | FR22 | Mốc đã Đạt | GVHD mở lại không lý do, rồi có lý do | Không lý do: lỗi; có lý do: mốc về Cần bổ sung | I `a/T606-milestone-reopen.test.js`; E TC-FR22-E01 | Đạt |
| TH-15 | FR38 | GVHD | `/de-tai/:id/kanban` → dùng bàn phím chuyển thẻ Chờ đánh giá → Đạt | Tạo nhận xét có đánh giá trên bản nộp mới nhất; thẻ sang cột Đạt | W `w/dc17.test.jsx`; E TC-FR38-E03 | Đạt |
| TH-16 | FR38 | SV / GV không phải GVHD | Mở Kanban | Chỉ xem, không kéo được | W `w/dc17.test.jsx` | Đạt |
| TH-17 | FR38 | Mất mạng khi kéo thẻ | Kéo thẻ | Thẻ về chỗ cũ, báo lỗi | W `w/dc17.test.jsx` | Đạt |

### 4.7 Đóng đề tài và hội đồng (FR27, FR34–FR37)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| DD-01 | FR27 | Còn mốc bắt buộc chưa Đạt | GVHD gửi đóng | Bị từ chối, nêu điều kiện thiếu | U/I `a/T405-close.test.js` | Đạt |
| DD-02 | FR27 | Mọi mốc bắt buộc Đạt | GVHD nhập kết quả (Xuất sắc/Tốt/Đạt/Không đạt) + nhận xét tổng kết → gửi đóng | Trạng thái Chờ đóng | E TC-FR27-E05 | Đạt |
| DD-03 | FR27 | Chờ đóng | `CB001` trả lại kèm lý do | Về Đang thực hiện | E TC-FR27-E06 | Đạt |
| DD-04 | FR27, FR22 | Chờ đóng, nhưng GVHD vừa mở lại một mốc | `CB001` xác nhận đóng | Bị từ chối (kiểm lại theo đánh giá hiện hành) | U `a/T405-close.test.js` | Đạt |
| DD-05 | FR27, FR08 | Chờ đóng, đủ điều kiện | `CB001` xác nhận đóng | Đã đóng; hồ sơ chỉ đọc; đề tài đạt xuất hiện ở `/kho` (không lộ file, thành viên, nhận xét) | E TC-FR27-E07 | Đạt |
| DD-06 | FR34 | Đang thực hiện | GVHD nhập điểm quá trình 4,99 rồi đề nghị ra hội đồng | Không chuyển Chờ bảo vệ | I `a/DC07-defense.test.js` #2 | Đạt |
| DD-07 | FR34 | Điểm 5,00, mốc Đạt, có báo cáo tổng kết | Đề nghị ra hội đồng | Chuyển Chờ bảo vệ; SV không nộp/sửa được | E TC-FR34-E01 | Đạt |
| DD-08 | FR35 | `CB001` | `/hoi-dong/moi` → lập hội đồng có 2 Chủ tịch / thiếu Thư ký / trùng người | Báo lỗi | I TC-FR35-01..19 | Đạt |
| DD-09 | FR35 | GVHD của đề tài T | Gán T cho hội đồng có GVHD đó là thành viên | Bị chặn (xung đột lợi ích) | I `a/DC08-councils.test.js` | Đạt |
| DD-10 | FR36 | Ủy viên `GV004` | `/cham-bao-ve` → nhập điểm 10,5 / thiếu nhận xét / 8,25 | 10,5 và thiếu nhận xét bị từ chối; 8,25 lưu; trước chốt chỉ thấy điểm của mình | I TC-FR36-01..09; E TC-FR36-E03 | Đạt |
| DD-11 | FR37 | Còn thành viên chưa chấm | Thư ký `GV003` chốt | Bị từ chối | I TC-FR37-04 | Đạt |
| DD-12 | FR37 | Mọi thành viên đã chấm | Chủ tịch và Thư ký chốt cùng lúc | Đúng một thành công; điểm cuối = trung bình làm tròn 2 chữ số; kết quả quy đổi theo thang; sang Chờ đóng; điểm bị khóa | I TC-FR37-01..11; E TC-FR37-E04 | Đạt |

### 4.8 Yêu cầu thay đổi sau duyệt (FR18–FR21, FR23)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| YC-01 | FR18 | Đang thực hiện | Trưởng nhóm đề nghị đổi tên đề tài | FR06 chạy lại; cán bộ duyệt thì áp dụng, từ chối thì giữ nguyên | I `a/T605-topic-change.test.js`; E TC-FR18-E01 | Đạt |
| YC-02 | FR19 | Đang thực hiện, GVHD là GV001 | Đề nghị đổi sang GV007 → GV007 chấp nhận → cán bộ duyệt | GV001 mất mọi quyền (kể cả đọc); bản nộp chờ nhận xét chuyển GV007; nhận xét cũ giữ tên GV001 | I TC-FR19-01..03; E TC-FR19-E01 | Đạt |
| YC-03 | FR20 | Đang thực hiện | Trưởng nhóm đề nghị hủy có lý do → cán bộ quyết định | Đã hủy; đề tài không bị xóa, vẫn có trong thống kê | I TC-FR20-01..04; E TC-FR20-E01 | Đạt |
| YC-04 | FR21 | Trước duyệt | Thành viên rời nhóm | Rời ngay, mất quyền ngay | I `a/T603-leave.test.js` | Đạt |
| YC-05 | FR21 | Sau duyệt, nhóm còn đúng min | Thành viên xin rời | Bị chặn (nhóm dưới min) | I `a/T603-leave.test.js` | Đạt |
| YC-06 | FR21 | Người đã rời | `/lich-su-tham-gia` | Chỉ đọc phiên bản trong khoảng còn là thành viên | E TC-FR21-E01 | Đạt |
| YC-07 | FR23 | Đã đóng | `CB001` sửa kết quả kèm lý do | Tạo phiên bản kết quả mới, giữ bản cũ; thống kê dùng bản hiện hành; nhóm + GVHD được thông báo | I TC-FR23-01..03; E TC-FR23-E01 | Đạt |

### 4.9 Tuyển sinh viên (FR31–FR33)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| TS-01 | FR31 | `GV008`, đợt đang mở | Tạo đề tài, nhập yêu cầu + số SV cần tuyển → `/de-tai/:id/cong-bo` | FR06 chạy; trạng thái Đang tuyển sinh viên; tính vào hạn mức GV | E TC-FR31-E01 | Đạt |
| TS-02 | FR32 | SV cùng khoa | `/tuyen-sinh` → xem bảng tin | Thấy mã, tên, tóm tắt, GV, yêu cầu, số chỗ còn; không thấy danh sách ứng viên | E TC-FR32-E02 | Đạt |
| TS-03 | FR32 | SV | Ứng tuyển 2 lần cùng đề tài; rút đơn chưa xử lý | Lần 2 bị từ chối; rút được | I `a/DC06-applications.test.js` | Đạt |
| TS-04 | FR33 | 1 chỗ còn lại, 2 đơn chờ | GV duyệt 2 đơn đồng thời | Chỉ 1 được duyệt, không vượt chỉ tiêu | I `a/DC06-applications.test.js` #2, #3 | Đạt |
| TS-05 | FR33 | Đủ min thành viên | GV chốt nhóm | Đã có GVHD; người được duyệt đầu tiên là trưởng nhóm; đơn chờ bị từ chối tự động | E TC-FR33-E03, E04 | Đạt |
| TS-06 | FR31 | Đang tuyển | GV ngừng tuyển không lý do / có lý do | Không lý do: lỗi; có lý do: về Nháp, thành viên bị gỡ | I `a/DC05-recruitment.test.js` §3.4 | Đạt |

### 4.10 Thông báo, thống kê, lịch sử (FR13, FR14, FR15, FR29, FR39, FR08)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| TB-01 | FR13 | Có sự kiện (lời mời, kết quả xét duyệt, nhận xét) | Mở chuông / `/thong-bao`, bấm một thông báo | Hiện số chưa đọc; bấm thì đánh dấu đã đọc | E TC-FR13-E04 | Đạt |
| TB-02 | FR13 | Mốc còn 3 ngày | Gọi job nhắc hạn 2 lần | Chỉ một thông báo (chống trùng theo khóa sự kiện + người nhận) | I TC-FR13-D01..D11 | Đạt |
| TB-03 | FR29 | SMTP không cấu hình / máy chủ mail lỗi | Phát sinh thông báo | Thông báo web vẫn ghi, API không lỗi; thử lại tối đa 3 lần, không gửi trùng | I TC-FR29-01..07 | Đạt |
| TK-01 | FR14 | `CB001` | `/thong-ke` → lọc theo lĩnh vực + năm học → Xuất CSV | Biểu đồ, bảng, CSV cùng số; CSV UTF-8 có BOM mở đúng tiếng Việt trong Excel | I TC-FR14-P01..P03, E01, E02; E TC-FR14-E03, E04 | Đạt |
| TK-02 | FR14 | Tên đề tài bắt đầu bằng `=SUM(1+1)` | Xuất CSV | Ô được thoát, không thành công thức | U `a/csv.test.js` | Đạt |
| TK-03 | FR14 | Đăng nhập `GV001` | `/thong-ke` | Chỉ số liệu đề tài GV001 hướng dẫn | I `a/T503-stats.test.js` | Đạt |
| TK-04 | FR39 | `CB001` | Xuất Excel | File .xlsx có sheet "Thống kê" khớp CSV và sheet "Danh sách đề tài" đúng `total` dòng; ô văn bản là chuỗi | I TC-FR39-01..05; E TC-FR39-E04 | Đạt |
| TC-01 | FR08 | Đăng nhập SV | `/de-tai` lọc theo trạng thái, từ khóa | Chỉ thấy đề tài của mình; phân trang ở server | E TC-FR08-E05..E07 | Đạt |
| LS-01 | FR15 | Có thao tác chuyển trạng thái | Xem lịch sử đề tài; thử UPDATE/DELETE bảng lịch sử trực tiếp trên DB | Ghi ai, khi nào, giá trị trước/sau; DB từ chối sửa/xóa | I TC-FR15-01..03 | Đạt |

### 4.11 Toàn vẹn dữ liệu, sao lưu (NFR05, FR26)

| Mã ca | FR | Tiền điều kiện | Các bước | Kết quả mong đợi | Test tự động | KQ |
|---|---|---|---|---|---|---|
| TV-01 | NFR05 | – | Giả lập lỗi DB giữa transaction duyệt đề tài | Rollback toàn bộ, không có trạng thái nửa vời | I TC-NFR05-01..06 | Đạt |
| TV-02 | FR26 | Có file upload không bản ghi nào tham chiếu, cũ hơn 24 h và một file mới hơn 24 h | Chạy job dọn file mồ côi | Chỉ xóa file cũ > 24 h, ghi lịch sử; không đụng tài liệu đã nộp | I TC-FR26-01, -02 | Đạt |
| TV-03 | FR26 | 9 bản sao lưu | Chạy script giữ bản | Giữ 7 bản mới nhất | I TC-FR26-03, -04 | Đạt |

---

## 5. Kịch bản demo trước hội đồng (≈ 20 phút) – đã diễn tập trọn vẹn 2026-11-26

Mọi bước dưới đây đã được chạy thử trên giao diện thật với **dữ liệu seed mới tinh** và cho đúng kết quả ở cột "Phải thấy".
Kịch bản chỉ đúng khi DB vừa seed lại (mục 5.1). Các bước làm thay đổi dữ liệu, nên **diễn tập xong phải seed lại** trước buổi thật.

### 5.1 Chuẩn bị (trước buổi demo 15 phút)

```bash
# Terminal 1 – BE_HTSVNCKH (Git Bash)
npm run db:dev:up
export DATABASE_URL=postgresql://postgres:postgres@localhost:54330/nckh_dev DIRECT_URL=$DATABASE_URL
npx prisma migrate reset --force       # xóa sạch DB dev, áp migration, tự chạy seed – kiểm dòng "Datasource" phải là localhost:54330
node --input-type=module -e "
import { PrismaClient } from '@prisma/client'; const p = new PrismaClient();
const [{ db }] = await p.\$queryRaw\`select current_database() db\`;
if (db !== 'nckh_dev') throw new Error('Không phải DB dev: ' + db);
console.log(await p.user.updateMany({ data: { mustChangePassword: false } })); await p.\$disconnect();"
npm run dev                            # chờ http://localhost:4000/api/health trả {"status":"ok","db":true}

# Terminal 2 – FE_HTSVNCKH
npm run dev                            # http://localhost:5173
```
- Bước `updateMany` bắt buộc: seed bật cờ "phải đổi mật khẩu", bỏ qua thì lần đăng nhập đầu của mọi tài khoản bị đẩy sang `/doi-mat-khau`.
- `npm run demo:people` (tùy chọn) chỉ đổi SV mẫu thứ 21 trở đi và **họ tên** GV001–GV005; mọi tài khoản dùng trong kịch bản vẫn giữ mã.
- Để sẵn 3 file trên Desktop: `bao-cao.pdf` (PDF bất kỳ < 10 MB), `virus.exe` (đổi đuôi một file txt), `tai-khoan.csv` (nội dung ở bước A2).
- Mỗi vai trò một cửa sổ, khỏi đăng xuất. Các cửa sổ ẩn danh **cùng một Chrome** dùng chung cookie → dùng hồ sơ Chrome khác nhau hoặc Chrome + Edge + Firefox.
- Mật khẩu mọi tài khoản: `Nckh@2026-dev`.

| Cửa sổ | Tài khoản | Vai trò trong kịch bản |
|---|---|---|
| 1 | `2374801030016` (SV) | Trưởng nhóm đề tài mới |
| 2 | `2374801040017` (SV) | Thành viên được mời |
| 3 | `GV001` | Giảng viên hướng dẫn |
| 4 | `CB001` | Cán bộ khoa |
| (đổi lần lượt) | `QT001`, `GV002`, `GV003`, `2374802010018` | Quản trị; Chủ tịch, Thư ký hội đồng; SV ứng tuyển |

### 5.2 Phần A – Phân quyền và tài khoản (2 phút)

| Bước | Tài khoản | Thao tác | Phải thấy |
|---|---|---|---|
| A1 | `QT001` | Đăng nhập → gõ URL `/xet-duyet`, rồi `/thong-ke` | Vào `/quan-ly/tai-khoan`; hai URL kia hiện "Bạn không có quyền truy cập trang này" (quản trị không có quyền nghiệp vụ – FR25) |
| A2 | `QT001` | Quản lý tài khoản → Nhập CSV → chọn Khoa CNTT → chọn `tai-khoan.csv` → **Xem trước** | "Hợp lệ: 1 · Lỗi: 2"; dòng 3 `code` "Mã đã tồn tại", dòng 4 `email` "Email không hợp lệ"; chưa ghi DB cho tới khi bấm "Xác nhận tạo 1 tài khoản" (không cần bấm) – FR02 |

Nội dung `tai-khoan.csv` (UTF-8):
```
code,email,fullName,role,classCode
2374801039001,sv9001@nckh.example,Nguyễn Văn Mới,STUDENT,71K29CNTT08
GV001,gv-trung@nckh.example,Trùng Mã Giảng Viên,LECTURER,
2374801039002,email-sai,Lê Thị Sai Email,STUDENT,71K29CNTT08
```

### 5.3 Phần B – Vòng đời một đề tài từ đầu đến cuối (12 phút)

| Bước | Cửa sổ | Thao tác | Phải thấy |
|---|---|---|---|
| B1 | 1 (SV016) | Đề tài của tôi → **Tạo đề tài** → chọn đợt 2026-2027, tên `Tom tat van ban tieng Viet tu dong bang hoc sau` (cố ý gõ không dấu) → Tạo nháp | Toast "Đã tạo đề tài NCKH-2026-0037", vào màn soạn hồ sơ |
| B2 | 1 | Lĩnh vực **Trí tuệ nhân tạo**; dán Tóm tắt (mục 5.5); Mục tiêu `Xây dựng mô hình tóm tắt văn bản tiếng Việt và đánh giá trên bộ dữ liệu tự thu thập.`; từ khóa (Enter sau mỗi từ): `tóm tắt văn bản`, `xử lý ngôn ngữ tự nhiên`, `tiếng Việt` → **Lưu nháp** → **Kiểm tra trước** | "Đủ điều kiện gửi 5/5"; **Nghi trùng cao** với *NCKH-2026-0019 – Tóm tắt văn bản tiếng Việt tự động*: Điểm tên 76%, Điểm nội dung 91%, từ khóa trùng. Hồ sơ đang chờ duyệt của nhóm khác chỉ hiện "Có 1 hồ sơ đang chờ duyệt…", không lộ tên (FR06) |
| B3 | 1 | Trang đề tài → **Quản lý nhóm** → Mã sinh viên `2374801040017` → Mời thành viên | "Lời mời đang chờ: 2374801040017 – Vũ Ngọc Vy" |
| B4 | 2 (SV017) | Menu **Lời mời** → Chấp nhận | Trang đề tài "Nhóm (2/5)" – chấp nhận rồi mới thành thành viên (FR03) |
| B5 | 1 | Trang đề tài → **Gửi đề nghị hướng dẫn** → dòng GV001 bấm **Chọn** → Gửi đề nghị | Danh sách GV kèm "Đã nhận x/5" (hạn mức); trạng thái **Chờ giảng viên hướng dẫn** (FR16) |
| B6 | 3 (GV001) | Đăng nhập (vào thẳng `/de-nghi-huong-dan`) → **Nhận hướng dẫn** → xác nhận | "Bạn đã nhận 3/5 đề tài…"; toast "Đã nhận hướng dẫn" |
| B7 | 1 | F5 trang đề tài → **Gửi xét duyệt**, để trống Giải trình | Màn 4 bước hiện lại Nghi trùng cao; "Giải trình (bắt buộc) 0/50 từ"; nút **Gửi xét duyệt bị khóa** |
| B8 | 1 | Dán Giải trình (mục 5.5) → Gửi xét duyệt | **Chờ xét duyệt**, "lần gửi 1" |
| B9 | 4 (CB001) | Xét duyệt → mở NCKH-2026-0037 | Snapshot, nhóm, GVHD, top 5 trùng lặp và **giải trình của nhóm** |
| B10 | 4 | **Yêu cầu chỉnh sửa** → bấm xác nhận khi chưa nhập lý do → nhập `Đề nghị nhóm làm rõ điểm khác biệt với đề tài NCKH-2026-0019 trong phần tóm tắt.` → xác nhận | Lỗi "Lý do tối thiểu 5 ký tự" trước; sau đó hồ sơ rời hàng chờ (FR07) |
| B11 | 1 | **Sửa hồ sơ** → thêm vào cuối tóm tắt: `Điểm khác biệt so với đề tài NCKH-2026-0019 là nhóm tập trung vào tóm tắt tin tức và dùng bộ dữ liệu tự thu thập.` → Lưu nháp → **Gửi xét duyệt** → nút **Gửi lại sau chỉnh sửa** | "lần gửi 2" |
| B12 | 1 | Gõ URL `/de-tai/<id đang mở>/so-sanh` | So sánh lần 1 ↔ lần 2: Tên "Không đổi", Tóm tắt "Có thay đổi" (FR17) |
| B13 | 4 | Xét duyệt → NCKH-2026-0037 → **Duyệt** → xác nhận | "Duyệt hồ sơ NCKH-2026-0037, lần gửi 2?"; **Đang thực hiện**, hiện tab Mốc, Kanban, Tiến độ |
| B14 | 3 (GV001) | Đề tài → tab **Mốc** → Thêm mốc: tên `Báo cáo tổng quan tài liệu`, đầu ra `File PDF tổng quan`, hạn 15/12/2026 17:00, tick **Mốc bắt buộc** → Lưu | "1. Báo cáo tổng quan tài liệu – Chưa đánh giá – Bắt buộc" (FR09) |
| B15 | 1 | Tab **Tài liệu** → chọn mốc → chọn `virus.exe` → Nộp; rồi chọn `bao-cao.pdf` → Nộp | `.exe`: "Chỉ nhận file PDF, DOCX, PPTX, XLSX"; PDF: "Phiên bản 1 · Giữa kỳ · Mới nhất" (FR11) |
| B16 | 3 | Tab **Kanban** → nhấn **Tab** tới nút "Chuyển Báo cáo tổng quan tài liệu sang…" → **Enter** → chọn **Đạt** → nhận xét `Tổng quan đầy đủ, trích dẫn đúng quy cách.` → Gửi đánh giá | Thẻ chuyển từ "Chờ đánh giá" sang **Đạt (1)**, hoàn toàn bằng bàn phím (FR38, FR12) |
| B17 | 3 | Tab **Thông tin** → khối Kết quả cuối: chọn **Tốt**, nhập nhận xét tổng kết → **Lưu kết quả** → **Đề nghị đóng đề tài** → xác nhận | "Mốc bắt buộc: 1/1 Đạt; kết quả cuối: đã có"; **Chờ đóng** (FR27). Muốn demo điều kiện: bấm Đề nghị đóng *trước* khi Lưu kết quả → báo "Giảng viên hướng dẫn chưa nhập kết quả cuối…" |
| B18 | 4 | Mở đề tài → **Xác nhận đóng đề tài** → xác nhận | **Đã đóng**, "Kết quả: Tốt"; menu **Kho đề tài** có NCKH-2026-0037 (chỉ tên + tóm tắt, không lộ file/thành viên – FR08) |

### 5.4 Phần C – Tính năng bổ sung theo đề cương (5 phút)

| Bước | Tài khoản | Thao tác | Phải thấy |
|---|---|---|---|
| C1 | `GV002` (Chủ tịch) | Chấm bảo vệ → NCKH-2026-0031 → Điểm `10.5`, nhận xét ≥ 10 ký tự → Lưu | "Điểm phải từ 0 đến 10, tối đa 2 chữ số thập phân" |
| C2 | `GV002` | Sửa điểm `8.5` → Lưu | Lưu được |
| C3 | `GV003` (Thư ký) | Chấm bảo vệ → NCKH-2026-0031 → điểm `8` → Lưu | Bảng điểm hội đồng "Đã chấm 3/3" (Ủy viên GV004 chấm sẵn 8,25); "Điểm trung bình tạm tính: 8,25" (FR36) |
| C4 | `GV003` | **Chốt nghiệm thu** → biên bản ≥ 20 ký tự → Tiếp tục → Chốt nghiệm thu | "Kết quả dự kiến: Đạt – Tốt"; cảnh báo khóa điểm; đề tài sang **Chờ đóng** (FR37) |
| C5 | `2374802010018` (SV) | Đề tài tuyển sinh viên → NCKH-2026-0034 → Lời giới thiệu → **Gửi ứng tuyển** | Menu Đơn ứng tuyển: "Đang chờ duyệt" (FR32) |
| C6 | `GV002` | Đề tài NCKH-2026-0034 → **Xem ứng viên** → dòng *Võ Gia Khoa (2374802010018)* **Đồng ý** → **Chốt nhóm** | "Các đơn còn chờ sẽ bị từ chối…"; **Đã có giảng viên hướng dẫn**, Võ Gia Khoa là trưởng nhóm (FR33). **Chỉ Đồng ý dòng 2374802010018** – seed có sẵn đơn của SV016/SV017, đừng duyệt hai bạn này |
| C7 | `CB001` | **Thống kê** → đổi "Thống kê theo"/bộ lọc → **Xuất CSV**, **Xuất Excel** → mở file | Tải `thong-ke-status-<ngày>.csv` và `.xlsx`, tiếng Việt đúng trong Excel (FR14, FR39) |
| C8 | (tùy chọn) | Bấm chuông thông báo; thu trình duyệt về 360 px | Thông báo các sự kiện vừa làm (FR13); không tràn ngang (NFR07) |

### 5.5 Văn bản dán sẵn

**Tóm tắt (B2, 155 từ):**
> Đề tài nghiên cứu bài toán tóm tắt văn bản tiếng Việt tự động bằng xử lý ngôn ngữ tự nhiên và học sâu. Nhóm khảo sát các nghiên cứu liên quan trong và ngoài nước, phân tích yêu cầu của người dùng thực tế tại Khoa Công nghệ Thông tin, sau đó đề xuất kiến trúc giải pháp, lựa chọn công nghệ phù hợp và hiện thực một bản mẫu có thể vận hành. Nhóm xây dựng bộ dữ liệu thử nghiệm gồm các bài báo tiếng Việt, thiết kế kịch bản đánh giá với các chỉ số định lượng rõ ràng như ROUGE, so sánh với một số phương pháp phổ biến hiện nay và phân tích ưu nhược điểm của từng cách tiếp cận. Kết quả dự kiến gồm mã nguồn, báo cáo tổng kết và một bài báo khoa học gửi hội nghị sinh viên nghiên cứu khoa học cấp trường.

**Giải trình (B8, ≥ 50 từ):**
> Đề tài của nhóm có một số từ khóa và phần mô tả phương pháp chung giống đề tài NCKH-2026-0019 vì cùng theo khung đề cương của khoa. Tuy vậy nhóm tập trung vào tóm tắt tin tức tiếng Việt bằng học sâu, tự thu thập bộ dữ liệu bài báo riêng, đánh giá bằng chỉ số ROUGE và kịch bản người dùng riêng. Nhóm cam kết trích dẫn đầy đủ các đề tài liên quan trong báo cáo tổng kết.

### 5.6 Xử lý sự cố khi demo

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Đăng nhập bị đẩy sang `/doi-mat-khau` | Quên bước `updateMany` ở 5.1 | Chạy lại đoạn đó (không cần khởi động lại API) |
| Báo sai mật khẩu / tài khoản bị tạm khóa | Gõ sai nhiều lần, hoặc lần diễn tập trước đã đổi mật khẩu | Seed lại theo 5.1 |
| Mã đề tài mới không phải NCKH-2026-0037, hoặc B1 báo vượt số đề tài | DB chưa seed lại sau lần diễn tập | Seed lại theo 5.1 |
| Đăng nhập cửa sổ này thì cửa sổ kia đổi người | Hai cửa sổ dùng chung cookie | Dùng hồ sơ/trình duyệt khác nhau cho từng vai trò |
| Mọi đăng nhập lỗi dù API báo chạy | Cổng 4000 còn API cũ trỏ DB khác | Tắt tiến trình cũ ở cổng 4000, chạy lại `npm run dev` |

**Bằng chứng tự động hóa:** chiếu ảnh chụp kết quả `npm test` của hai repo và `npm run test:e2e` ở `FE_HTSVNCKH` (100/100, mất ~6 phút nên không chạy trực tiếp) – số liệu ở mục 7.

---

## 6. Kiểm thử phi chức năng

| NFR | Ca kiểm thử | Cách kiểm | Kết quả |
|---|---|---|---|
| NFR01 | Mật khẩu băm Argon2id; rate limit đăng nhập; cookie refresh `httpOnly`, `SameSite=Lax`; thời gian phản hồi không lộ tài khoản tồn tại | I/S `a/auth.test.js`, `a/security/T703c-bao-mat.test.js` (T703c-2), `T703a-bao-mat.test.js` (T703a-2), `T199-rate-limit.test.js` | Đạt (cookie trên Chrome/Safari thật: sau deploy) |
| NFR02 | 403 cho từng vai trò; CORS chỉ domain cấu hình; không stack trace; Zod cả hai phía | S `T703c-bao-mat.test.js` (T703c-1, -3), `T215-bao-mat.test.js` | Đạt |
| NFR03 | RLS không policy, không hàm SECURITY DEFINER | S `T703c-bao-mat.test.js` (T703c-4) | Đạt trên Postgres test (Supabase thật: sau deploy) |
| NFR04 | p95 với 2.000 đề tài | P `a/perf/T704.perf.js` | Danh sách ≤ 31 ms (ngưỡng 1 s); thống kê ≤ 11 ms (2 s); FR06 248 ms (3 s) – máy dev |
| NFR05 | Rollback khi lỗi giữa transaction; bảng lịch sử chỉ thêm | I TC-NFR05-01..06, `a/T203-schema.test.js` | Đạt |
| NFR06 | Hạn tính theo giờ server, giờ máy khách bị chỉnh | I TC-NFR06-01..07 | Đạt |
| NFR07 | Không tràn ngang ở 360 px; lỗi tại từng trường | E TC-NFR07-E01, TC-FR05-E08, TC-FR11-E08 (Playwright 2 viewport) | Đạt |
| NFR08 | Log có request id; `/api/health`; Swagger tắt ở production; DB test tách khỏi dev | I TC-NFR08-01..06, S T703a-3, T703a-5 | Đạt |
| NFR09 | Lint, CI, độ phủ ≥ 70% | `npm run lint`, `npm run test:coverage` | api lines 95,25%; shared lines 95,95% |
| NFR10 | Rewrite SPA, pooler, làm nóng Render | Chỉ kiểm cấu hình mức đơn vị (`a/T706b.test.js`) | Sau deploy |

---

## 7. Kết quả tổng hợp (lần chạy 2026-11-20, hai lượt cùng kết quả)

| Lệnh | Kết quả |
|---|---|
| `npm ci`, `npm run lint`, `npm run build -w @nckh/web` | exit 0 |
| `npm test` | shared 115 · api 1.227 · web 384 – **tất cả đạt** |
| `npm run test:coverage` | api lines 95,25% · shared lines 95,95% (ngưỡng 70%) |
| `npm run test:e2e -w @nckh/web` | **100/100 đạt** (desktop 1280 px + mobile 360 px, ~6,3 phút) |
| `npm run eval:fr06 -w @nckh/api` (122 cặp) | Cần xem xét: P 92,9% · R 92,9%; Nghi trùng cao: P 100% · R 92,9% |

Tổng: **~1.726 test tự động + 100 ca E2E**, phủ đủ FR01–FR39 (mọi FR có mã `TC-FRxx`, xem `docs/agents/TRUY_VET.md`).

**Chạy lại trước buổi bảo vệ** (để số liệu là của ngày trình bày):
```bash
docker compose -f docker-compose.test.yml up -d
npm run lint && npm test && npm run test:e2e -w @nckh/web
```

## 8. Hạn chế và việc kiểm sau deploy

1. Chỉ kiểm được trên hạ tầng thật: cookie trên Chrome/Safari (NFR01), Data API bằng anon key bị từ chối (NFR03), p95 trên Render + Supabase (NFR04), rewrite SPA và pooler (NFR10), chạy thật workflow sao lưu + biên bản diễn tập khôi phục (FR26), cron nhắc hạn (FR13). Checklist: `docs/VAN_HANH.md` §6.4.
2. FR29 (email) và FR28 (Google) không có E2E vì cần SMTP/OAuth thật; đã kiểm bằng integration với giả lập.
3. Kanban kéo thả bằng chuột chỉ kiểm ở test component; E2E kiểm bằng bàn phím.
4. FR06: TF-IDF không phát hiện hai đề tài diễn đạt hoàn toàn khác từ ngữ (4 cặp bỏ sót); bộ 122 cặp do một người soạn và gán nhãn nên recall có thể lạc quan. Hướng phát triển: embedding ngữ nghĩa.
5. Số đo hiệu năng là trên máy dev (DB cùng máy) – mức sàn, không thay cho số đo thật.
