// Thêm dữ liệu lịch sử cho trang thống kê trên DB dev/demo: 3 đợt năm học trước, sinh viên các khóa cũ, đề tài đã kết thúc
// (Đã đóng kèm kết quả / Bị từ chối / Đã hủy) đi đúng bảng chuyển trạng thái, có StatusHistory. Chạy sau `prisma db seed`:
// npm run demo:stats -w @nckh/api. Chạy lại không nhân đôi (đã có đợt 2023-2024 thì bỏ qua).
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROUND_CONFIG, findTransition } from '@nckh/shared';
import { assertSeedAllowedDb, SEED_PASSWORD } from '../prisma/seed.js';
import { passwordHasher } from '../src/lib/password.js';
import { nextTopicCode } from '../src/modules/topics/code.js';
import { compare, contentHash } from '../src/modules/similarity/engine.js';

const DAY = 86400000;
const MAJOR_MOET = { CNTT: '7480201', KTPM: '7480103', HTTT: '7480104' };
// [năm học, khóa, số đề tài] – số đề tài tăng dần để biểu đồ theo năm có xu hướng
export const YEARS = [
  ['2023-2024', 26, 14],
  ['2024-2025', 27, 20],
  ['2025-2026', 28, 26],
];
const UR = ['REQUEST_ADVISOR', 'ACCEPT_ADVISING', 'SUBMIT_FOR_REVIEW'];
const IP = [...UR, 'APPROVE'];
const PATHS = {
  CLOSED: [...IP, 'REQUEST_CLOSE', 'CONFIRM_CLOSE'],
  CLOSED_REVISED: [...UR, 'REQUEST_REVISION', 'RESUBMIT', 'APPROVE', 'REQUEST_CLOSE', 'CONFIRM_CLOSE'],
  REJECTED: [...UR, 'REJECT'],
  CANCELLED: [...IP, 'CANCEL'],
};
// Vòng 10 đề tài: 7 đóng, 2 từ chối, 1 hủy; kết quả lệch về Khá/Đạt như thực tế
const PLAN = ['CLOSED', 'CLOSED', 'REJECTED', 'CLOSED_REVISED', 'CLOSED', 'CANCELLED', 'CLOSED', 'CLOSED', 'REJECTED', 'CLOSED_REVISED'];
const RESULTS = ['GOOD', 'PASS', 'EXCELLENT', 'GOOD', 'PASS', 'GOOD', 'FAIL', 'EXCELLENT', 'GOOD', 'PASS', 'GOOD'];
const REASONS = {
  REQUEST_REVISION: 'Cần làm rõ phương pháp đánh giá và bộ dữ liệu',
  REJECT: 'Đề tài trùng định hướng với đề tài đã thực hiện, chưa có điểm mới',
  CANCEL: 'Nhóm không đủ thành viên để tiếp tục thực hiện',
};
// Chủ đề theo lĩnh vực của seed: [tên, từ khóa chuyên môn]; tên ghép với ngữ cảnh để ra tên đề tài khác nhau
export const SUBJECTS = {
  AI: [
    ['Nhận dạng chữ viết tay tiếng Việt bằng học sâu', ['học sâu', 'nhận dạng chữ viết tay', 'mạng nơ-ron tích chập', 'tiếng Việt']],
    ['Chatbot hỏi đáp quy chế đào tạo', ['chatbot', 'xử lý ngôn ngữ tự nhiên', 'mô hình ngôn ngữ lớn', 'truy xuất tài liệu']],
    ['Phát hiện tin giả tiếng Việt', ['tin giả', 'phân loại văn bản', 'PhoBERT', 'xử lý ngôn ngữ tự nhiên']],
    ['Tóm tắt văn bản pháp luật tự động', ['tóm tắt văn bản', 'văn bản pháp luật', 'mô hình Transformer', 'xử lý ngôn ngữ tự nhiên']],
  ],
  WEB: [
    ['Hệ thống đặt lịch phòng thí nghiệm', ['đặt lịch', 'ứng dụng web', 'React', 'quản lý tài nguyên']],
    ['Cổng thông tin việc làm sinh viên', ['việc làm', 'cổng thông tin', 'tìm kiếm toàn văn', 'Node.js']],
    ['Nền tảng quản lý câu lạc bộ', ['câu lạc bộ', 'quản lý sự kiện', 'ứng dụng web', 'phân quyền']],
    ['Website bán sách cũ cho sinh viên', ['thương mại điện tử', 'sách cũ', 'thanh toán trực tuyến', 'ứng dụng web']],
  ],
  MOBILE: [
    ['Ứng dụng điểm danh bằng mã QR', ['điểm danh', 'mã QR', 'Flutter', 'ứng dụng di động']],
    ['Ứng dụng học từ vựng tiếng Anh', ['học từ vựng', 'lặp lại ngắt quãng', 'React Native', 'ứng dụng di động']],
    ['Ứng dụng chia sẻ xe đi học', ['chia sẻ xe', 'định vị GPS', 'bản đồ số', 'ứng dụng di động']],
    ['Ứng dụng theo dõi sức khỏe tinh thần', ['sức khỏe tinh thần', 'nhật ký cảm xúc', 'thông báo đẩy', 'ứng dụng di động']],
  ],
  SEC: [
    ['Phát hiện mã độc Android bằng học máy', ['mã độc', 'Android', 'học máy', 'phân tích tĩnh']],
    ['Đánh giá lỗ hổng ứng dụng web', ['lỗ hổng bảo mật', 'OWASP Top 10', 'kiểm thử xâm nhập', 'ứng dụng web']],
    ['Hệ thống phát hiện xâm nhập mạng nội bộ', ['phát hiện xâm nhập', 'IDS', 'phân tích lưu lượng mạng', 'học máy']],
    ['Xác thực đa yếu tố cho cổng sinh viên', ['xác thực đa yếu tố', 'OTP', 'quản lý danh tính', 'an toàn thông tin']],
  ],
  DATA: [
    ['Dự báo kết quả học tập của sinh viên', ['dự báo', 'kết quả học tập', 'học máy', 'khai phá dữ liệu giáo dục']],
    ['Phân tích cảm xúc phản hồi môn học', ['phân tích cảm xúc', 'phản hồi sinh viên', 'xử lý ngôn ngữ tự nhiên', 'khai phá văn bản']],
    ['Trực quan hóa dữ liệu tuyển sinh', ['trực quan hóa dữ liệu', 'tuyển sinh', 'dashboard', 'Power BI']],
    ['Gợi ý môn học tự chọn', ['hệ gợi ý', 'lọc cộng tác', 'môn học tự chọn', 'học máy']],
  ],
  IOT: [
    ['Giám sát chất lượng không khí lớp học', ['chất lượng không khí', 'cảm biến', 'ESP32', 'MQTT']],
    ['Nhà kính thông minh tưới cây tự động', ['nhà kính thông minh', 'tưới tự động', 'cảm biến độ ẩm', 'Arduino']],
    ['Bãi giữ xe thông minh', ['bãi giữ xe', 'nhận dạng biển số', 'RFID', 'Internet vạn vật']],
    ['Cảnh báo cháy sớm cho ký túc xá', ['cảnh báo cháy', 'cảm biến khói', 'ESP32', 'thông báo thời gian thực']],
  ],
};
const CONTEXTS = ['tại Trường Đại học Văn Lang', 'cho sinh viên Khoa CNTT', 'trên nền tảng điện toán đám mây', 'cho doanh nghiệp vừa và nhỏ'];
const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ'];
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Ngọc', 'Quốc', 'Thanh', 'Gia', 'Hữu', 'Bảo'];
const GIVEN = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Linh', 'Long', 'My', 'Nam', 'Phúc', 'Quân', 'Tâm', 'Trang', 'Vy', 'Yến'];
const nameOf = (i) => `${FAMILY[i % 12]} ${MIDDLE[(i * 5) % 9]} ${GIVEN[(i * 7) % 17]}`;

