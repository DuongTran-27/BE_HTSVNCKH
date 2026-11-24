// Sinh pairs.json (node build-pairs.mjs). pairs.json đã sinh mới là dữ liệu dùng; file này để bảo trì/mở rộng.
// b = id chủ đề trong topics.json, hoặc { of, strip?, ...ghi đè } = biến thể của chủ đề `of`.
import { writeFileSync } from 'node:fs';
const P = [];
const pos = (kind, a, o, note) => P.push({ label: 1, kind, a, b: { of: a, ...o }, note });
const neg = (kind, a, b, note) => P.push({ label: 0, kind, a, b, note });

// --- Trùng / gần trùng (label 1) ---
for (const a of ['T01', 'T04', 'T07', 'T10', 'T15', 'T20', 'T24', 'T28']) pos('khong-dau', a, { strip: true }, 'Cùng nội dung, viết không dấu');
pos('doi-thu-tu', 'T02', { title: 'Quản lý thư viện số của trường đại học bằng hệ thống' }, 'Đổi trật tự từ ở tên, nội dung giữ ý');
pos('doi-thu-tu', 'T05', { title: 'Bình luận sản phẩm thương mại điện tử: phân tích cảm xúc', summary: 'Phân loại cảm xúc tích cực, tiêu cực của bình luận sản phẩm tiếng Việt thu thập được, bằng xử lý ngôn ngữ tự nhiên.' }, 'Đảo vế tên và câu tóm tắt');
pos('doi-thu-tu', 'T08', { title: 'Đặt lịch khám bệnh trực tuyến trên nền tảng', summary: 'Ứng dụng web cho bệnh nhân đặt lịch, chọn bác sĩ và nhận email nhắc lịch khám.' }, 'Đổi thứ tự cụm');
pos('doi-thu-tu', 'T11', { title: 'Biển số xe: nhận diện bằng học sâu' }, 'Đảo cụm tên');
pos('doi-thu-tu', 'T16', { title: 'Ứng dụng web quản lý ký túc xá', summary: 'Quản lý phòng ở, hợp đồng, điện nước và đăng ký chỗ ở của sinh viên nội trú bằng ứng dụng web.' }, 'Đảo trật tự từ');
pos('doi-thu-tu', 'T21', { title: 'Tự động chấm bài lập trình bằng hệ thống' }, 'Đảo trật tự từ ở tên');
pos('doi-thu-tu', 'T26', { title: 'Bãi giữ xe thông minh và hệ thống quản lý' }, 'Đảo trật tự từ ở tên');
pos('doi-thu-tu', 'T29', { title: 'Mô hình ngôn ngữ tóm tắt văn bản tiếng Việt' }, 'Đảo trật tự từ ở tên');
pos('dong-nghia', 'T01', { title: 'Ứng dụng deep learning nhận dạng gương mặt trong điểm danh sinh viên', summary: 'Hệ thống điểm danh tự động bằng camera lớp học, dùng deep learning nhận dạng gương mặt sinh viên và lưu chuyên cần vào cơ sở dữ liệu.', keywords: ['deep learning', 'nhận dạng khuôn mặt', 'điểm danh'] }, 'Thuật ngữ Anh/Việt: học sâu=deep learning, nhận diện=nhận dạng');
pos('dong-nghia', 'T04', { title: 'Phát hiện malware trên Android bằng machine learning', summary: 'Rút trích quyền và API call từ file APK, huấn luyện bộ phân loại machine learning phát hiện ứng dụng Android chứa malware.', keywords: ['malware', 'android', 'machine learning', 'an toàn thông tin'] }, 'machine learning=học máy; malware không có trong từ điển');
pos('dong-nghia', 'T05', { title: 'Phân tích cảm xúc bình luận sản phẩm thương mại điện tử bằng NLP', summary: 'Thu thập bình luận sản phẩm tiếng Việt và phân loại cảm xúc tích cực, tiêu cực bằng NLP.', keywords: ['phân tích cảm xúc', 'nlp', 'thương mại điện tử'] }, 'NLP=xử lý ngôn ngữ tự nhiên');
pos('dong-nghia', 'T06', { title: 'Hệ thống tưới cây tự động dùng cảm biến độ ẩm và IoT', summary: 'Thiết kế mạch điều khiển bơm nước tự động theo cảm biến độ ẩm đất, gửi dữ liệu lên nền tảng IoT.', keywords: ['iot', 'cảm biến', 'nông nghiệp thông minh'] }, 'IoT=internet vạn vật');
pos('dong-nghia', 'T09', { title: 'Mobile app theo dõi chi tiêu cá nhân', summary: 'Mobile app ghi chép thu chi hằng ngày, phân loại khoản chi và thống kê theo tháng bằng biểu đồ.', keywords: ['mobile app', 'tài chính cá nhân', 'thống kê'] }, 'mobile app=ứng dụng di động');
pos('dong-nghia', 'T11', { title: 'Nhận dạng biển số xe bằng deep learning', keywords: ['deep learning', 'nhận dạng', 'biển số xe', 'computer vision'] }, 'deep learning, nhận dạng, computer vision');
pos('dong-nghia', 'T17', { title: 'Phát hiện fake news tiếng Việt bằng NLP', keywords: ['tin giả', 'nlp', 'phân loại văn bản'] }, 'NLP; fake news không có trong từ điển');
pos('dong-nghia', 'T18', { title: 'Bảo mật dữ liệu y tế bằng blockchain', summary: 'Lưu hồ sơ bệnh án với kiểm soát truy cập dựa trên blockchain để bảo đảm toàn vẹn và quyền riêng tư.', keywords: ['blockchain', 'y tế', 'an toàn thông tin'] }, 'blockchain=chuỗi khối');
pos('dong-nghia', 'T20', { title: 'Phân loại rác thải bằng computer vision', summary: 'Dùng deep learning phân loại ảnh rác thải thành tái chế, hữu cơ và vô cơ để hỗ trợ thùng rác thông minh.', keywords: ['computer vision', 'deep learning', 'rác thải'] }, 'computer vision, deep learning');
pos('dong-nghia', 'T22', { title: 'Nhận diện chữ viết tay tiếng Việt', summary: 'Huấn luyện mạng nơ-ron nhận diện chữ viết tay tiếng Việt có dấu từ ảnh chụp phiếu điểm.', keywords: ['nhận diện', 'chữ viết tay', 'học sâu'] }, 'nhận dạng=nhận diện');
pos('dong-nghia', 'T07', { title: 'Chatbot AI tư vấn tuyển sinh dựa trên mô hình ngôn ngữ', summary: 'Xây dựng chatbot AI trả lời câu hỏi về ngành học, điểm chuẩn, học phí dựa trên mô hình ngôn ngữ lớn và kho tài liệu tuyển sinh.', keywords: ['chatbot', 'ai', 'tuyển sinh'] }, 'Thêm từ AI');
pos('dien-dat-lai', 'T02', { title: 'Xây dựng ứng dụng web số hóa việc mượn trả và tra cứu sách của thư viện đại học', summary: 'Ứng dụng web giúp sinh viên, giảng viên tra cứu giáo trình, mượn trả sách và quản lý tài liệu số của thư viện.', keywords: ['thư viện số', 'web', 'mượn trả sách'] }, 'Diễn đạt lại, giữ khái niệm chính');
pos('dien-dat-lai', 'T03', { title: 'Phần mềm điện thoại giúp người học ghi nhớ từ vựng tiếng Anh', summary: 'Ứng dụng di động cho người học ôn từ vựng tiếng Anh bằng thẻ ghi nhớ, lặp lại ngắt quãng để nhớ lâu.', keywords: ['ứng dụng di động', 'từ vựng', 'flashcard'] }, 'Diễn đạt lại cùng ý');
pos('dien-dat-lai', 'T08', { title: 'Hệ thống đăng ký khám bệnh qua mạng cho bệnh nhân', summary: 'Ứng dụng web cho phép bệnh nhân chọn bác sĩ, đặt lịch khám và được nhắc lịch qua email, giảm thời gian chờ.', keywords: ['đặt lịch', 'y tế', 'ứng dụng web'] }, 'Diễn đạt lại');
pos('dien-dat-lai', 'T10', { title: 'Chặn tấn công SQL injection nhằm vào website', summary: 'Phân tích câu truy vấn gửi đến ứng dụng web để phát hiện và ngăn chặn tấn công SQL injection, kiểm thử trên các mẫu tấn công.', keywords: ['sql injection', 'tường lửa ứng dụng', 'an toàn thông tin'] }, 'Diễn đạt lại');
pos('dien-dat-lai', 'T12', { title: 'Mô hình học máy dự đoán giá bất động sản', summary: 'Thu thập tin rao bán nhà đất, huấn luyện mô hình học máy để dự đoán giá theo vị trí và diện tích.' }, 'Diễn đạt lại: dự báo/dự đoán, nhà đất/bất động sản');
pos('dien-dat-lai', 'T14', { title: 'Xây dựng hệ khuyến nghị phim bằng lọc cộng tác', summary: 'Gợi ý phim cho người dùng dựa trên lịch sử xem và đánh giá, sử dụng lọc cộng tác.' }, 'Diễn đạt lại');
pos('dien-dat-lai', 'T15', { title: 'Mạng cảm biến theo dõi bụi mịn và khí CO2 trong khuôn viên trường', summary: 'Các nút cảm biến bụi mịn và CO2 gửi dữ liệu về máy chủ, hiển thị bản đồ chất lượng không khí theo thời gian thực.' }, 'Diễn đạt lại');
pos('dien-dat-lai', 'T19', { title: 'Ứng dụng di động xem tuyến và giờ chạy xe buýt', summary: 'Ứng dụng di động cho người dân xem tuyến, giờ chạy và vị trí xe buýt theo thời gian thực để lên kế hoạch di chuyển.' }, 'Diễn đạt lại');
pos('dien-dat-lai', 'T23', { title: 'Nhà thông minh dùng ESP32 điều khiển thiết bị bằng lệnh tiếng Việt', summary: 'Dùng vi điều khiển ESP32 bật tắt đèn, quạt bằng lệnh giọng nói tiếng Việt qua ứng dụng di động.' }, 'Diễn đạt lại');
pos('dien-dat-lai', 'T25', { title: 'Nhận biết thư điện tử giả mạo bằng học máy', summary: 'Trích xuất đặc trưng nội dung và đường dẫn trong thư điện tử, huấn luyện bộ phân loại học máy phát hiện thư lừa đảo.' }, 'Diễn đạt lại: email=thư điện tử');
pos('dien-dat-lai', 'T27', { title: 'Game dạy lập trình cho học sinh trung học', summary: 'Trò chơi chạy trên trình duyệt giúp học sinh làm quen vòng lặp và điều kiện qua các màn chơi, tăng hứng thú học lập trình.' }, 'Diễn đạt lại');
pos('dien-dat-lai', 'T28', { title: 'Truy xuất nguồn gốc nông sản bằng chuỗi khối và mã QR', summary: 'Mỗi công đoạn sản xuất nông sản được ghi lên chuỗi khối, người tiêu dùng quét mã QR để xem nguồn gốc.' }, 'Diễn đạt lại');
pos('dien-dat-lai', 'T30', { title: 'Điểm danh sinh viên bằng quét mã QR động', summary: 'Mã QR do giảng viên hiển thị thay đổi theo thời gian, sinh viên quét bằng điện thoại để điểm danh, hạn chế điểm danh hộ.' }, 'Diễn đạt lại');
pos('loi-go', 'T01', { title: 'Ung dụng học sâu nhận diên khuôn mạt để điểm danh sinh viên' }, 'Lỗi gõ ở tên, nội dung giữ nguyên');
pos('loi-go', 'T04', { title: 'Phát hiên mã đọc Android bằng hoc máy' }, 'Lỗi gõ ở tên, nội dung giữ nguyên');
pos('loi-go', 'T13', { title: 'Xây dựng webste bán sach cũ cho sinh viên' }, 'Lỗi gõ ở tên, nội dung giữ nguyên');
pos('loi-go', 'T16', { title: 'Quản lý ký túc xa bằng ứng dụg web' }, 'Lỗi gõ ở tên, nội dung giữ nguyên');
pos('loi-go', 'T20', { title: 'Phân loai rác thải bằng thị giac máy tính' }, 'Lỗi gõ ở tên, nội dung giữ nguyên');
pos('loi-go', 'T24', { title: 'Tối ưu hiệu năng truy vân cơ sở dử liệu PostgreSQL' }, 'Lỗi gõ ở tên, nội dung giữ nguyên');
pos('sao-chep-noi-dung', 'T09', { title: 'Phần mềm quản lý thu chi hằng ngày' }, 'Đổi hoàn toàn tên, giữ nguyên tóm tắt/mục tiêu/từ khóa');
pos('sao-chep-noi-dung', 'T13', { title: 'Sàn giao dịch giáo trình cũ' }, 'Đổi hoàn toàn tên, giữ nguyên nội dung');
pos('sao-chep-noi-dung', 'T21', { title: 'Công cụ đánh giá mã nguồn của sinh viên' }, 'Đổi hoàn toàn tên, giữ nguyên nội dung');
pos('sao-chep-noi-dung', 'T26', { title: 'Cổng kiểm soát phương tiện vào trường' }, 'Đổi hoàn toàn tên, giữ nguyên nội dung');
pos('sao-chep-noi-dung', 'T12', { title: 'Ước lượng giá nhà' }, 'Đổi tên, giữ nguyên nội dung');
pos('sao-chep-noi-dung', 'T29', { title: 'Rút gọn tin tức' }, 'Đổi tên, giữ nguyên nội dung');
pos('khac-tu-ngu-hoan-toan', 'T13', { title: 'Chợ trực tuyến trao đổi tài liệu học tập đã dùng', summary: 'Nền tảng giúp người học bán lại và đổi tài liệu cũ, kèm đặt mua, trả tiền và chấm điểm người bán.', objectives: 'Hoàn tất việc mua bán và quản lý hệ thống', keywords: ['sàn giao dịch', 'tài liệu học tập'] }, 'Giới hạn đã biết (đặc tả mục 3): hoàn toàn khác từ ngữ, TF-IDF sẽ bỏ sót');
pos('khac-tu-ngu-hoan-toan', 'T27', { title: 'Trò chơi tương tác giúp học sinh làm quen tư duy thuật toán', summary: 'Sản phẩm giải trí chạy trên web cho học sinh luyện khái niệm lặp và rẽ nhánh qua các cấp độ.', objectives: 'Khơi gợi sự yêu thích môn tin học', keywords: ['gamification', 'tin học', 'giáo dục'] }, 'Giới hạn đã biết: ngữ nghĩa tương đương, từ ngữ khác');
pos('khac-tu-ngu-hoan-toan', 'T30', { title: 'Ghi nhận chuyên cần bằng thiết bị cầm tay', summary: 'Mỗi buổi học, người dạy chiếu mã vạch hai chiều đổi liên tục để người học dùng điện thoại xác nhận có mặt.', objectives: 'Rút ngắn thời gian gọi tên và ngăn việc ký hộ', keywords: ['chuyên cần', 'mã vạch hai chiều'] }, 'Giới hạn đã biết: hoàn toàn khác từ ngữ');
pos('khac-tu-ngu-hoan-toan', 'T03', { title: 'Công cụ luyện ghi nhớ từ ngữ ngoại ngữ trên điện thoại', summary: 'Phần mềm cầm tay cho người học ngôn ngữ nước ngoài rèn trí nhớ từ mới bằng thẻ học và nhắc lại theo chu kỳ.', objectives: 'Cải thiện trí nhớ vốn từ', keywords: ['ngoại ngữ', 'trí nhớ'] }, 'Giới hạn đã biết: hoàn toàn khác từ ngữ');

