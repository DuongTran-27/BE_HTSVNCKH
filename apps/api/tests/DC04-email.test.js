// TASK-DC-04 (FR29, API_GD7 §9.4): email thông báo qua hộp thư đi trên Notification. Transport giả – không gửi thư thật,
// không gọi mạng: nodemailer streamTransport (dựng thư MIME thật trong bộ nhớ) hoặc đối tượng sendMail tự viết.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { loadEnv, missingSmtpEnv } from '../src/config/env.js';
import { notify, notifyTopic, setEmailOutbox } from '../src/modules/notifications/notify.js';
import { dispatchEmails, buildMail, mailSubject, STALE_MS } from '../src/modules/notifications/email.js';
import { testEnv } from './helpers.js';
import { prisma, U, seedBase, mkTopic, addMember, act } from './t214-kit.js';

const APP = 'https://nckh.example.edu.vn';
const FROM = 'NCKH Khoa CNTT <no-reply@example.edu.vn>';
let seq = 0;
const key = () => `DC04:${++seq}`;

// Transport ghi lại mọi thư; fail = số lần đầu ném lỗi; delay để hai bộ gửi song song thật sự chồng nhau
const fakeTransport = ({ fail = 0, delay = 0 } = {}) => {
  const sent = [];
  let calls = 0;
  return {
    sent,
    get calls() { return calls; },
    sendMail: async (msg) => {
      calls += 1;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (calls <= fail) throw Object.assign(new Error(`550 hỏng tới ${msg.to}`), { code: 'EENVELOPE' });
      sent.push(msg);
    },
  };
};
const logger = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() });
const dispatch = (transport, o = {}) => dispatchEmails({ prisma, transport, from: FROM, appUrl: APP, logger: o.logger ?? logger(), ...o });
const mk = (who, title = `Thông báo ${seq}`, link = '/de-tai/x') =>
  notify(prisma, [{ userId: U[who].id, type: 'TEST', title, link, dedupeKey: key() }]);
const row = (who) => prisma.notification.findFirst({ where: { userId: U[who].id }, orderBy: { createdAt: 'desc' } });
// Dựng thư MIME thật bằng nodemailer (không mạng) để kiểm header
const raw = async (msg) => (await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' }).sendMail(msg)).message.toString();

beforeAll(() => seedBase({ students: 12 }), 60000);
afterEach(async () => {
  setEmailOutbox(false);
  await prisma.notification.deleteMany({}); // Notification không có trigger chỉ-thêm
  await prisma.user.updateMany({ data: { isLocked: false } });
});
afterAll(() => prisma.$disconnect());

describe('DC-04 cấu hình', () => {
  it('thiếu một biến → missingSmtpEnv trả TÊN biến; chuỗi rỗng = thiếu; đủ → []', () => {
    const full = { ...testEnv, SMTP_HOST: 'smtp.x.vn', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'bi-mat-khong-in', SMTP_FROM: FROM, PUBLIC_APP_URL: APP };
    expect(missingSmtpEnv(loadEnv(full))).toEqual([]);
    expect(missingSmtpEnv(loadEnv({ ...full, SMTP_PASS: '', PUBLIC_APP_URL: undefined }))).toEqual(['SMTP_PASS', 'PUBLIC_APP_URL']);
    expect(missingSmtpEnv(loadEnv(testEnv))).toEqual(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'PUBLIC_APP_URL']);
    expect(JSON.stringify(missingSmtpEnv(loadEnv({ ...full, SMTP_HOST: '' })))).not.toContain('bi-mat');
    expect(loadEnv(full).SMTP_PORT).toBe(587);
    expect(loadEnv({ ...full, SMTP_SECURE: 'false' }).SMTP_SECURE).toBe(false);
    expect(loadEnv(full).SMTP_SECURE).toBeUndefined(); // server.js: mặc định true khi cổng 465
    expect(() => loadEnv({ ...full, SMTP_PORT: '70000' })).toThrow(/SMTP_PORT/);
    expect(() => loadEnv({ ...full, SMTP_FROM: 'a@b.vn\r\nBcc: x@evil.com' })).toThrow(/SMTP_FROM/);
  });
});

