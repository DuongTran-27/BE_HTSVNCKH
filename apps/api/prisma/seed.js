// Dữ liệu mẫu CHỈ cho dev/demo (T203): 1 khoa, 3 ngành, lĩnh vực CNTT, 1 đợt, 1 quản trị, 2 cán bộ, 8 GV, 40 SV,
// 30 đề tài (3 đề tài mỗi trạng thái), từ điển đồng nghĩa.
// Chạy (trong apps/api): `npx prisma db seed` – chỉ trên DB đã bật cờ nckh.seed_allowed (README). KHÔNG BAO GIỜ trên production:
// mọi tài khoản (kể cả quản trị QT001) dùng chung mật khẩu công khai SEED_PASSWORD.
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { DB_LEVEL_CHECK_SQL } from '../scripts/test-db-guard.js';
import { DEFAULT_ROUND_CONFIG, findTransition } from '@nckh/shared';
import { passwordHasher } from '../src/lib/password.js';
import { nextTopicCode } from '../src/modules/topics/code.js';
import { compare, contentHash } from '../src/modules/similarity/engine.js';
import { PENDING_SAME_ROUND_STATUSES, PUBLIC_CORPUS_STATUSES } from '../src/modules/similarity/service.js';

export const SEED_PASSWORD = 'Nckh@2026-dev';
// Mã ngành Bộ GD&ĐT theo thứ tự ngành trong seed (CNTT, KTPM, HTTT); sinh viên thứ i thuộc ngành i % 3
const MAJOR_MOET = ['7480201', '7480103', '7480104'];
/** MSSV kiểu Văn Lang của sinh viên mẫu thứ i: 2 số năm nhập học + mã ngành + 4 số thứ tự, vd. 2374802010027 */
export const seedStudentCode = (i) => `23${MAJOR_MOET[i % 3]}${String(i).padStart(4, '0')}`;

const DAY = 86400000;
const CORPUS_STATUSES = [...PUBLIC_CORPUS_STATUSES, ...PENDING_SAME_ROUND_STATUSES]; // mọi đề tài mẫu cùng một đợt

const FIELDS = [
  ['AI', 'Trí tuệ nhân tạo'],
  ['WEB', 'Phát triển ứng dụng web'],
  ['MOBILE', 'Ứng dụng di động'],
  ['SEC', 'An toàn thông tin'],
  ['DATA', 'Khoa học dữ liệu'],
  ['IOT', 'Internet vạn vật'],
];

// term → canonical (FR06 mục 3): cả hai dạng quy về cùng một token khi so.
const SYNONYMS = [
  ['deep learning', 'học sâu'],
  ['machine learning', 'học máy'],
  ['nhận dạng', 'nhận diện'],
  ['ai', 'trí tuệ nhân tạo'],
  ['mobile app', 'ứng dụng di động'],
  ['nlp', 'xử lý ngôn ngữ tự nhiên'],
  ['computer vision', 'thị giác máy tính'],
  ['iot', 'internet vạn vật'],
  ['database', 'cơ sở dữ liệu'],
  ['blockchain', 'chuỗi khối'],
];

