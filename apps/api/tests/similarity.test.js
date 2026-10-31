import { describe, it, expect } from 'vitest';
import { normalize, tokenize, trigramSimilarity, applySynonyms } from '../src/modules/similarity/text.js';
import { compare, levelOf } from '../src/modules/similarity/engine.js';
import { runSimilarityCheck, presentMatches } from '../src/modules/similarity/service.js';
import { DEFAULT_ROUND_CONFIG } from '@nckh/shared';

const TH = DEFAULT_ROUND_CONFIG.similarity;
const SYN = [
  { term: 'deep learning', canonical: 'học sâu' },
  { term: 'nhận dạng', canonical: 'nhận diện' },
  { term: 'gương mặt', canonical: 'khuôn mặt' },
];

const base = {
  id: 'A', code: 'NCKH-2025-0001',
  title: 'Ứng dụng học sâu nhận diện khuôn mặt điểm danh sinh viên',
  summary: 'Xây dựng hệ thống điểm danh tự động bằng camera trong lớp học, sử dụng mô hình học sâu để nhận diện khuôn mặt sinh viên và ghi nhận chuyên cần vào cơ sở dữ liệu theo thời gian thực.',
  objectives: 'Đạt độ chính xác nhận diện trên 95 phần trăm trong điều kiện ánh sáng lớp học',
  keywords: ['học sâu', 'nhận diện khuôn mặt', 'điểm danh'],
};
const unrelated = {
  id: 'B', code: 'NCKH-2025-0002',
  title: 'Website thương mại điện tử bán sách cũ cho sinh viên',
  summary: 'Phát triển website cho phép sinh viên đăng bán và trao đổi giáo trình đã qua sử dụng, có giỏ hàng, thanh toán và đánh giá người bán.',
  objectives: 'Hoàn thiện chức năng mua bán và quản trị',
  keywords: ['thương mại điện tử', 'react', 'giáo trình'],
};

describe('Chuẩn hóa văn bản', () => {
  it('chữ thường, bỏ dấu câu, giữ dấu tiếng Việt', () => {
    expect(normalize('  Ứng dụng AI: Nhận-Diện!! ')).toBe('ứng dụng ai nhận diện');
  });
  it('tạo cặp âm tiết để "học máy" là một đặc trưng', () => {
    expect(tokenize('học máy')).toContain('học máy');
  });
  it('quy thuật ngữ tiếng Anh về dạng chuẩn', () => {
    expect(applySynonyms(normalize('Ứng dụng Deep Learning'), SYN)).toBe('ứng dụng học_sâu');
    expect(applySynonyms(normalize('Ứng dụng học sâu'), SYN)).toBe('ứng dụng học_sâu');
  });
});

describe('Điểm tên (mô phỏng pg_trgm)', () => {
  it('tên chỉ khác dấu → gần như trùng', () => {
    expect(trigramSimilarity(base.title, 'Ung dung hoc sau nhan dien khuon mat diem danh sinh vien')).toBeGreaterThan(0.95);
  });
  it('lỗi gõ nhẹ vẫn ≥ ngưỡng cao', () => {
    expect(trigramSimilarity(base.title, 'Ứng dụng học sâu nhận diện khuôn mặt điểm danh sinh viêm')).toBeGreaterThanOrEqual(TH.titleHigh);
  });
  it('đổi trật tự từ vẫn ≥ ngưỡng cao', () => {
    expect(trigramSimilarity(base.title, 'Điểm danh sinh viên nhận diện khuôn mặt ứng dụng học sâu')).toBeGreaterThanOrEqual(TH.titleHigh);
  });
  it('đề tài khác hẳn → dưới ngưỡng xem xét', () => {
    expect(trigramSimilarity(base.title, unrelated.title)).toBeLessThan(TH.titleReview);
  });
});