describe('DC-04 nội dung thư', () => {
  it('subject: thay CR/LF/ký tự điều khiển bằng khoảng trắng, có tiền tố, ≤ 200 ký tự', () => {
    expect(mailSubject('A\r\nBcc: x@evil.com\u0000\u001f\u007fB')).toBe('[NCKH Khoa CNTT] A  Bcc: x@evil.com   B');
    expect(mailSubject('x'.repeat(500))).toHaveLength(200);
  });

  it('chỉ title + link; link null hoặc //evil → /thong-bao; escape HTML', () => {
    const m = buildMail({ title: 'Đề tài <script>alert(1)</script> & "x"', link: null }, { to: 'a@t.vn', from: FROM, appUrl: APP });
    expect(m).toEqual({
      from: FROM,
      to: 'a@t.vn',
      subject: '[NCKH Khoa CNTT] Đề tài <script>alert(1)</script> & "x"',
      text: `Đề tài <script>alert(1)</script> & "x"\n\nĐăng nhập để xem chi tiết: ${APP}/thong-bao\n`,
      html: expect.any(String),
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&#60;script&#62;alert(1)&#60;/script&#62; &#38; &#34;x&#34;');
    expect(m.html).toContain(`href="${APP}/thong-bao"`);
    expect(buildMail({ title: 't', link: '//evil.com/x' }, { to: 'a@t.vn', from: FROM, appUrl: APP }).text).toContain(`${APP}/thong-bao`);
    expect(buildMail({ title: 't', link: 'https://evil.com' }, { to: 'a@t.vn', from: FROM, appUrl: APP }).text).toContain(`${APP}/thong-bao`);
    expect(buildMail({ title: 't', link: '/de-tai/abc' }, { to: 'a@t.vn', from: FROM, appUrl: APP }).text).toContain(`${APP}/de-tai/abc`);
  });

  it('header injection: tên đề tài chứa "\\r\\nBcc: x@evil.com" → subject một dòng, thư không có header Bcc', async () => {
    setEmailOutbox(true);
    const t = await mkTopic('s1', undefined, { title: 'Đề tài\r\nBcc: x@evil.com\r\nX-Evil: 1' });
    await notifyTopic(prisma, { topicId: t.id, userIds: [U.lecA.id], type: 'TEST', key: key(), link: null, title: (x) => `${x.code} – ${x.title}` });
    const tr = fakeTransport();
    expect(await dispatch(tr)).toMatchObject({ sent: 1 });
    const msg = await raw(tr.sent[0]);
    const headers = msg.split('\n\n')[0];
    expect(headers).not.toMatch(/^bcc:/im);
    expect(headers).not.toMatch(/^x-evil:/im);
    expect(msg).not.toContain('x@evil.com>'); // không thành người nhận
    expect(tr.sent[0].subject).not.toMatch(/[\r\n]/);
    expect(headers).toMatch(/^To: lecA@t\.vn$/m);
    expect(msg).toMatch(/Content-Type: text\/plain; charset=utf-8/i);
  });
});

describe('DC-04 hộp thư đi', () => {
  it('tắt: emailStatus null, dispatch không gọi transport', async () => {
    await mk('s1');
    expect((await row('s1')).emailStatus).toBeNull();
    const tr = fakeTransport();
    expect(await dispatch(tr)).toEqual({ sent: 0, retry: 0, failed: 0, skipped: 0 });
    expect(tr.calls).toBe(0);
  });

  it('bật: request nghiệp vụ 200 → PENDING → dispatch → SENT đúng 1 lần, đúng người nhận, chỉ title + link', async () => {
    setEmailOutbox(true);
    const t = await mkTopic('s2');
    await addMember(t, 's3');
    const r = await act('s2', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecB.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const n = await row('lecB');
    expect(n).toMatchObject({ emailStatus: 'PENDING', emailAttempts: 0, emailedAt: null });
    expect(await prisma.notification.count({ where: { userId: { in: [U.s2.id, U.s3.id] } } })).toBe(0); // người gây sự kiện không nhận
    const tr = fakeTransport();
    expect(await dispatch(tr)).toEqual({ sent: 1, retry: 0, failed: 0, skipped: 0 });
    expect(tr.sent).toHaveLength(1);
    expect(tr.sent[0].to).toBe('lecB@t.vn');
    expect(tr.sent[0]).not.toHaveProperty('cc');
    expect(tr.sent[0]).not.toHaveProperty('bcc');
    expect(tr.sent[0].text).toBe(`${n.title}\n\nĐăng nhập để xem chi tiết: ${APP}${n.link}\n`);
    expect(await row('lecB')).toMatchObject({ emailStatus: 'SENT', emailAttempts: 1, emailedAt: expect.any(Date) });
    expect(await dispatch(tr)).toEqual({ sent: 0, retry: 0, failed: 0, skipped: 0 });
    expect(tr.sent).toHaveLength(1);
  });

  it('transport lỗi 3 lần → PENDING, PENDING, FAILED; không thử lần 4; log không chứa địa chỉ', async () => {
    setEmailOutbox(true);
    await mk('s4');
    const tr = fakeTransport({ fail: 99 });
    const log = logger();
    expect(await dispatch(tr, { logger: log })).toMatchObject({ retry: 1 });
    expect(await row('s4')).toMatchObject({ emailStatus: 'PENDING', emailAttempts: 1 });
    expect(await dispatch(tr, { logger: log })).toMatchObject({ retry: 1 });
    expect(await dispatch(tr, { logger: log })).toMatchObject({ failed: 1 });
    expect(await row('s4')).toMatchObject({ emailStatus: 'FAILED', emailAttempts: 3, emailedAt: null });
    expect(await dispatch(tr, { logger: log })).toEqual({ sent: 0, retry: 0, failed: 0, skipped: 0 });
    expect(tr.calls).toBe(3);
    expect(log.warn).toHaveBeenCalledTimes(3);
    const logged = JSON.stringify(log.warn.mock.calls);
    expect(logged).not.toContain('@t.vn');
    expect(logged).not.toContain('Thông báo');
    expect(logged).toContain('EENVELOPE');
  });

  it('lỗi 2 lần rồi thành công → SENT, emailAttempts 3', async () => {
    setEmailOutbox(true);
    await mk('s5');
    const tr = fakeTransport({ fail: 2 });
    for (let i = 0; i < 3; i++) await dispatch(tr);
    expect(await row('s5')).toMatchObject({ emailStatus: 'SENT', emailAttempts: 3 });
    expect(tr.sent).toHaveLength(1);
  });

  it('request nghiệp vụ vẫn 2xx dù SMTP hỏng (gửi tách khỏi request)', async () => {
    setEmailOutbox(true);
    const t = await mkTopic('s6');
    const r = await act('s6', t, { action: 'REQUEST_ADVISOR', lecturerId: U.lecC.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const tr = fakeTransport({ fail: 99 });
    for (let i = 0; i < 3; i++) await dispatch(tr);
    expect(await row('lecC')).toMatchObject({ emailStatus: 'FAILED' });
    expect((await prisma.topic.findUnique({ where: { id: t.id } })).status).toBe('WAITING_ADVISOR');
  });

  it('tài khoản bị khóa sau khi có thông báo → SKIPPED, không gửi', async () => {
    setEmailOutbox(true);
    await mk('s7');
    await prisma.user.update({ where: { id: U.s7.id }, data: { isLocked: true } });
    const tr = fakeTransport();
    expect(await dispatch(tr)).toMatchObject({ skipped: 1, sent: 0 });
    expect((await row('s7')).emailStatus).toBe('SKIPPED');
    expect(tr.calls).toBe(0);
  });

  it('SENDING treo > 15 phút: hết lượt (3) → FAILED; còn lượt → nhận lại và gửi (ít nhất một lần); SENDING mới không bị lấy', async () => {
    setEmailOutbox(true);
    await mk('s8');
    await mk('s9');
    await mk('s10');
    const old = new Date(Date.now() - STALE_MS - 1000);
    await prisma.notification.updateMany({ where: { userId: U.s8.id }, data: { emailStatus: 'SENDING', emailClaimedAt: old, emailAttempts: 3 } });
    await prisma.notification.updateMany({ where: { userId: U.s9.id }, data: { emailStatus: 'SENDING', emailClaimedAt: old, emailAttempts: 1 } });
    await prisma.notification.updateMany({ where: { userId: U.s10.id }, data: { emailStatus: 'SENDING', emailClaimedAt: new Date(), emailAttempts: 1 } });
    const tr = fakeTransport();
    expect(await dispatch(tr)).toMatchObject({ sent: 1 });
    expect(await row('s8')).toMatchObject({ emailStatus: 'FAILED', emailAttempts: 3 });
    expect(await row('s9')).toMatchObject({ emailStatus: 'SENT', emailAttempts: 2 });
    expect(await row('s10')).toMatchObject({ emailStatus: 'SENDING', emailAttempts: 1 });
    expect(tr.sent.map((m) => m.to)).toEqual(['s9@t.vn']);
  });

  it('hai bộ gửi chạy song song → mỗi thư gửi đúng 1 lần', async () => {
    setEmailOutbox(true);
    const who = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'];
    for (let i = 0; i < 3; i++) {
      await notify(prisma, who.map((w) => ({ userId: U[w].id, type: 'TEST', title: `Song song ${w}-${i}`, link: '/thong-bao', dedupeKey: key() })));
    }
    const tr = fakeTransport({ delay: 3 });
    const drain = async () => { while ((await dispatch(tr, { limit: 4 })).sent); };
    await Promise.all([drain(), drain(), drain()]);
    const subjects = tr.sent.map((m) => `${m.to}|${m.subject}`);
    expect(subjects).toHaveLength(36);
    expect(new Set(subjects).size).toBe(36);
    expect(await prisma.notification.count({ where: { emailStatus: 'SENT', emailAttempts: 1 } })).toBe(36);
  });
});
