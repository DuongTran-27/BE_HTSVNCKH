# TASK-FR06-PGTRGM – Đo FR06 với pg_trgm thật

Mục tiêu: gỡ hạn chế 1 của báo cáo khoa học (TRUY_VET §5): điểm tên trong phép đo FR06 trước đây là trigram mô phỏng bằng JS, không phải `similarity()` của PostgreSQL.

## Làm gì
- `tests/fr06-eval/lib.js`: `scorePair(p, titleScore?)` / `scoreAll(titleScores?)` nhận điểm tên tính sẵn (engine đã hỗ trợ `titleScore` từ DB như `prismaRepo.loadCorpus`); không truyền thì như cũ.
- `tests/fr06-pgtrgm.test.js` (TC-FR06-95): với từng cặp gọi `SELECT similarity(lower(immutable_unaccent(B)), lower(immutable_unaccent(A)))` trên DB test (chỉ gọi hàm, không đọc/ghi bảng), chạy engine với điểm đó, in so sánh JS vs pg và assert recall REVIEW+ ≥ 80%.
- Kiểm chứng phép đo không "giả xanh": ép `titleScore=0.777` thì engine trả 0.777; 106/122 cặp có điểm tên trung gian (0,05–0,95), ví dụ P009 pg 0.7959 / JS 0.796, P018 pg 0.4310 / JS 0.431.

## Kết quả (122 cặp)
```
Chênh điểm tên |pg − JS|: trung bình 0.000, lớn nhất 0.000; số cặp đổi mức: 0
JS  REVIEW+: TP=52 FP=4 FN=4 TN=62 P=92.9% R=92.9%
pg  REVIEW+: TP=52 FP=4 FN=4 TN=62 P=92.9% R=92.9%
JS  HIGH   : TP=52 FP=0 FN=4 TN=66 P=100.0% R=92.9%
pg  HIGH   : TP=52 FP=0 FN=4 TN=66 P=100.0% R=92.9%
```
Kết luận: số liệu `reports/T705.md` đúng cả khi dùng pg_trgm thật. Hạn chế còn lại cho báo cáo: bộ dữ liệu một người gán nhãn (§5 mục 2), kết luận ngưỡng sơ bộ (mục 3), TF-IDF không bắt diễn đạt khác hoàn toàn (mục 4).

## Bằng chứng
```
npx vitest run tests/fr06-pgtrgm.test.js --disableConsoleIntercept → Tests 1 passed (in số liệu trên)
npx vitest run tests/fr06-dataset.test.js                          → Tests 5 passed
```
