# Quy trình phối hợp giữa các agent

## Vai trò

| Agent | Làm | Không làm |
|---|---|---|
| `kien-truc-su` | Hợp đồng API, thiết kế màn hình, quyết định kỹ thuật, review thiết kế | Viết code tính năng |
| `backend-dev` | API, Prisma, service, test unit + integration backend | Sửa UI |
| `frontend-dev` | React UI, gọi API, test component, E2E cho màn của mình | Đổi hợp đồng API khi chưa duyệt |
| `kiem-thu` | Hạ tầng test, test integration/E2E độc lập, báo lỗi | Sửa code sản phẩm |
| `reviewer` | Review code + báo cáo md của mọi agent, tự chạy lại test | Viết code tính năng |
| `bao-mat` | Review bảo mật task có auth/quyền/file/dữ liệu cá nhân | Viết code tính năng |
| `devops` | CI, docker test, cấu hình deploy, sao lưu, tài liệu chạy | Deploy thật |

Phiên Claude Code chính là **điều phối viên** (lệnh `/dieu-phoi`). Subagent không gọi được subagent khác, nên chỉ điều phối viên giao việc.

## Vòng đời một task

```
TODO → DOING → REVIEW → (CHANGES → DOING → REVIEW)* → DONE
                       ↘ BLOCKED (cần con người)
```

1. **Nhận việc**: điều phối viên chọn task có mọi phụ thuộc ở DONE, đổi trạng thái DOING, gọi agent chủ trì.
2. **Thực hiện**: agent đọc CLAUDE.md, đặc tả phần FR liên quan, báo cáo của các task phụ thuộc. Làm, viết test, chạy test.
3. **Báo cáo**: ghi `docs/agents/reports/TASK-xxx.md` theo mẫu dưới. Đổi trạng thái REVIEW.
4. **Review chéo**: điều phối viên gọi **mọi reviewer** ghi trong cột Review của task. Mỗi reviewer ghi file review riêng.
5. **Kết luận**:
   - Tất cả APPROVED → DONE, ghi ngày.
   - Có CHANGES_REQUESTED → CHANGES; gọi lại agent chủ trì với danh sách vấn đề. Agent sửa, bổ sung mục "Vòng sửa n" vào báo cáo, quay lại bước 4.
   - Sau **3 vòng** vẫn chưa đạt, hoặc cần quyết định của con người → BLOCKED, ghi câu hỏi vào `docs/agents/CAU_HOI.md`.
6. **Hồi quy**: sau mỗi task DONE, chạy `npm test`. Đỏ → mở task sửa lỗi `BUG-xxx` ưu tiên cao nhất.

## Chế độ tiết kiệm quota (người dùng chọn 2026-11-02, áp dụng từ T302 trở đi, ghi đè bước 4–5)
- Mỗi task **một reviewer**: `bao-mat` nếu cột Review có BM (auth, quyền, upload, dữ liệu cá nhân, CSV), ngược lại `reviewer`. Bỏ review của FE/BE/KTS/QA.
- Tối đa **2 vòng** sửa; vòng 2 vẫn chưa đạt → BLOCKED.
- MINOR không chặn DONE: agent chủ trì sửa luôn nếu nhỏ, còn lại ghi vào task sau.
- Agent làm và `reviewer` chạy model Sonnet; `bao-mat` giữ model mặc định.
- Có thể gộp các task liền nhau cùng agent chủ trì và cùng file vào một lượt (một báo cáo ghi rõ các ID).
- Giữ nguyên: test bắt buộc, bằng chứng chạy lệnh, hồi quy `npm test` sau mỗi task, `/kiem-tra-cuoi`.
- Chỉ chạy **một agent tại một thời điểm** (người dùng yêu cầu 2026-11-03), không giao song song.
- Chạy song song: mỗi agent dùng DB riêng `nckh_<task>_test` trên server test (đặt `DATABASE_URL`/`DIRECT_URL` rồi `npm run db:test:reset`), không dùng chung `nckh_test` – dùng chung gây đỏ ngẫu nhiên (`reports/T211.md`).

## Mức độ vấn đề trong review
- **BLOCKER**: sai đặc tả, lỗ hổng bảo mật, mất dữ liệu, test đỏ, test bị làm yếu. Bắt buộc sửa.
- **MAJOR**: thiếu điều kiện đạt, thiếu test cho nhánh quan trọng, lỗi tiềm ẩn đồng thời. Bắt buộc sửa.
- **MINOR**: đặt tên, trùng lặp nhỏ, văn phong. Sửa hoặc ghi lý do không sửa.

## Mẫu báo cáo task – `reports/TASK-xxx.md`

```markdown
# TASK-xxx – <tên>
- Agent: <tên> · Trạng thái: REVIEW · Ngày: YYYY-MM-DD
- FR/NFR: ...  · Phụ thuộc đã đọc: TASK-..., TASK-...

## Đã làm
<3–8 dòng>

## File thay đổi
| File | Thay đổi |

## Quyết định thiết kế
<quyết định + lý do; lệch đặc tả thì ghi rõ>

## Điều kiện đạt ↔ test
| Điều kiện đạt (trích đặc tả) | Test case | Kết quả |

## Bằng chứng chạy lệnh
<lệnh đã chạy + 5–15 dòng kết quả cuối, nguyên văn>

## Còn lại / rủi ro
## Câu hỏi cho reviewer
## Vòng sửa n (nếu có)
<vấn đề → cách sửa → bằng chứng>
```

## Mẫu review – `reviews/TASK-xxx-<agent>-v<n>.md`

```markdown
# Review TASK-xxx – <agent> – vòng n
Kết luận: APPROVED | CHANGES_REQUESTED

## Tôi đã tự kiểm tra
<lệnh đã tự chạy lại + kết quả; file đã đọc>

## Đối chiếu đặc tả
| Điều kiện đạt | Đạt? | Ghi chú |

## Vấn đề
| # | Mức | File:dòng | Mô tả | Đề xuất |
```

Reviewer **không tin báo cáo**: phải tự chạy lại test và đọc code. Báo cáo ghi "đạt" mà lệnh tự chạy cho kết quả khác → BLOCKER.

## Định nghĩa HOÀN THÀNH dự án
Chỉ tuyên bố hoàn thành khi `/kiem-tra-cuoi` đạt mọi mục:
1. Mọi task trong bảng ở DONE (không còn TODO/DOING/REVIEW/CHANGES; BLOCKED phải được con người chấp nhận).
2. `npm run lint`, `npm test`, `npm run build -w @nckh/web`, `npm run test:e2e -w @nckh/web` đều thành công, chạy 2 lần liên tiếp (chống test chập chờn).
3. Độ phủ unit ≥ 70% ở module nghiệp vụ (NFR09).
4. Ma trận truy vết `docs/agents/TRUY_VET.md`: mỗi FR P1/P2 có ít nhất 1 test tự động đạt.
5. `reviewer` và `bao-mat` APPROVED cho lượt review toàn dự án.
