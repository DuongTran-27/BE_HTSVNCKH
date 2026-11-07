# T705 – Review v1 (reviewer)

Kết luận: **APPROVED** (không BLOCKER/MAJOR; 3 MINOR không chặn).

## Bằng chứng tự chạy
- `npm run eval:fr06 -w @nckh/api`: 122 cặp (56/66); REVIEW+ TP52 FP4 FN4 TN62 P=92,9% R=92,9%; HIGH TP52 FP0 FN4 – khớp báo cáo.
- `npm run lint`: sạch. `npm test`: shared 73, api 932 (63 file), web 220 – xanh, khớp báo cáo.

## Đối chiếu
- Dataset: 122 cặp >= 100, cân bằng, 10 nhóm kind, đủ ca khó (không dấu, đồng nghĩa, đổi thứ tự, diễn đạt lại, lỗi gõ, cùng lĩnh vực, trùng từ khóa khác bài toán, khác từ ngữ hoàn toàn).
- Lấy mẫu 14 cặp (P004, P016, P029, P041, P053, P055, P061, P071, P081, P093, P100, P106, P116, P122): nhãn hợp lý, note khớp nội dung. Nhãn 1 là theo cấu tạo, đã tự thừa nhận (lạc quan, một người gán).
- `lib.js` gọi `compare()` thật của engine với kho nền = các đề tài gốc còn lại (IDF thực tế); công thức precision/recall/F1 đúng (quy ước precision=1 khi không dự đoán dương, có ghi chú). Ngưỡng lấy từ `DEFAULT_ROUND_CONFIG.similarity`, không hard-code.
- Test TC-FR06-90..93 có assert thật (số lượng, id duy nhất, nhãn, cân bằng, tham chiếu, nhóm ca khó, điểm trong [0,1], tất định). Không có skip/only.
- `package.json` chỉ thêm script `eval:fr06`: chấp nhận.
- `synonyms.json` hiện khớp 10/10 với `SYNONYMS` trong `prisma/seed.js:29`.

## MINOR
1. `apps/api/tests/fr06-eval/synonyms.json`: bản sao tay, dễ lệch. `seed.js` không export `SYNONYMS` nên đề xuất rẻ nhất: thêm 1 test đọc `prisma/seed.js` bằng regex/so khớp chuỗi từng cặp, hoặc export `SYNONYMS` từ seed rồi import. Hiện chỉ có ghi chú trong báo cáo.
2. `fr06-dataset.test.js` TC-FR06-93 không assert `level` thuộc {NONE, REVIEW, HIGH} và không có ngưỡng chất lượng tối thiểu (vd recall >= 80% ở REVIEW+). Có thể thêm 1 assert hồi quy recall để đặc tả "recall >= 80%" thành test; hiện chỉ in ra khi chạy tay.
3. Hạn chế điểm tên (trigram JS thay `similarity()` của pg_trgm) đã ghi trong báo cáo và đầu `run.js`, đủ cho T705; nên lặp lại một câu trong phần hạn chế của báo cáo khoa học (T7xx). Kết luận "giữ ngưỡng" vì vậy là sơ bộ, chưa đo trên pg_trgm thật.

Không phát hiện vấn đề về quyền/transaction (không áp dụng; tooling thuần JS, không động tới code engine).