// [mã lĩnh vực, tên, từ khóa]
const TOPICS = [
  ['AI', 'Nhận diện biển số xe bằng học sâu', ['học sâu', 'nhận diện', 'biển số xe', 'thị giác máy tính']],
  ['WEB', 'Hệ thống quản lý thư viện số cho trường đại học', ['thư viện số', 'ứng dụng web', 'quản lý']],
  ['MOBILE', 'Ứng dụng di động hỗ trợ học từ vựng tiếng Anh', ['ứng dụng di động', 'từ vựng', 'tiếng Anh']],
  ['SEC', 'Phát hiện mã độc Android bằng học máy', ['mã độc', 'android', 'học máy', 'an toàn thông tin']],
  [
    'DATA',
    'Phân tích cảm xúc bình luận sản phẩm thương mại điện tử',
    ['phân tích cảm xúc', 'xử lý ngôn ngữ tự nhiên', 'thương mại điện tử'],
  ],
  ['IOT', 'Hệ thống tưới cây tự động dùng cảm biến độ ẩm', ['internet vạn vật', 'cảm biến', 'nông nghiệp thông minh']],
  ['AI', 'Chatbot tư vấn tuyển sinh dựa trên mô hình ngôn ngữ', ['chatbot', 'mô hình ngôn ngữ', 'tuyển sinh']],
  ['WEB', 'Nền tảng đặt lịch khám bệnh trực tuyến', ['đặt lịch', 'y tế', 'ứng dụng web']],
  ['MOBILE', 'Ứng dụng theo dõi chi tiêu cá nhân', ['ứng dụng di động', 'tài chính cá nhân', 'thống kê']],
  [
    'SEC',
    'Phát hiện tấn công SQL injection trên ứng dụng web',
    ['sql injection', 'tường lửa ứng dụng', 'an toàn thông tin'],
  ],
  ['DATA', 'Dự báo kết quả học tập của sinh viên', ['dự báo', 'học máy', 'kết quả học tập', 'khai phá dữ liệu']],
  ['IOT', 'Giám sát chất lượng không khí trong lớp học', ['internet vạn vật', 'chất lượng không khí', 'cảm biến']],
  ['AI', 'Nhận dạng chữ viết tay tiếng Việt', ['nhận dạng', 'chữ viết tay', 'học sâu']],
  ['WEB', 'Website thương mại điện tử cho hợp tác xã nông sản', ['thương mại điện tử', 'nông sản', 'ứng dụng web']],
  ['MOBILE', 'Ứng dụng điểm danh sinh viên bằng mã QR', ['điểm danh', 'mã QR', 'ứng dụng di động']],
  ['SEC', 'Xác thực hai lớp cho hệ thống quản lý đào tạo', ['xác thực hai lớp', 'bảo mật', 'đào tạo']],
  ['DATA', 'Hệ gợi ý khóa học trực tuyến', ['hệ gợi ý', 'lọc cộng tác', 'học trực tuyến']],
  ['IOT', 'Nhà thông minh điều khiển bằng giọng nói', ['nhà thông minh', 'giọng nói', 'internet vạn vật']],
  ['AI', 'Tóm tắt văn bản tiếng Việt tự động', ['tóm tắt văn bản', 'xử lý ngôn ngữ tự nhiên', 'tiếng Việt']],
  ['WEB', 'Cổng thông tin việc làm cho sinh viên', ['việc làm', 'cổng thông tin', 'ứng dụng web']],
  ['MOBILE', 'Ứng dụng bản đồ khuôn viên trường', ['bản đồ', 'định vị', 'ứng dụng di động']],
  ['SEC', 'Ứng dụng chuỗi khối trong quản lý văn bằng', ['chuỗi khối', 'văn bằng', 'xác minh']],
  ['DATA', 'Trực quan hóa dữ liệu tuyển sinh', ['trực quan hóa', 'tuyển sinh', 'dashboard']],
  ['IOT', 'Hệ thống cảnh báo cháy sớm cho ký túc xá', ['cảnh báo cháy', 'cảm biến', 'internet vạn vật']],
  ['AI', 'Phát hiện tin giả trên mạng xã hội', ['tin giả', 'mạng xã hội', 'học máy']],
  ['WEB', 'Hệ thống thi trắc nghiệm trực tuyến', ['thi trắc nghiệm', 'ứng dụng web', 'chống gian lận']],
  ['MOBILE', 'Ứng dụng hỗ trợ người khiếm thị đọc biển báo', ['khiếm thị', 'thị giác máy tính', 'ứng dụng di động']],
  ['SEC', 'Phát hiện xâm nhập mạng bằng học sâu', ['phát hiện xâm nhập', 'học sâu', 'an ninh mạng']],
  ['DATA', 'Phân cụm khách hàng cho chuỗi bán lẻ', ['phân cụm', 'khách hàng', 'khai phá dữ liệu']],
  ['IOT', 'Bãi đỗ xe thông minh trong khuôn viên trường', ['bãi đỗ xe', 'cảm biến', 'internet vạn vật']],
];

