# Đặc tả yêu cầu – Hệ thống quản lý NCKH sinh viên Khoa CNTT

Oct 30, 2026 · @Trần Phước Đường

## 1. Phạm vi, mục tiêu và quy ước

Hệ thống triển khai và kiểm thử cho **Khoa Công nghệ thông tin**. Dữ liệu và phân quyền vẫn thiết kế theo đơn vị (khoa) để có thể mở rộng sau này mà không phải đổi schema. Kết quả cuối của đề tài do **giảng viên hướng dẫn đánh giá**, **cán bộ khoa xác nhận đóng**. Hội đồng chấm điện tử nằm ngoài phạm vi phiên bản này.

Mọi điều kiện đạt trong tài liệu là **tiêu chí nghiệm thu cần thực hiện**, chưa phải kết quả đã kiểm thử.

| Mã | Mục tiêu |
| --- | --- |
| M1 | Theo dõi danh sách đề tài, giảng viên hướng dẫn, nhóm sinh viên thực hiện |
| M2 | Quản lý tiến độ thực hiện và nhận xét, đánh giá của giảng viên |
| M3 | Lưu trữ tài liệu, báo cáo, file đính kèm của từng đề tài theo giai đoạn |
| M4 | Thống kê số lượng đề tài theo giảng viên, lĩnh vực, trạng thái, kết quả |
| M5 | Phát hiện và cảnh báo trùng tên hoặc trùng nội dung khi đăng ký mới |
| NT | Nền tảng: xác thực, phân quyền, danh mục, vận hành (phục vụ mọi mục tiêu) |

**Mức ưu tiên**

- **P1 – Bắt buộc:** thiếu thì luồng chính đăng ký → thực hiện → đóng đề tài không chạy được. Phải xong và kiểm thử trước khi làm P2.
- **P2 – Nên có:** luồng ngoại lệ thường gặp; làm sau khi P1 ổn định.
- **P3 – Có thể dời:** luồng ngoại lệ hiếm hoặc phụ thuộc hạ tầng trả phí; đưa vào hướng phát triển nếu thiếu thời gian.

**Thuật ngữ**

- **Cán bộ khoa:** người được cấp quyền quản lý NCKH của một khoa (Ban chủ nhiệm hoặc thư ký khoa).
- **Đề tài hoạt động:** đề tài ở bất kỳ trạng thái nào trừ Nháp, Bị từ chối, Đã hủy, Đã đóng.
- **Snapshot:** bản sao bất biến của hồ sơ tại thời điểm gửi; không sửa, không xóa.
- **Giờ server:** mọi mốc thời gian lưu dạng `timestamptz`, hiển thị theo `Asia/Ho_Chi_Minh`.

## 2. Yêu cầu chức năng

Bộ yêu cầu gồm 27 chức năng: 20 ở mức P1, 5 ở P2, 2 ở P3. FR01–FR15 giữ ý nghĩa core; FR16–FR26 là các bổ sung đã cụ thể hóa; FR27 là yêu cầu mới cho bước đóng đề tài. Chữ in đậm trong cột điều kiện là phần đã sửa hoặc thêm so với bản trước.

