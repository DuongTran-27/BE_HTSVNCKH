# T307 – Review v1 (reviewer)
Kết luận: APPROVED (không BLOCKER/MAJOR)

## Lệnh tự chạy (2026-11-03)
- `npm run lint` -> sạch
- `npm test -w @nckh/web` -> 16 file, 130 test passed (khớp báo cáo; diff.test.js bản cuối xanh, 3 test, không skip/only)
- `npm run build -w @nckh/web` -> built, index 392 kB

## Đối chiếu
- Body quyết định `{action, version, submissionId: submission.id, reason?}`: ReviewActions.jsx:27-29. Đúng.
- Lý do bắt buộc: ReasonDialog + reasonSchema, test "không gọi API khi rỗng". Đạt.
- STALE_SUBMISSION / CONCURRENT_UPDATE / INVALID_TRANSITION: đóng hộp, toast tiếng Việt, invalidate (ReviewActions.jsx:31-36, 46, 52). Đạt.
- Nút chỉ hiện theo `availableActions` và khi chưa có decision (ReviewActions.jsx:61). Quyền vẫn do backend.
- FR06: SimilarityPanel/SimilarityBadge coi ERROR hoặc level null là "Chưa kiểm tra được", không bao giờ "Không trùng"; có giải trình, top 5, cờ isStale. Đạt.
- Diff theo từ (diff.js) đúng với 3 test; các trường title/summary/objectives/field/keywords hiển thị đúng; `<ins>/<del>` có ngữ nghĩa, kèm nhãn "Có thay đổi" nên không chỉ dựa vào màu.
- Tiếng Việt, a11y cơ bản (aria-label, role group/note, min-h-11) đạt.

## MINOR (không chặn)
1. ReviewQueuePage.jsx:60 – `SimilarityBadge similarity={{ level: null }}` hiển thị "Chưa kiểm tra được" cả khi thật sự chưa kiểm tra; chấp nhận được (an toàn hơn), nhưng có thể phân biệt khi API có status.
2. ReviewPage.jsx:109-111 – `useSubmission(id, seq - 1, seq > 1)` khi seq undefined cho `NaN` trong queryKey (bị `enabled=false` chặn, vô hại); nên truyền `seq ? seq - 1 : undefined`.
3. diff.js:90-92 – token "same" lấy khoảng trắng của bản cũ; hiển thị bên "mới" có thể lệch khoảng trắng nhỏ. Không ảnh hưởng nội dung.
4. SubmissionDiffPage.jsx:233-234 – hai cột Cũ/Mới chỉ là chữ ở lg; trên mobile xếp dọc, thiếu nhãn "Cũ/Mới" trước mỗi khối diff. Nên thêm.
5. Chưa kiểm 360 px thật và chưa E2E (đã nêu trong báo cáo, thuộc T309).