const RA = ['REQUEST_ADVISOR'];
const HA = [...RA, 'ACCEPT_ADVISING'];
const UR = [...HA, 'SUBMIT_FOR_REVIEW'];
const IP = [...UR, 'APPROVE'];
const WC = [...IP, 'REQUEST_CLOSE'];
// Chuỗi action của từng đề tài (theo thứ tự TOPICS); mỗi trạng thái đúng 3 đề tài, có cả các nhánh quay lui.
const PATHS = [
  [],
  [],
  [...RA, 'DECLINE_ADVISING'], // DRAFT
  RA,
  RA,
  [...RA, 'WITHDRAW_ADVISOR_REQUEST', ...RA], // WAITING_ADVISOR
  HA,
  HA,
  HA, // HAS_ADVISOR
  UR,
  UR,
  [...UR, 'REQUEST_REVISION', 'RESUBMIT'], // UNDER_REVIEW
  [...UR, 'REQUEST_REVISION'],
  [...UR, 'REQUEST_REVISION'],
  [...UR, 'REQUEST_REVISION', 'RESUBMIT', 'REQUEST_REVISION'],
  [...UR, 'REJECT'],
  [...UR, 'REJECT'],
  [...UR, 'REQUEST_REVISION', 'RESUBMIT', 'REJECT'], // REJECTED
  IP,
  IP,
  [...UR, 'REQUEST_REVISION', 'RESUBMIT', 'APPROVE'], // IN_PROGRESS
  [...IP, 'CANCEL'],
  [...IP, 'CANCEL'],
  [...IP, 'CANCEL'], // CANCELLED
  WC,
  WC,
  [...WC, 'RETURN_TO_ADVISOR', 'REQUEST_CLOSE'], // WAITING_CLOSE
  [...WC, 'CONFIRM_CLOSE'],
  [...WC, 'CONFIRM_CLOSE'],
  [...WC, 'RETURN_TO_ADVISOR', 'REQUEST_CLOSE', 'CONFIRM_CLOSE'],
];
const RESULTS = ['EXCELLENT', 'GOOD', 'PASS'];

const REASONS = {
  DECLINE_ADVISING: 'Giảng viên đã đủ hướng nghiên cứu khác trong đợt này',
  REQUEST_REVISION: 'Cần làm rõ mục tiêu và phạm vi thực nghiệm',
  REJECT: 'Nội dung chưa phù hợp với định hướng nghiên cứu của khoa',
  CANCEL: 'Nhóm đề nghị hủy vì không đủ điều kiện thực hiện',
  RETURN_TO_ADVISOR: 'Thiếu nhận xét tổng kết chi tiết của giảng viên',
};

const JUSTIFICATION =
  'Đề tài của nhóm có một số từ khóa và phần mô tả phương pháp chung giống các đề tài trong kho vì cùng theo khung ' +
  'đề cương của khoa. Tuy vậy bài toán, đối tượng người dùng, bộ dữ liệu thử nghiệm và sản phẩm đầu ra hoàn toàn ' +
  'khác: nhóm giải quyết nhu cầu riêng của đơn vị được khảo sát, tự thu thập dữ liệu và đánh giá bằng kịch bản riêng. ' +
  'Nhóm cam kết trích dẫn đầy đủ các đề tài liên quan trong báo cáo tổng kết.';

const GENERIC =
  'Đề tài khảo sát các nghiên cứu liên quan trong và ngoài nước, phân tích yêu cầu của người dùng thực tế ' +
  'tại Khoa Công nghệ Thông tin, sau đó đề xuất kiến trúc giải pháp, lựa chọn công nghệ phù hợp và hiện thực một ' +
  'bản mẫu có thể vận hành. Nhóm xây dựng bộ dữ liệu thử nghiệm, thiết kế kịch bản đánh giá với các chỉ số định ' +
  'lượng rõ ràng, so sánh với một số phương pháp phổ biến hiện nay và phân tích ưu nhược điểm của từng cách tiếp ' +
  'cận. Kết quả dự kiến gồm mã nguồn, báo cáo tổng kết, hướng dẫn triển khai và một bài báo khoa học gửi hội nghị ' +
  'sinh viên nghiên cứu khoa học cấp trường. Đề tài cũng nêu các giới hạn còn tồn tại và hướng phát triển tiếp theo.';

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'];
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Ngọc', 'Quốc', 'Thanh', 'Gia', 'Hữu'];
const GIVEN = [
  'An',
  'Bình',
  'Châu',
  'Dũng',
  'Giang',
  'Hà',
  'Khoa',
  'Linh',
  'Mai',
  'Nam',
  'Phúc',
  'Quân',
  'Sơn',
  'Trang',
  'Vy',
];
const nameOf = (i) => `${FAMILY[i % 10]} ${MIDDLE[(i * 3) % 8]} ${GIVEN[(i * 7) % 15]}`;