| Mã | Chức năng | Mục tiêu | Ưu tiên | Điều kiện đạt chính |
| --- | --- | --- | --- | --- |
| FR01 | Đăng nhập, đăng xuất, đổi mật khẩu, làm mới phiên | NT | P1 | **Access token sống ≤ 15 phút; refresh token xoay vòng, lưu bản băm.** Tài khoản bị khóa thì mọi phiên bị từ chối ở lần gọi kế tiếp. Logout thu hồi phiên hiện tại; **đổi mật khẩu thu hồi các phiên khác; tạm khóa sau 5 lần sai liên tiếp.** |
| FR02 | Quản lý tài khoản, nhập CSV, reset mật khẩu | NT | P1 | Mã và email không trùng. **Nhập CSV có bước xem trước,** báo lỗi theo dòng, chỉ ghi khi người dùng xác nhận. **Không có tự đăng ký.** Không ai tự nâng quyền. **Sau reset phải đổi mật khẩu ở lần đăng nhập đầu.** |
| FR03 | Nhóm, thành viên, trưởng nhóm | M1 | P1 | Lời mời được chấp nhận mới thành thành viên. **Số thành viên nằm trong khoảng min–max của đợt; mỗi sinh viên tối đa N đề tài hoạt động mỗi đợt (mặc định 1).** **Mỗi nhóm có đúng một trưởng nhóm; chỉ trưởng nhóm gửi hồ sơ.** |
| FR04 | Danh mục: khoa, ngành, lớp, lĩnh vực, đợt | NT | P1 | **Danh mục đang được tham chiếu chỉ được ngừng dùng, không xóa.** **Các mốc của đợt đúng thứ tự: mở đăng ký < đóng đăng ký < hạn xét duyệt < hạn kết thúc.** Tham số min ≤ max. |
| FR05 | Hồ sơ đề tài | M1, M5 | P1 | Lưu nháp; **chỉ sửa khi ở Nháp hoặc Cần chỉnh sửa.** **Trước khi gửi bắt buộc: tên, tóm tắt ≥ 100 từ, mục tiêu, 3–5 từ khóa, lĩnh vực.** **Mã đề tài sinh duy nhất, an toàn khi nhiều người gửi cùng lúc.** **Chỉ gửi được trong thời gian mở đăng ký.** |
| FR06 | Kiểm tra tương tự | M5 | P1 | **Đặc tả đầy đủ ở mục 3.** Top 5 kèm điểm tên và điểm nội dung riêng. **Chỉ cảnh báo, không chặn; vượt ngưỡng cao phải giải trình.** Lỗi không được coi là không tương tự. **Lưu kết quả kèm phiên bản thuật toán, ngưỡng và nội dung đã so.** |
| FR07 | Xét duyệt | M1 | P1 | Chỉ cán bộ của khoa chứa đề tài. **Quyết định gắn với đúng snapshot (FR17).** Yêu cầu chỉnh sửa và từ chối bắt buộc lý do. **Màn hình xét duyệt hiển thị kết quả FR06 và giải trình.** Lưu người xử lý, thời điểm. |
| FR08 | Tra cứu và danh sách | M1 | P1 | **Lọc theo đợt, năm học, lĩnh vực, GVHD, trạng thái, kết quả, từ khóa;** phân trang ở server. **Mỗi vai trò chỉ thấy đề tài trong phạm vi của mình.** Kho chung **chỉ gồm đề tài đã đóng đạt,** hiện mã, tên, tóm tắt, lĩnh vực, năm, kết quả; không lộ file, thành viên, nhận xét. |
| FR09 | Mốc thực hiện | M2 | P1 | Mỗi mốc có tên, đầu ra yêu cầu, hạn, cờ bắt buộc. **Chỉ GVHD hoặc cán bộ tạo và sửa mốc.** Đổi hạn lưu lịch sử **(hạn cũ, hạn mới, lý do, người đổi).** |
| FR10 | Cập nhật tiến độ | M2 | P1 | Lưu tác giả, thời điểm, việc đã làm, khó khăn, kế hoạch tới. % hoàn thành **0–100,** hiển thị rõ là tự khai. **Không sửa được sau khi GVHD đã nhận xét.** |
| FR11 | Upload và nộp báo cáo | M3 | P1 | **Chỉ cho nộp khi file đã tải lên hoàn tất và được xác minh tồn tại trên kho lưu trữ.** **Backend kiểm tra loại và dung lượng file.** Bản mới không ghi đè mà tạo phiên bản mới. Nhãn nộp muộn tính theo giờ server so với hạn mốc. **Sản phẩm lớn (mã nguồn, video) nộp bằng link.** |
| FR12 | Nhận xét và đánh giá | M2 | P1 | Chỉ GVHD hiện hành; nhận xét gắn đúng bản nộp. **Đánh giá mốc: Đạt hoặc Cần bổ sung.** Kết quả cuối **(theo thang của khoa)** và nhận xét tổng kết là bắt buộc. |
| FR13 | Thông báo trong web | M2 | P1 | Có trạng thái đã đọc. **Sự kiện: lời mời, đề nghị hướng dẫn, kết quả xét duyệt, nhận xét mới, nhắc trước hạn X ngày, quá hạn.** Chống trùng theo khóa sự kiện + người nhận. **Nhắc hạn do bộ lập lịch bên ngoài gọi, không phụ thuộc server đang chạy.** |
| FR14 | Thống kê và CSV | M4 | P1 | Theo giảng viên, lĩnh vực, trạng thái, kết quả, năm học, đợt (khoa khi mở rộng). **Biểu đồ, bảng và CSV cho cùng số với cùng bộ lọc.** **CSV UTF-8 có BOM, chống CSV injection.** **Giảng viên chỉ thấy số liệu đề tài mình hướng dẫn.** |
| FR15 | Lịch sử xử lý | NT | P1 | Ghi ai, khi nào, thao tác, đối tượng, **giá trị trước và sau của trường quan trọng.** **Chỉ thêm, không sửa, không xóa.** |
| FR16 | Đề nghị nhận hướng dẫn | M1 | P1 | Giảng viên nhận hoặc từ chối **có lý do.** **Không vượt hạn mức đề tài mỗi giảng viên trong đợt.** Chưa có giảng viên nhận thì không gửi xét duyệt. **Sinh viên rút được đề nghị chưa phản hồi** (mục 4). |
| FR17 | Phiên bản hồ sơ xét duyệt | M3 | P1 | Mỗi lần gửi tạo snapshot bất biến **gồm nội dung, file và kết quả FR06.** Quyết định trỏ đúng snapshot. **Xem được khác biệt giữa hai lần gửi.** |
| FR18 | Thay đổi sau duyệt | M1 | P3 | Yêu cầu nêu trước, sau, lý do. **Kiểm tra lại giới hạn nhóm (FR03), hạn mức giảng viên (FR16); chạy lại FR06 nếu đổi tên hoặc tóm tắt.** Cán bộ quyết định; bị từ chối thì giữ nguyên. |
| FR19 | Thay giảng viên | M1 | P2 | Giảng viên mới chấp nhận, cán bộ duyệt. **Từ lúc duyệt: quyền giảng viên cũ chấm dứt, bản nộp chờ nhận xét chuyển sang giảng viên mới, nhận xét cũ giữ tên người viết** (mục 4). |
| FR20 | Đề nghị và quyết định hủy | M1 | P2 | **Trưởng nhóm hoặc GVHD đề nghị, có lý do.** Đề nghị đang chờ không tự đóng. Quyết định có lý do. **Đề tài hủy không bị xóa và vẫn có trong thống kê.** |
| FR21 | Rời nhóm và quyền đọc lịch sử | M1 | P2 | Trước duyệt: rời tự do, mất quyền ngay. **Sau duyệt: cần cán bộ duyệt và nhóm vẫn đủ min.** Người đã rời chỉ đọc các phiên bản trong khoảng thời gian còn là thành viên. |
| FR22 | Mở lại mốc đã đạt | M2 | P3 | Chỉ GVHD, bắt buộc lý do; **mốc chuyển về Cần bổ sung.** Điều kiện đóng đề tài (FR27) luôn xét theo đánh giá hiện hành. |
| FR23 | Sửa sai kết quả | M2, M4 | P2 | Chỉ cán bộ, bắt buộc lý do; tạo phiên bản kết quả mới, không xóa bản cũ. **Thống kê dùng phiên bản hiện hành; nhóm và GVHD được thông báo.** |
| FR24 | Tải tài liệu riêng | M3 | P1 | Kiểm tra quyền **mỗi lần tải** rồi cấp link hết hạn sau 5 phút; không công khai URL cố định. **Lượt tải được ghi lịch sử.** |
| FR25 | Vai trò và phạm vi | NT | P1 | **Quyền xét theo vai trò và quan hệ với từng đề tài.** Admin không tự có quyền nghiệp vụ. Cán bộ chỉ thao tác khoa được cấp. **Mọi kiểm tra quyền thực hiện ở backend.** |
| FR26 | Sao lưu và dọn file | NT | P2 | **Sao lưu database tự động hằng ngày, giữ ≥ 7 bản; diễn tập khôi phục thành công ít nhất một lần, có biên bản.** **Chỉ dọn file không được bản ghi nào tham chiếu và cũ hơn 24 giờ;** không xóa tài liệu đã nộp. Sao lưu file sang kho thứ hai thuộc hướng phát triển. |
| FR27 | Đóng đề tài (mới) | M2, M4 | P1 | **Điều kiện: mọi mốc bắt buộc Đạt, đã có kết quả cuối và nhận xét tổng kết của GVHD. Cán bộ xác nhận chuyển sang Đã đóng. Sau khi đóng, kết quả chỉ sửa qua FR23. Đề tài đóng đạt được đưa vào kho tra cứu (FR08).** |