/** Năm học "2024-2025" → các mốc của đợt (đăng ký tháng 9, kết thúc tháng 6 năm sau) */
const roundDates = (academicYear) => {
  const y = Number(academicYear.slice(0, 4));
  return {
    regOpenAt: new Date(Date.UTC(y, 8, 1, 1)),
    regCloseAt: new Date(Date.UTC(y, 9, 15, 16)),
    reviewDeadline: new Date(Date.UTC(y, 10, 15, 16)),
    endAt: new Date(Date.UTC(y + 1, 5, 30, 16)),
  };
};

export async function demoStats(prisma) {
  if (process.env.NODE_ENV === 'production') throw new Error('Không chạy dữ liệu demo trên môi trường production.');
  await assertSeedAllowedDb(prisma);
  const faculty = await prisma.faculty.findFirst({ where: { code: 'CNTT' } });
  if (!faculty) throw new Error('Chưa có dữ liệu mẫu: chạy `npx prisma db seed` trước.');
  if (await prisma.round.findFirst({ where: { facultyId: faculty.id, academicYear: YEARS[0][0] } })) return 0;

  const fields = await prisma.field.findMany({ where: { code: { in: Object.keys(SUBJECTS) } }, orderBy: { code: 'asc' } });
  const majors = await prisma.major.findMany({ where: { facultyId: faculty.id, code: { in: Object.keys(MAJOR_MOET) } }, orderBy: { code: 'asc' } });
  const lecturers = await prisma.user.findMany({ where: { role: 'LECTURER', facultyId: faculty.id }, orderBy: { code: 'asc' } });
  const staff = await prisma.user.findFirst({ where: { role: 'STAFF', staffScopes: { some: { facultyId: faculty.id } } }, orderBy: { code: 'asc' } });
  if (!fields.length || !majors.length || !lecturers.length || !staff) throw new Error('Dữ liệu mẫu thiếu lĩnh vực, ngành, giảng viên hoặc cán bộ.');
  const passwordHash = await passwordHasher.hash(SEED_PASSWORD); // băm trước transaction
  const thresholds = DEFAULT_ROUND_CONFIG.similarity;

  let total = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const [academicYear, cohort, count] of YEARS) {
        const dates = roundDates(academicYear);
        const round = await tx.round.create({
          data: { facultyId: faculty.id, name: `Đợt NCKH sinh viên ${academicYear}`, academicYear, ...dates, config: {} },
        });
        const classes = [];
        for (const m of majors) classes.push(await tx.class.create({ data: { majorId: m.id, code: `71K${cohort}${m.code}01` } }));

        for (let i = 0; i < count; i += 1) {
          const n = total + i; // chỉ số toàn cục để tên/lĩnh vực/GV phân bố đều giữa các năm
          const major = majors[n % majors.length];
          const leader = await tx.user.create({
            data: {
              code: `${cohort - 6}${MAJOR_MOET[major.code]}${String(i + 1).padStart(4, '0')}`, // khóa K26 nhập học 2020
              email: `k${cohort}.${major.code.toLowerCase()}${i + 1}@nckh.example`,
              fullName: nameOf(n + 100),
              passwordHash,
              role: 'STUDENT',
              facultyId: faculty.id,
              classId: classes[n % majors.length].id,
              mustChangePassword: true,
            },
          });
          const field = fields[(n * 5) % fields.length];
          const [subject, keywords] = SUBJECTS[field.code][n % 4];
          const title = `${subject} ${CONTEXTS[(n >> 2) % 4]}`;
          const content = {
            title,
            keywords,
            fieldId: field.id,
            summary: `Đề tài "${title}" khảo sát nhu cầu thực tế, đề xuất giải pháp, hiện thực bản mẫu và đánh giá bằng số liệu.`,
            objectives: `Xây dựng và đánh giá giải pháp cho bài toán ${title.toLowerCase()}.`,
          };
          const t0 = new Date(dates.regOpenAt.getTime() + (3 + (i % 20)) * DAY);
          const topic = await tx.topic.create({
            data: { ...content, code: await nextTopicCode(tx, academicYear), roundId: round.id, facultyId: faculty.id, createdAt: t0 },
          });
          await tx.topicMember.create({ data: { topicId: topic.id, userId: leader.id, role: 'LEADER', joinedAt: t0 } });

          const lecturer = lecturers[(n * 3) % lecturers.length];
          const path = PATHS[PLAN[n % PLAN.length]];
          const actorOf = { STUDENT: leader, LECTURER: lecturer, STAFF: staff };
          let status = 'DRAFT';
          let submission = null;
          let seq = 0;
          for (const [k, action] of path.entries()) {
            const tr = findTransition(action);
            if (tr?.from !== status) throw new Error(`Sai bảng chuyển trạng thái: ${title} – ${action} khi ${status}`);
            // Bước xét duyệt trong học kỳ 1, bước đóng cuối năm học
            const when = ['REQUEST_CLOSE', 'CONFIRM_CLOSE'].includes(action)
              ? new Date(dates.endAt.getTime() - (40 - k - (i % 20)) * DAY)
              : new Date(t0.getTime() + (k + 1) * 2 * DAY);
            const actor = actorOf[tr.actors[0]];
            const reason = REASONS[action] ?? null;
            if (action === 'REQUEST_ADVISOR') {
              await tx.advisorRequest.create({ data: { topicId: topic.id, lecturerId: lecturer.id, createdAt: when } });
            } else if (action === 'ACCEPT_ADVISING') {
              await tx.advisorRequest.updateMany({ where: { topicId: topic.id, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: when } });
              await tx.advising.create({ data: { topicId: topic.id, lecturerId: lecturer.id, startAt: when } });
            } else if (tr.needsSimilarity) {
              seq += 1;
              const result = compare({ candidate: content, corpus: [], thresholds, synonyms: [] });
              const check = await tx.similarityCheck.create({
                data: {
                  topicId: topic.id,
                  algorithmVersion: result.algorithmVersion,
                  thresholds,
                  contentHash: contentHash(content),
                  corpusSize: result.corpusSize,
                  level: result.level,
                  matches: result.matches,
                  status: 'OK',
                  createdAt: when,
                },
              });
              submission = await tx.submission.create({
                data: { topicId: topic.id, seq, payload: { ...content, documentIds: [] }, createdById: actor.id, createdAt: when, similarityCheckId: check.id },
              });
            } else if (['REQUEST_REVISION', 'REJECT', 'APPROVE'].includes(action)) {
              await tx.reviewDecision.create({ data: { submissionId: submission.id, action, reason, decidedById: actor.id, decidedAt: when } });
              if (action === 'APPROVE') {
                await tx.milestone.createMany({
                  data: [
                    ['Đề cương chi tiết', 'Báo cáo đề cương', 60],
                    ['Báo cáo tổng kết', 'Báo cáo cuối và mã nguồn', 200],
                  ].map(([name, output, d], o) => ({ topicId: topic.id, order: o + 1, createdById: lecturer.id, name, output, dueAt: new Date(t0.getTime() + d * DAY) })),
                });
              }
            } else if (action === 'CANCEL') {
              await tx.changeRequest.create({
                data: {
                  topicId: topic.id,
                  type: 'CANCEL',
                  payload: { topicStatus: 'IN_PROGRESS', requesterRole: 'STUDENT' },
                  reason,
                  status: 'ACCEPTED',
                  createdById: leader.id,
                  decidedById: actor.id,
                  decisionNote: reason,
                  createdAt: when,
                  decidedAt: when,
                },
              });
            } else if (action === 'REQUEST_CLOSE') {
              await tx.milestone.updateMany({ where: { topicId: topic.id }, data: { evaluation: 'PASSED' } });
              await tx.resultVersion.create({
                data: { topicId: topic.id, version: 1, result: RESULTS[n % RESULTS.length], summary: 'Nhóm hoàn thành mục tiêu đề ra.', createdById: actor.id, createdAt: when },
              });
            }
            await tx.statusHistory.create({ data: { topicId: topic.id, from: tr.from, to: tr.to, action, actorId: actor.id, reason, at: when } });
            status = tr.to;
          }
          await tx.topic.update({ where: { id: topic.id }, data: { status, version: path.length } });
        }
        total += count;
      }
    },
    { timeout: 120000 },
  );
  return total;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const n = await demoStats(prisma);
    console.log(n ? `Đã thêm ${n} đề tài lịch sử (${YEARS.map((y) => y[0]).join(', ')}).` : 'Đã có dữ liệu lịch sử, không thêm gì.');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