describe('So sánh nội dung TF-IDF', () => {
  it('thay thuật ngữ Việt bằng tiếng Anh vẫn bị cảnh báo nhờ từ điển đồng nghĩa', () => {
    const candidate = {
      title: 'Hệ thống chấm công lớp học bằng camera',
      summary: 'Xây dựng hệ thống điểm danh tự động bằng camera trong lớp học, sử dụng mô hình deep learning để nhận dạng gương mặt sinh viên và ghi nhận chuyên cần vào cơ sở dữ liệu theo thời gian thực.',
      objectives: 'Độ chính xác nhận dạng trên 95 phần trăm',
      keywords: ['deep learning', 'nhận dạng gương mặt', 'điểm danh'],
    };
    const withSyn = compare({ candidate, corpus: [base, unrelated], thresholds: TH, synonyms: SYN });
    const noSyn = compare({ candidate, corpus: [base, unrelated], thresholds: TH, synonyms: [] });
    const a = withSyn.matches.find((m) => m.topicId === 'A');
    expect(a.contentScore).toBeGreaterThan(noSyn.matches.find((m) => m.topicId === 'A').contentScore);
    expect(a.contentScore).toBeGreaterThanOrEqual(TH.contentHigh);
    expect(withSyn.level).toBe('HIGH');
    expect(withSyn.matches[0].topicId).toBe('A');
  });
  it('đề tài không liên quan → NONE', () => {
    const r = compare({ candidate: unrelated, corpus: [base], thresholds: TH, synonyms: SYN });
    expect(r.level).toBe('NONE');
  });
  it('cùng đầu vào cho cùng kết quả (tất định)', () => {
    const a = compare({ candidate: base, corpus: [unrelated], thresholds: TH });
    const b = compare({ candidate: base, corpus: [unrelated], thresholds: TH });
    expect(a).toEqual(b);
  });
  it('mức cao hơn trong hai điểm được chọn', () => {
    expect(levelOf(0.2, 0.6, TH)).toBe('HIGH');
    expect(levelOf(0.55, 0.1, TH)).toBe('REVIEW');
    expect(levelOf(0.1, 0.1, TH)).toBe('NONE');
  });
  it('chỉ trả top 5', () => {
    const corpus = Array.from({ length: 12 }, (_, i) => ({ ...base, id: `T${i}`, code: `C${i}` }));
    expect(compare({ candidate: base, corpus, thresholds: TH }).matches).toHaveLength(5);
  });
});

describe('Dịch vụ kiểm tra', () => {
  it('lỗi database → ERROR, không bao giờ là "không trùng"', async () => {
    const saved = [];
    const repo = {
      loadCorpus: async () => { throw new Error('mất kết nối'); },
      loadSynonyms: async () => [],
      saveCheck: async (d) => { saved.push(d); return d; },
    };
    const r = await runSimilarityCheck({ repo, topic: { ...base, id: 'X' } });
    expect(r.status).toBe('ERROR');
    expect(r.level).toBeNull();
  });
  it('sinh viên không thấy tên/tóm tắt hồ sơ đang chờ của nhóm khác', () => {
    const corpusById = new Map([
      ['P', { status: 'UNDER_REVIEW', title: 'Bí mật', academicYear: '2025-2026' }],
      ['D', { status: 'CLOSED', title: 'Đề tài cũ', academicYear: '2024-2025' }],
    ]);
    const matches = [{ topicId: 'P', code: 'C1', titleScore: 0.8, contentScore: 0.6, level: 'HIGH' },
      { topicId: 'D', code: 'C2', titleScore: 0.5, contentScore: 0.2, level: 'REVIEW' }];
    const forStudent = presentMatches(matches, corpusById, 'STUDENT');
    expect(forStudent[0]).not.toHaveProperty('title');
    expect(forStudent[0]).not.toHaveProperty('code');
    expect(forStudent[0].hidden).toBe(true);
    expect(forStudent[1].title).toBe('Đề tài cũ');
    expect(presentMatches(matches, corpusById, 'STAFF')[0].title).toBe('Bí mật');
  });
});