## 3. Đặc tả chi tiết FR06 – Kiểm tra tương tự

FR06 so hồ sơ mới với kho đề tài theo hai điểm độc lập: **điểm tên** (pg\_trgm) và **điểm nội dung** (TF-IDF + cosine bằng JavaScript). Kết quả là cảnh báo kèm top 5 đề tài giống nhất, không phải lệnh chặn.

**Khi nào chạy**

- **Bắt buộc** khi trưởng nhóm bấm gửi xét duyệt (lần đầu và mỗi lần gửi lại).
- **Tùy chọn** khi đang soạn: nút "Kiểm tra trước", để nhóm tự điều chỉnh sớm.
- **Tự động chạy lại** khi yêu cầu thay đổi sau duyệt (FR18) có đổi tên hoặc tóm tắt.

**Kho để so**

- Đề tài ở trạng thái Đang thực hiện, Chờ đóng, Đã đóng (mọi năm).
- Hồ sơ Chờ GVHD, Đã có GVHD, Chờ xét duyệt, Cần chỉnh sửa **của nhóm khác trong cùng đợt.**
- Không so với: hồ sơ Nháp, đề tài Bị từ chối, Đã hủy, và chính các phiên bản trước của đề tài đang kiểm tra.

**Xử lý văn bản**

- **Điểm tên:** chuẩn hóa chữ thường + `unaccent`, bỏ khoảng trắng thừa, rồi dùng `similarity()` của pg\_trgm, có index GIN trigram (tạo bằng SQL trong migration).
- **Điểm nội dung:** ghép tóm tắt + mục tiêu + từ khóa (từ khóa nhân trọng số 2). Chữ thường, giữ dấu tiếng Việt. Bỏ từ dừng tiếng Việt và tiếng Anh. Tách thành âm tiết đơn và cặp âm tiết liền nhau (để "học máy" là một đặc trưng).
- **Từ điển đồng nghĩa CNTT** quy về một dạng trước khi tính, ví dụ: học sâu = deep learning; nhận diện = nhận dạng; trí tuệ nhân tạo = AI; ứng dụng di động = mobile app. Từ điển lưu trong database để cán bộ bổ sung.
- IDF tính lại khi có đề tài mới vào kho và được cache; với vài nghìn đề tài, tính trực tiếp trên Node là đủ.

