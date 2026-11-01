# Review T301 – kien-truc-su – vòng 1
Kết luận: APPROVED

Phạm vi: chỉ duyệt đề xuất thư viện/phiên bản (quy tắc CLAUDE.md "đổi/thêm thư viện → kien-truc-su duyệt") và các quyết định lệch `design/UI.md`. Không review toàn bộ code (việc của reviewer).

## Tôi đã tự kiểm tra
Không có shell nên **không tự chạy lại** `npm test`, `npm audit`, `npm ls vite`. Chỉ đối chiếu bằng đọc file:
- `docs/agents/reports/T301.md` (quyết định 1–12), `docs/agents/reports/T216.md`, `apps/web/package.json`, `package.json` gốc.
- `package-lock.json`: `node_modules/vite` chỉ còn **một** mục, `8.3.4`, engines `^20.19.0 || >=22.12.0`. Peer của `vitest@4.1.12` và `@vitest/mocker@4.1.12` là `vite ^6 || ^7 || ^8`, của `@vitejs/plugin-react` là `^8.0.0`, nên 8.3.4 thỏa mãn tất cả. Có `jsdom@29.1.1`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `react-router@8.4.0`.
- `apps/web/src/lib/useCooldown.js` và nhánh refresh trong `apps/web/src/lib/api.js` (`doRefresh`: 401/403 → `false`, các mã khác lỗi thì ném `ApiError`; `expireSession` có chốt một lần).
- `design/UI.md` §1.1, §6, §7, §9.1.

Reviewer phải tự chạy lại `npm ls vite`, `npm audit` và `npm test` (QUY_TRINH).

## Đối chiếu từng điểm
| # | Điểm | Quyết định | Ghi chú |
|---|---|---|---|
| 1 | Hạ vite 8.3.5 → 8.3.4 toàn repo | **Chấp nhận** | Luật ≥ 14 ngày đã dùng ở QD_DB_TEST §4.1 và SPIKE_EMBEDDED_PG. Áp dụng cho dependency mới của T301 là nhất quán. Ảnh hưởng T216 là không đáng kể: T216 chỉ cần vite > 6.4.3 (advisory high) và vitest ≥ 4.1.12, cả hai vẫn đạt. Lockfile còn một bản vite, peer hợp lệ. Báo cáo ghi `npm audit` 0 lỗ hổng. Điều kiện: nếu sau này có advisory cho vite ≤ 8.3.4 thì bản vá được ưu tiên hơn luật 14 ngày (xem #I1). |
| 2 | jsdom 29.1.1 thay 30.x | **Chấp nhận** | jsdom 30 đòi node `^24.15`, máy dev là 24.12, nên dùng 30 sẽ báo EBADENGINE. jsdom chỉ là devDependency cho môi trường test, bản 29 đủ dùng cho `renderHook` và test component. Khi CI/Node được nâng (T202) có thể xét lại; không bắt buộc. |
| 3 | Thêm devDeps `@testing-library/react`, `@testing-library/dom`, `jsdom` | **Duyệt** | Đây không phải công cụ test mới. Chúng là môi trường DOM và tiện ích render để **Vitest** test component React, nằm trong danh sách "Vitest, Supertest, Playwright". Không có thư viện runtime nào ngoài danh sách. Phiên bản ghim chính xác, đều ≥ 14 ngày. `@testing-library/dom` là peer bắt buộc của `@testing-library/react` 16, nên phải khai báo tường minh. Không cần thêm `@testing-library/jest-dom` hay `user-event`; nếu T302+ muốn dùng thì đề xuất riêng. |
| 4 | `useCooldown()` + `start(retryAfter)` thay `useCooldown(retryAfter)` | **Chấp nhận; đã sửa UI §7** | Lý do đúng: nếu dùng tham số, hai lần 429 liên tiếp với cùng `Retry-After` sẽ không chạy lại effect. Chữ ký mới mang tính mệnh lệnh nên khớp với `onError` của mutation. Có test cho trường hợp khóa lần 2. Đã cập nhật `design/UI.md` §7 với chữ ký, cách dùng và lý do. §9.1 chỉ ghi tên hook nên giữ nguyên. |
| 5 | Refresh lỗi mạng/5xx không đăng xuất | **Chấp nhận; đã sửa UI §1.1** | UI §1.1 cũ viết "Refresh thất bại → đăng xuất" mà không phân biệt nguyên nhân. Cách tách của T301 hợp lý hơn với NFR10 (Render ngủ): chỉ 401/403 nghĩa là phiên không còn hợp lệ. Code cũng xử lý 429 của refresh như lỗi tạm thời (không đăng xuất), điều này đúng. Không ảnh hưởng bảo mật vì quyền vẫn do backend kiểm (FR25), client chỉ giữ token cũ trong bộ nhớ. Đã cập nhật UI §1.1 (dòng khởi động và mục refresh thất bại). |
| 6 | react-router 8.4.0 yêu cầu node ≥ 22.22 | **Chấp nhận, ghi chú cho T202/T706** | Chỉ ảnh hưởng build/test. Repo chưa có `.nvmrc`, `engines` hay workflow CI. T202 (CI) và T706 (Vercel/Render) phải chọn Node ≥ 22.22, khuyến nghị 24.x cho khớp máy dev. Xem #I2. |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|---|
| I1 | INFO | `package-lock.json:4302` | Luật ≥ 14 ngày có thể mâu thuẫn với bản vá bảo mật mới. | Khi `npm audit` báo advisory, bản vá thắng luật 14 ngày. Ghi lý do trong báo cáo task nâng cấp. |
| I2 | INFO | `package.json` (gốc) | Chưa ghim phiên bản Node cho dự án, trong khi react-router 8.4 cần ≥ 22.22, vite cần ≥ 22.12 và jsdom 29 chạy được trên 24.12. | T202 thêm `.nvmrc`/`engines` (ví dụ `>=22.22`) và đặt `node-version` trong CI. T706 đặt Node tương ứng cho Vercel. Không chặn T301. |
| I3 | INFO | `docs/agents/design/UI.md` §1.1, §7 | Kiến trúc sư đã sửa theo quyết định T301 #4 và #5. | Không cần frontend-dev làm gì thêm. T302+ dùng `cd.start(err.retryAfter)`. |

Kết luận: APPROVED – 0 BLOCKER, 0 MAJOR, 0 MINOR, 3 INFO.