// Xác nhận gắn với CHÍNH DB đích (review bao-mat T203 #1): trên Supabase mọi DB tên "postgres" nên tên DB không phân
// biệt được demo với production. Chỉ chạy khi DB đã được bật cờ nckh.seed_allowed (làm một lần trên DB dev/demo)
// hoặc là DB test cục bộ "*_test" (DB_LEVEL_CHECK_SQL, cùng chốt NFR08 của test).
export async function assertSeedAllowedDb(prisma) {
  // Đọc cờ ở mức database trong pg_db_role_setting (setrole = 0): phiên không ghi đè được bằng SET hay `options` trên URL.
  const [{ db, allowed }] = await prisma.$queryRaw`
    SELECT current_database() AS db, EXISTS (
      SELECT 1 FROM pg_db_role_setting s JOIN pg_database d ON d.oid = s.setdatabase
      WHERE d.datname = current_database() AND s.setrole = 0 AND 'nckh.seed_allowed=on' = ANY (s.setconfig)
    ) AS allowed`;
  if (allowed) return;
  try {
    await prisma.$executeRawUnsafe(DB_LEVEL_CHECK_SQL); // hằng số, không chứa dữ liệu người dùng
  } catch {
    throw new Error(
      `Từ chối nạp dữ liệu mẫu vào database "${db}": database chưa bật cờ cho phép dữ liệu mẫu. ` +
        `Chỉ với DB dev/demo, chạy một lần: ALTER DATABASE "${db}" SET nckh.seed_allowed = 'on'; rồi mở kết nối mới. ` +
        'Không bao giờ bật cờ này trên production.',
    );
  }
}

// Năm học bắt đầu tháng 8 (giờ server).
const academicYearOf = (d) => {
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
};

// Trạng thái của một đề tài ngay trước thời điểm `when` (null nếu chưa tạo) – dựng kho so FR06 đúng thời điểm gửi.
const statusBefore = (timeline, when) => {
  if (when <= timeline.t0) return null;
  let status = 'DRAFT';
  for (const step of timeline.steps) if (step.at < when) status = step.to;
  return status;
};

/**
 * Mốc thời gian tính từ `now` (giờ server, quy tắc 8): đợt luôn đang mở đăng ký lúc chạy seed, lịch sử nằm trong quá khứ.
 */