**Ngưỡng và hành vi** (giá trị khởi điểm, cấu hình theo đợt, hiệu chỉnh bằng bộ dữ liệu mẫu đã gán nhãn)

| Mức | Điểm tên | Điểm nội dung | Hành vi |
| --- | --- | --- | --- |
| Không cảnh báo | < 0,50 | < 0,35 | Gửi bình thường |
| Cần xem xét | 0,50 – 0,69 | 0,35 – 0,54 | Hiện cảnh báo vàng; giải trình không bắt buộc |
| Nghi trùng cao | ≥ 0,70 | ≥ 0,55 | Hiện cảnh báo đỏ; **bắt buộc giải trình ≥ 50 từ** mới gửi được |

Mức của hồ sơ là mức cao hơn trong hai điểm. Cán bộ xét duyệt luôn thấy mức, top 5 và giải trình (FR07).

**Hiển thị và quyền riêng tư**

- Đề tài đã duyệt trở đi: sinh viên thấy mã, tên, năm học, lĩnh vực, trạng thái, hai điểm và các từ khóa trùng.
- Hồ sơ đang chờ của nhóm khác: sinh viên chỉ thấy dòng "Có 1 hồ sơ đang chờ duyệt trong đợt có nội dung tương tự" kèm điểm, **không thấy tên hay tóm tắt.** Cán bộ thấy đầy đủ.
- Không bao giờ hiện thành viên, file hay nhận xét của đề tài khác (khớp FR08).