// --- Không trùng (label 0) ---
const easy = [['T01', 'T13'], ['T02', 'T06'], ['T03', 'T10'], ['T05', 'T15'], ['T07', 'T24'], ['T08', 'T20'], ['T09', 'T22'], ['T12', 'T16'], ['T14', 'T18'], ['T19', 'T25'], ['T21', 'T28'], ['T23', 'T29'], ['T27', 'T11'], ['T30', 'T04'], ['T17', 'T26'], ['T13', 'T10'], ['T06', 'T14'], ['T24', 'T27'], ['T18', 'T03'], ['T02', 'T22']];
for (const [a, b] of easy) neg('khac-linh-vuc', a, b, 'Khác lĩnh vực, khác đề tài');
const sameField = [
  ['T01', 'T11', 'Cùng học sâu + thị giác, khác bài toán (khuôn mặt vs biển số)'],
  ['T01', 'T20', 'Cùng học sâu thị giác, khác bài toán'],
  ['T11', 'T20', 'Cùng học sâu thị giác, khác bài toán'],
  ['T11', 'T22', 'Cùng học sâu/nhận dạng ảnh, khác bài toán'],
  ['T04', 'T25', 'Cùng học máy + an toàn thông tin, khác đối tượng'],
  ['T04', 'T10', 'Cùng an toàn thông tin, khác kỹ thuật'],
  ['T10', 'T18', 'Cùng an toàn thông tin, khác bài toán'],
  ['T05', 'T17', 'Cùng NLP tiếng Việt, khác bài toán'],
  ['T05', 'T29', 'Cùng NLP tiếng Việt, khác bài toán'],
  ['T07', 'T29', 'Cùng mô hình ngôn ngữ, khác ứng dụng'],
  ['T17', 'T29', 'Cùng NLP/mô hình ngôn ngữ, khác ứng dụng'],
  ['T06', 'T15', 'Cùng IoT cảm biến, khác ứng dụng'],
  ['T06', 'T23', 'Cùng IoT vi điều khiển, khác ứng dụng'],
  ['T15', 'T23', 'Cùng IoT, khác ứng dụng'],
  ['T02', 'T16', 'Cùng quản lý bằng ứng dụng web, khác nghiệp vụ'],
  ['T02', 'T08', 'Cùng ứng dụng web, khác nghiệp vụ'],
  ['T08', 'T16', 'Cùng ứng dụng web, khác nghiệp vụ'],
  ['T02', 'T21', 'Cùng ứng dụng web giáo dục, khác nghiệp vụ'],
  ['T03', 'T09', 'Cùng ứng dụng di động, khác nghiệp vụ'],
  ['T03', 'T19', 'Cùng ứng dụng di động, khác nghiệp vụ'],
  ['T09', 'T19', 'Cùng ứng dụng di động, khác nghiệp vụ'],
  ['T01', 'T30', 'Cùng bài toán điểm danh, khác kỹ thuật (khuôn mặt vs QR); nhãn không trùng vì cách làm khác'],
  ['T11', 'T26', 'Nhận diện biển số thuần vs hệ thống bãi xe (liên quan nhưng khác đề tài)'],
  ['T18', 'T28', 'Cùng chuỗi khối, khác lĩnh vực ứng dụng'],
  ['T12', 'T14', 'Cùng học máy dự đoán/gợi ý, khác miền dữ liệu'],
  ['T04', 'T12', 'Cùng học máy, khác miền'],
  ['T25', 'T12', 'Cùng học máy, khác miền'],
  ['T24', 'T02', 'Cùng cơ sở dữ liệu nhưng khác mục tiêu'],
  ['T27', 'T21', 'Cùng giáo dục lập trình, khác sản phẩm'],
  ['T13', 'T08', 'Cùng ứng dụng web giao dịch/đặt, khác nghiệp vụ'],
  ['T20', 'T06', 'Rác thải vs tưới cây: khác lĩnh vực, cùng "thông minh"'],
  ['T26', 'T30', 'Cùng quản lý ra vào/điểm danh, khác đối tượng'],
  ['T10', 'T25', 'Cùng an toàn thông tin, khác bài toán'],
  ['T22', 'T05', 'Học sâu nhận dạng vs NLP, khác bài toán'],
  ['T19', 'T15', 'Cùng dữ liệu thời gian thực, khác bài toán'],
  ['T14', 'T09', 'Khác hoàn toàn nghiệp vụ'],
];
for (const [a, b, n] of sameField) neg('cung-linh-vuc-khac-de-tai', a, b, n);
const hardNeg = (a, o, note) => neg('tu-khoa-trung-khac-de-tai', a, { of: a, ...o }, note);
hardNeg('T04', { title: 'Thống kê tải ứng dụng Android theo quốc gia', summary: 'Phân tích số liệu tải ứng dụng Android trên cửa hàng ứng dụng theo quốc gia và thời gian để báo cáo xu hướng.', objectives: 'Lập báo cáo thị trường', keywords: ['android', 'thống kê', 'thị trường'] }, 'Chung từ "Android" nhưng khác bài toán');
hardNeg('T01', { title: 'Nhận diện cảm xúc khuôn mặt của khách hàng tại quầy dịch vụ', summary: 'Dùng mô hình học sâu nhận diện cảm xúc trên khuôn mặt khách hàng để đo mức độ hài lòng tại quầy dịch vụ.', objectives: 'Cải thiện chất lượng phục vụ', keywords: ['học sâu', 'nhận diện cảm xúc', 'khuôn mặt'] }, 'Cùng kỹ thuật + đối tượng khuôn mặt, khác mục đích (khó)');
hardNeg('T02', { title: 'Hệ thống quản lý thiết bị phòng thí nghiệm', summary: 'Phát triển ứng dụng web quản lý thiết bị, lịch mượn và bảo trì tại các phòng thí nghiệm của khoa.', objectives: 'Theo dõi tình trạng thiết bị', keywords: ['thiết bị', 'ứng dụng web', 'quản lý'] }, 'Chung "hệ thống quản lý ... ứng dụng web", đối tượng khác');
hardNeg('T10', { title: 'Xây dựng ứng dụng web quản lý câu hỏi trắc nghiệm', summary: 'Ứng dụng web cho giảng viên soạn, quản lý ngân hàng câu hỏi và tạo đề trắc nghiệm.', objectives: 'Giảm thời gian ra đề', keywords: ['trắc nghiệm', 'ứng dụng web', 'giảng viên'] }, 'Chung "ứng dụng web", khác bài toán');
hardNeg('T07', { title: 'Chatbot hỗ trợ khách hàng cho cửa hàng thời trang', summary: 'Chatbot trả lời câu hỏi về sản phẩm, kích cỡ và đơn hàng của cửa hàng thời trang trực tuyến.', objectives: 'Giảm tải cho nhân viên chăm sóc khách hàng', keywords: ['chatbot', 'thời trang', 'chăm sóc khách hàng'] }, 'Cùng chatbot, khác lĩnh vực hỏi đáp (khó)');
hardNeg('T06', { title: 'Hệ thống cảnh báo cháy rừng dùng cảm biến nhiệt độ', summary: 'Mạng cảm biến nhiệt độ và khói gửi dữ liệu về trung tâm để cảnh báo sớm nguy cơ cháy rừng.', objectives: 'Cảnh báo sớm trong 5 phút', keywords: ['internet vạn vật', 'cảm biến', 'cảnh báo cháy'] }, 'Cùng IoT cảm biến, khác bài toán');
hardNeg('T21', { title: 'Nền tảng học lập trình trực tuyến có video bài giảng', summary: 'Website cung cấp bài giảng video và bài tập lập trình cho người mới bắt đầu, theo dõi tiến độ học.', objectives: 'Hỗ trợ tự học lập trình', keywords: ['lập trình', 'học trực tuyến', 'video'] }, 'Chung "lập trình", khác sản phẩm');
hardNeg('T24', { title: 'Thiết kế cơ sở dữ liệu cho hệ thống quản lý nhân sự', summary: 'Phân tích nghiệp vụ nhân sự và thiết kế lược đồ cơ sở dữ liệu quan hệ cho phần mềm quản lý nhân sự.', objectives: 'Hoàn thiện lược đồ chuẩn hóa', keywords: ['cơ sở dữ liệu', 'nhân sự', 'thiết kế'] }, 'Chung "cơ sở dữ liệu", khác mục tiêu');
hardNeg('T12', { title: 'Dự báo thời tiết ngắn hạn bằng học máy', summary: 'Dùng dữ liệu khí tượng huấn luyện mô hình học máy dự báo nhiệt độ, lượng mưa ngắn hạn.', objectives: 'Sai số nhiệt độ dưới 1 độ', keywords: ['học máy', 'dự báo', 'thời tiết'] }, 'Cùng "dự báo ... học máy", khác miền');
hardNeg('T28', { title: 'Quản lý chuỗi cung ứng nông sản bằng ứng dụng web', summary: 'Ứng dụng web quản lý kho, vận chuyển và đơn hàng nông sản giữa nhà vườn và đại lý.', objectives: 'Giảm thất thoát nông sản', keywords: ['nông sản', 'chuỗi cung ứng', 'ứng dụng web'] }, 'Cùng "nông sản", khác công nghệ và mục tiêu');

writeFileSync(new URL('./pairs.json', import.meta.url), JSON.stringify(P.map((p, i) => ({ id: `P${String(i + 1).padStart(3, '0')}`, ...p })), null, 1));
console.log(P.length, 'cặp;', P.filter((p) => p.label).length, 'trùng');
