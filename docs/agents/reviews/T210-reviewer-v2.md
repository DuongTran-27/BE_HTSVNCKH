# T210 – Review vòng 2 (reviewer)
Tự chạy: `npx vitest run tests/T210-advisor.test.js` -> 21/21; `npm run lint` xanh (full suite theo báo cáo của agent, không chạy lại).

- MAJOR 1: ĐÃ SỬA. `API_GD2.md` §8.1 ghi rõ `DECLINE_ADVISING` trả `{ topic: { id, code, status, version } }` kèm lý do; §6 ghi ẩn thông tin ở danh sách. Test `T210-advisor.test.js:225` dùng `toEqual` đúng hình dạng (không có `title/summary`).
- MINOR 1: ĐÃ SỬA. `advisorService.js:36-41` khóa User cả GV cùng SV (một câu, `ORDER BY id`) rồi kiểm lại vai trò/khóa/khoa của GV trong tx.
- MINOR 2: ĐÃ SỬA. Với GV, đề nghị DECLINED/WITHDRAWN chỉ trả `topic.{id, code, round}`; test `:228` `toEqual`.

Không còn vấn đề.

Kết luận: APPROVED (BLOCKER 0, MAJOR 0, MINOR 0)