**Khi có lỗi**

- Lỗi thuật toán hoặc database: kết quả là "Chưa kiểm tra được", **không phải "Không trùng".** Hồ sơ không gửi được; người dùng thử lại.
- Nếu lỗi kéo dài, cán bộ có thể cho phép gửi với cờ "chưa kiểm tra"; hệ thống tự chạy lại khi hết lỗi và cập nhật vào snapshot.

**Dữ liệu lưu (bảng `similarity_check`)**

Mã đề tài, mã snapshot, thời điểm, phiên bản thuật toán, bộ ngưỡng đang áp dụng, nội dung đã đem so (hoặc hash của nó), số đề tài trong kho lúc so, mức cảnh báo, top 5 (mã đề tài, điểm tên, điểm nội dung), giải trình, trạng thái (thành công / lỗi).

**Tiêu chí nghiệm thu**

- Kiểm tra hoàn tất trong ≤ 3 giây với kho 2.000 đề tài.
- Trên bộ mẫu ≥ 100 cặp đã gán nhãn (trùng / không trùng), báo cáo được precision và recall ở từng ngưỡng; ngưỡng chốt có recall ≥ 80% ở mức "Cần xem xét".
- Cùng nội dung, cùng kho, cùng phiên bản thuật toán thì cho cùng kết quả.
- Ca kiểm thử bắt buộc: tên chỉ khác dấu hoặc lỗi gõ; đổi trật tự từ; thay thuật ngữ Việt bằng tiếng Anh; hai nhóm cùng đợt gửi gần cùng lúc; lỗi giả lập ở database.
- **Giới hạn ghi nhận trong báo cáo:** TF-IDF không phát hiện được hai đề tài diễn đạt hoàn toàn khác từ ngữ; hướng phát triển là tìm kiếm ngữ nghĩa bằng embedding.

## 4. Đặc tả chi tiết các yêu cầu cần làm rõ

Bốn yêu cầu dưới đây có nhiều tình huống biên nhất, nên được đặc tả riêng để code và test cùng bám một nguồn.

### FR16 – Đề nghị nhận hướng dẫn

1. Trưởng nhóm gửi đề nghị cho **một** giảng viên tại một thời điểm; đề tài chuyển sang Chờ GVHD.
2. Giảng viên nhận hoặc từ chối, từ chối bắt buộc lý do. Hạn mức kiểm tra **tại thời điểm nhận** (số đề tài hoạt động giảng viên đang hướng dẫn trong đợt < hạn mức), trong transaction để hai lần nhận đồng thời không vượt hạn mức.
3. Bị từ chối hoặc nhóm rút đề nghị: đề tài về Nháp, nhóm được mời giảng viên khác.
4. Đề nghị chưa phản hồi sau X ngày (cấu hình đợt): nhắc giảng viên một lần, đồng thời báo cán bộ khoa. Đề nghị **không tự hết hạn**; nhóm luôn có quyền rút.
5. Đóng đăng ký mà đề tài vẫn ở Chờ GVHD: không gửi xét duyệt được nữa; cán bộ thấy danh sách này trên dashboard.

### FR19 – Thay giảng viên