export async function seed(prisma, { now = new Date() } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Không chạy dữ liệu mẫu trên môi trường production.');
  await assertSeedAllowedDb(prisma);
  if (await prisma.user.count()) {
    throw new Error(
      'Database đã có người dùng – dữ liệu mẫu chỉ nạp vào database trống (vd. sau `prisma migrate reset`).',
    );
  }
  const passwordHash = await passwordHasher.hash(SEED_PASSWORD); // một lần: Argon2id chậm có chủ ý
  const account = (role, code, fullName, extra = {}) => ({
    code,
    email: `${code.toLowerCase()}@nckh.example`,
    fullName,
    passwordHash,
    role,
    mustChangePassword: true,
    ...extra,
  });

  const nowMs = now.getTime();
  const regOpenAt = new Date(nowMs - 60 * DAY);
  const academicYear = academicYearOf(regOpenAt);
  const timelines = TOPICS.map((_, i) => {
    const t0 = new Date(regOpenAt.getTime() + 4 * DAY + i * 2 * 3600000);
    const steps = PATHS[i].map((action, k) => ({
      to: findTransition(action)?.to,
      at: new Date(t0.getTime() + (k + 1) * DAY),
    }));
    return { t0, steps };
  });
  const synonyms = SYNONYMS.map(([term, canonical]) => ({ term, canonical }));

  await prisma.$transaction(
    async (tx) => {
      const faculty = await tx.faculty.create({ data: { code: 'CNTT', name: 'Khoa Công nghệ Thông tin' } });
      // Theo cách đặt mã của ĐH Văn Lang: [viết tắt, tên ngành, lớp khóa K29 (nhập học 2023)]; mã ngành ở MAJOR_MOET
      const majors = [
        ['CNTT', 'Công nghệ thông tin', '71K29CNTT08'],
        ['KTPM', 'Kỹ thuật phần mềm', '71K29KTPM02'],
        ['HTTT', 'Hệ thống thông tin', '71K29HTTT01'],
      ];
      const classes = [];
      for (const [code, name, classCode] of majors) {
        const major = await tx.major.create({ data: { facultyId: faculty.id, code, name } });
        classes.push(await tx.class.create({ data: { majorId: major.id, code: classCode } }));
      }
      const fields = {};
      for (const [code, name] of FIELDS) fields[code] = await tx.field.create({ data: { code, name } });
      await tx.synonym.createMany({ data: SYNONYMS.map(([term, canonical]) => ({ term, canonical })) });

      const round = await tx.round.create({
        data: {
          facultyId: faculty.id,
          name: `Đợt nghiên cứu khoa học sinh viên ${academicYear}`,
          academicYear,
          regOpenAt,
          regCloseAt: new Date(nowMs + 90 * DAY),
          reviewDeadline: new Date(nowMs + 120 * DAY),
          endAt: new Date(nowMs + 270 * DAY),
          config: {},
        },
      });

      await tx.user.create({ data: account('ADMIN', 'QT001', 'Quản trị hệ thống') });
      const staff = [];
      for (let i = 1; i <= 2; i += 1) {
        staff.push(
          await tx.user.create({
            data: {
              ...account('STAFF', `CB00${i}`, nameOf(i + 50), { facultyId: faculty.id }),
              staffScopes: { create: { facultyId: faculty.id } },
            },
          }),
        );
      }
      const lecturers = [];
      for (let i = 1; i <= 8; i += 1) {
        lecturers.push(
          await tx.user.create({
            data: account('LECTURER', `GV00${i}`, `TS. ${nameOf(i + 60)}`, { facultyId: faculty.id }),
          }),
        );
      }
      const students = [];
      for (let i = 1; i <= 40; i += 1) {
        const code = seedStudentCode(i);
        students.push(
          await tx.user.create({
            data: account('STUDENT', code, nameOf(i), { facultyId: faculty.id, classId: classes[i % 3].id }),
          }),
        );
      }

      // Tạo đủ 30 đề tài trước để kho so FR06 của mỗi lần gửi chứa được cả đề tài đứng sau trong vòng lặp.
      const created = [];
      for (const [i, [fieldCode, title, keywords]] of TOPICS.entries()) {
        const leader = students[i];
        const { t0 } = timelines[i];
        const content = {
          title,
          keywords,
          fieldId: fields[fieldCode].id,
          summary: `Đề tài "${title}" tập trung vào ${keywords.join(', ')}. ${GENERIC}`,
          objectives: `Xây dựng và đánh giá giải pháp cho bài toán ${title.toLowerCase()}.`,
        };
        const topic = await tx.topic.create({
          data: {
            ...content,
            code: await nextTopicCode(tx, round.academicYear),
            roundId: round.id,
            facultyId: faculty.id,
            createdAt: t0,
          },
        });
        await tx.topicMember.create({ data: { topicId: topic.id, userId: leader.id, role: 'LEADER', joinedAt: t0 } });
        if (i < 10) {
          const member = students[30 + i];
          await tx.invitation.create({
            data: { topicId: topic.id, inviteeId: member.id, status: 'ACCEPTED', createdAt: t0, respondedAt: t0 },
          });
          await tx.topicMember.create({ data: { topicId: topic.id, userId: member.id, role: 'MEMBER', joinedAt: t0 } });
        }
        created.push({ topic, content });
      }

      for (const [i, { topic, content }] of created.entries()) {
        const leader = students[i];
        const lecturer = lecturers[i % 8];
        const { t0 } = timelines[i];
        const actorOf = { STUDENT: leader, LECTURER: lecturer, STAFF: staff[0] };
        let status = 'DRAFT';
        let seq = 0;
        let submission = null;
        for (const [k, action] of PATHS[i].entries()) {
          const tr = findTransition(action);
          if (tr?.from !== status)
            throw new Error(`Seed sai bảng chuyển trạng thái: ${content.title} – ${action} khi ${status}`);
          const when = new Date(t0.getTime() + (k + 1) * DAY);
          const actor = actorOf[tr.actors[0]];
          const reason = REASONS[action] ?? null;
          const pending = { topicId: topic.id, status: 'PENDING' };
          if (action === 'REQUEST_ADVISOR') {
            await tx.advisorRequest.create({ data: { topicId: topic.id, lecturerId: lecturer.id, createdAt: when } });
          } else if (['ACCEPT_ADVISING', 'DECLINE_ADVISING', 'WITHDRAW_ADVISOR_REQUEST'].includes(action)) {
            const next = {
              ACCEPT_ADVISING: 'ACCEPTED',
              DECLINE_ADVISING: 'DECLINED',
              WITHDRAW_ADVISOR_REQUEST: 'WITHDRAWN',
            }[action];
            await tx.advisorRequest.updateMany({ where: pending, data: { status: next, reason, respondedAt: when } });
            if (action === 'ACCEPT_ADVISING')
              await tx.advising.create({ data: { topicId: topic.id, lecturerId: lecturer.id, startAt: when } });
          } else if (tr.needsSimilarity) {
            seq += 1;
            // Chạy thuật toán FR06 thật như runSimilarityCheck; điểm tên tính bằng JS thay vì pg_trgm.
            const corpus = created
              .filter((_, j) => j !== i && CORPUS_STATUSES.includes(statusBefore(timelines[j], when)))
              .map((c) => ({ id: c.topic.id, code: c.topic.code, ...c.content }));
            const thresholds = DEFAULT_ROUND_CONFIG.similarity;
            const result = compare({ candidate: content, corpus, thresholds, synonyms });
            const check = await tx.similarityCheck.create({
              data: {
                topicId: topic.id,
                algorithmVersion: result.algorithmVersion,
                thresholds,
                contentHash: contentHash(content),
                corpusSize: result.corpusSize,
                level: result.level,
                matches: result.matches,
                justification: result.level === 'HIGH' ? JUSTIFICATION : null, // mục 3: HIGH bắt buộc giải trình
                status: 'OK',
                createdAt: when,
              },
            });
            submission = await tx.submission.create({
              data: {
                topicId: topic.id,
                seq,
                payload: { ...content, documentIds: [] },
                createdById: actor.id,
                createdAt: when,
                similarityCheckId: check.id,
              },
            });
          } else if (['REQUEST_REVISION', 'REJECT', 'APPROVE'].includes(action)) {
            await tx.reviewDecision.create({
              data: { submissionId: submission.id, action, reason, decidedById: actor.id, decidedAt: when },
            });
            if (action === 'APPROVE') {
              await tx.milestone.createMany({
                data: [
                  {
                    topicId: topic.id,
                    order: 1,
                    createdById: actor.id,
                    name: 'Đề cương chi tiết',
                    output: 'Báo cáo đề cương',
                    dueAt: new Date(nowMs + 150 * DAY),
                  },
                  {
                    topicId: topic.id,
                    order: 2,
                    createdById: actor.id,
                    name: 'Báo cáo tổng kết',
                    output: 'Báo cáo cuối và mã nguồn',
                    dueAt: new Date(nowMs + 240 * DAY),
                  },
                ],
              });
            }
          } else if (action === 'CANCEL') {
            await tx.changeRequest.create({
              data: {
                topicId: topic.id,
                type: 'CANCEL',
                payload: { topicStatus: 'IN_PROGRESS', requesterRole: 'STUDENT' }, // API_GD6 §2.1
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
            if (!(await tx.resultVersion.count({ where: { topicId: topic.id } }))) {
              await tx.resultVersion.create({
                data: {
                  topicId: topic.id,
                  version: 1,
                  result: RESULTS[i % 3],
                  summary: 'Nhóm hoàn thành đầy đủ mục tiêu đề ra.',
                  createdById: actor.id,
                  createdAt: when,
                },
              });
            }
          }
          await tx.statusHistory.create({
            data: { topicId: topic.id, from: tr.from, to: tr.to, action, actorId: actor.id, reason, at: when },
          });
          status = tr.to;
        }
        await tx.topic.update({ where: { id: topic.id }, data: { status, version: PATHS[i].length } });
      }
    },
    { timeout: 120000 },
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prisma = new PrismaClient();
  try {
    const [target] = await prisma.$queryRaw`SELECT current_database() AS db, host(inet_server_addr()) AS host`;
    console.log(`Database đích: "${target.db}" tại ${target.host ?? 'unix socket'}`);
    await seed(prisma);
    console.log(`Đã nạp dữ liệu mẫu. Mật khẩu mọi tài khoản (chỉ dev): ${SEED_PASSWORD}`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