1. Trưởng nhóm hoặc cán bộ tạo yêu cầu, nêu lý do và giảng viên mới.
2. Giảng viên mới chấp nhận (kiểm tra hạn mức như FR16), sau đó cán bộ duyệt.
3. Tại thời điểm duyệt, trong một transaction: kết thúc quan hệ hướng dẫn cũ (ghi ngày kết thúc), tạo quan hệ mới, chuyển các bản nộp đang chờ nhận xét sang giảng viên mới.
4. Nhận xét và đánh giá đã có giữ nguyên tên người viết. Giảng viên cũ **mất mọi quyền** trên đề tài, kể cả quyền đọc, trừ khi cán bộ cấp quyền chỉ đọc.
5. Trong lúc yêu cầu đang chờ, giảng viên hiện hành vẫn làm việc bình thường.

### FR26 – Sao lưu và dọn file

- **Database:** GitHub Actions chạy `pg_dump` hằng ngày, lưu bản sao ngoài Supabase, giữ 7 bản gần nhất. Tài liệu hóa quy trình khôi phục và diễn tập một lần trên môi trường thử; biên bản ghi thời gian khôi phục và kết quả kiểm tra số bản ghi.
- **File:** không có thao tác ghi đè hay xóa file đã gắn với bản nộp. File "mồ côi" là file đã upload nhưng không bản ghi nào tham chiếu (thường do lỗi giữa chừng). Job dọn chỉ xóa file mồ côi cũ hơn 24 giờ và ghi lịch sử từng file đã xóa.
- **Ngoài phạm vi:** sao lưu file Cloudinary sang kho thứ hai (ghi vào hướng phát triển).

### FR27 – Đóng đề tài (yêu cầu mới)

1. Khi mọi mốc bắt buộc đều Đạt, GVHD nhập kết quả cuối và nhận xét tổng kết; đề tài chuyển sang Chờ đóng.
2. Cán bộ khoa xem lại và xác nhận đóng, hoặc trả lại GVHD kèm lý do (về Đang thực hiện).
3. Hệ thống kiểm tra lại điều kiện ngay lúc đóng, theo đánh giá hiện hành (FR22 có thể đã mở lại một mốc).
4. Sau khi đóng: hồ sơ chỉ đọc; kết quả chỉ sửa qua FR23; đề tài kết quả đạt vào kho tra cứu (FR08) và vào kho so trùng (FR06).
5. Hết hạn đợt mà đề tài chưa đủ điều kiện: cán bộ chọn gia hạn mốc (FR09) hoặc đóng với kết quả Không đạt, bắt buộc lý do.

## 5. Chuyển trạng thái đề tài

Đề tài có 10 trạng thái: 7 trên luồng chính và 3 nhánh phụ. Mọi lần chuyển chạy trong transaction và ghi vào lịch sử (FR15); thao tác không có trong bảng dưới đây thì backend từ chối.

&#91;embedded content: vòng đời đề tài · 10 trạng thái, 13 lần chuyển\]

| Từ | Sang | Người thực hiện | Điều kiện | FR |
| --- | --- | --- | --- | --- |
| Nháp | Chờ GVHD | Trưởng nhóm | Trong thời gian mở đăng ký; nhóm đủ min thành viên | FR03, FR16 |
| Chờ GVHD | Đã có GVHD | Giảng viên | Chưa vượt hạn mức hướng dẫn | FR16 |
| Chờ GVHD | Nháp | Giảng viên hoặc trưởng nhóm | Giảng viên từ chối có lý do, hoặc nhóm rút đề nghị | FR16 |
| Đã có GVHD | Chờ xét duyệt | Trưởng nhóm | Đủ trường bắt buộc; FR06 chạy xong; tạo snapshot | FR05, FR06, FR17 |
| Chờ xét duyệt | Cần chỉnh sửa | Cán bộ khoa | Có lý do | FR07 |
| Cần chỉnh sửa | Chờ xét duyệt | Trưởng nhóm | Chạy lại FR06; snapshot mới | FR06, FR17 |
| Chờ xét duyệt | Bị từ chối | Cán bộ khoa | Có lý do; trạng thái kết thúc | FR07 |
| Chờ xét duyệt | Đang thực hiện | Cán bộ khoa | Quyết định gắn đúng snapshot | FR07, FR17 |
| Đang thực hiện | Đã hủy | Cán bộ khoa | Có đề nghị và quyết định hủy kèm lý do | FR20 |
| Đang thực hiện | Chờ đóng | GVHD | Mọi mốc bắt buộc Đạt; có kết quả cuối và nhận xét tổng kết | FR12, FR27 |
| Chờ đóng | Đang thực hiện | Cán bộ khoa | Trả lại kèm lý do | FR27 |
| Chờ đóng | Đã đóng | Cán bộ khoa | Điều kiện được kiểm tra lại theo đánh giá hiện hành | FR22, FR27 |
| Đang thực hiện | Đã đóng (Không đạt) | Cán bộ khoa | Hết hạn đợt, không gia hạn; bắt buộc lý do | FR27 |

Các thao tác FR18, FR19, FR21, FR22, FR23 không đổi trạng thái đề tài; chúng tạo bản ghi yêu cầu riêng và ghi lịch sử.

## 6. Ma trận truy vết

Mỗi mục tiêu được phủ bởi ít nhất một FR P1 và một nhóm kiểm thử tự động. Mã test case đặt theo dạng `TC-FRxx-nn` để tra ngược về yêu cầu.

| Mục tiêu | FR đáp ứng | Unit (Vitest) | Integration (Supertest) | E2E (Playwright) |
| --- | --- | --- | --- | --- |
| M1 | FR03, FR05, FR07, FR08, FR16, FR18–FR21 | Kiểm tra giới hạn nhóm, sinh mã đề tài | Hai giảng viên nhận cùng lúc không vượt hạn mức; vai trò chỉ thấy đề tài trong phạm vi | Tạo nhóm → mời GVHD → gửi → cán bộ duyệt |
| M2 | FR09, FR10, FR12, FR13, FR22, FR23, FR27 | Điều kiện đóng đề tài theo đánh giá hiện hành | Nhắc hạn không gửi trùng; chỉ GVHD hiện hành được nhận xét | Nộp mốc → nhận xét → đóng đề tài |
| M3 | FR11, FR17, FR24, FR26 | Kiểm tra loại và dung lượng file | Bản mới không ghi đè; link hết hạn sau 5 phút; người ngoài nhận 403 | Upload, xem lịch sử phiên bản, tải về |
| M4 | FR14, FR23, FR27 | BOM UTF-8, thoát CSV injection | Số trên API thống kê khớp CSV với cùng bộ lọc | Lọc dashboard và xuất CSV |
| M5 | FR05, FR06 | Chuẩn hóa, tách cặp âm tiết, từ đồng nghĩa, cosine | Kho so đúng trạng thái; hồ sơ chờ của nhóm khác bị ẩn; lỗi trả "Chưa kiểm tra được" | Gửi hồ sơ trùng cao → buộc giải trình → cán bộ thấy cảnh báo |
| NT | FR01, FR02, FR04, FR15, FR25 | Kiểm tra thứ tự mốc của đợt | Khóa tài khoản thu hồi phiên; admin không có quyền nghiệp vụ; lịch sử không sửa được | Đăng nhập, refresh, logout theo từng vai trò |

Riêng M5 có thêm phần **thực nghiệm** (mục 3): bộ ≥ 100 cặp gán nhãn, báo cáo precision và recall theo ngưỡng.

## 7. Yêu cầu phi chức năng

Mười yêu cầu phi chức năng dưới đây đều có cách kiểm chứng cụ thể; phần lớn xuất phát từ các rủi ro đã nhận diện của bộ công nghệ Vercel + Render + Supabase + Cloudinary.

| Mã | Nhóm | Yêu cầu | Cách kiểm chứng |
| --- | --- | --- | --- |
| NFR01 | Bảo mật phiên | Mật khẩu băm Argon2id. Rate limit đăng nhập. Refresh token trong cookie httpOnly, Secure, SameSite=Lax; frontend gọi `/api` cùng domain qua rewrite của Vercel. | Test integration; kiểm tra cookie trên Chrome và Safari |
| NFR02 | Bảo mật truy cập | Mọi endpoint kiểm tra quyền ở backend. Zod kiểm tra dữ liệu ở cả hai phía. Lỗi trả mã và thông điệp chuẩn, không lộ stack trace. Dùng helmet và CORS chỉ cho domain của hệ thống. | Test 403 cho từng vai trò trên các endpoint nhạy cảm |
| NFR03 | Bảo vệ database | Bật RLS không policy (hoặc tắt Data API) trên Supabase. Khóa bí mật chỉ nằm trong biến môi trường. | Gọi thử Data API bằng anon key phải bị từ chối |
| NFR04 | Hiệu năng | Với 2.000 đề tài: danh sách ≤ 1 giây, thống kê ≤ 2 giây, FR06 ≤ 3 giây (p95, server đã khởi động). | Script seed dữ liệu và đo thời gian |
| NFR05 | Toàn vẹn dữ liệu | Thao tác nhiều bước chạy trong transaction. Có khóa ngoại. Không xóa cứng dữ liệu nghiệp vụ. | Test giả lập lỗi giữa transaction |
| NFR06 | Thời gian | Lưu `timestamptz`, hiển thị theo `Asia/Ho_Chi_Minh`; mọi hạn tính theo giờ server. | Test nộp sát hạn với giờ máy khách bị chỉnh |
| NFR07 | Giao diện | Responsive từ 360 px. Toàn bộ tiếng Việt. Form báo lỗi tại từng trường. | Playwright chạy ở viewport mobile và desktop |
| NFR08 | Vận hành | Log có request id (pino). Có endpoint health check. Swagger tắt hoặc khóa ở production. Database dev, test, prod tách riêng. | Rà cấu hình từng môi trường |
| NFR09 | Chất lượng mã | ESLint, Prettier. GitHub Actions chạy test cho mỗi pull request. Độ phủ unit ≥ 70% ở module nghiệp vụ. | Báo cáo CI và coverage |
| NFR10 | Triển khai | Vercel rewrite SPA về `index.html`. Backend kết nối Supabase qua pooler. Làm nóng server Render trước buổi demo. | Deploy thử ở tuần đầu giai đoạn code |

## 8. Tham số cấu hình và giả định cần xác nhận

Các con số trong tài liệu là giá trị mặc định, lưu trong cấu hình đợt (FR04) để khoa đổi được mà không sửa code.

| Tham số | Mặc định | Dùng ở |
| --- | --- | --- |
| Số thành viên mỗi nhóm (min–max) | 1–5 | FR03, FR21 |
| Số đề tài hoạt động mỗi sinh viên trong đợt | 1 | FR03 |
| Hạn mức đề tài mỗi giảng viên trong đợt | 5 | FR16, FR19 |
| Nhắc giảng viên chưa phản hồi đề nghị sau | 3 ngày | FR16 |
| Nhắc trước hạn mốc | 3 ngày | FR13 |
| Độ dài tóm tắt tối thiểu; số từ khóa | 100 từ; 3–5 | FR05 |
| Ngưỡng điểm tên và điểm nội dung | Bảng ở mục 3 | FR06 |
| Dung lượng file tối đa | 10 MB | FR11 |
| Loại file được nộp | PDF, DOCX, PPTX, XLSX | FR11 |
| Thang kết quả cuối | Xuất sắc, Tốt, Đạt, Không đạt | FR12, FR27 |

Thời hạn link tải (5 phút) và số bản sao lưu (7) là tham số hệ thống, không đổi theo đợt.

**Giả định cần xác nhận với khoa**

- [ ] Xét duyệt đề tài chỉ một cấp (cán bộ khoa), không qua hội đồng.
- [ ] Thang kết quả cuối và tiêu chí của từng mức.
- [ ] Hạn mức đề tài mỗi giảng viên và số thành viên tối đa mỗi nhóm.
- [ ] Sinh viên năm mấy được tham gia và có cho nhóm liên lớp hay không.
- [ ] Giới hạn dung lượng file trên gói Cloudinary đang dùng.
