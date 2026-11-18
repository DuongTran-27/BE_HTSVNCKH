import { z } from 'zod';
import * as S from '@nckh/shared';

// Vai trò viết tắt: A=ADMIN S=STAFF L=LECTURER V=STUDENT · P=công khai · U=chỉ cần đăng nhập · C=bộ lập lịch (CRON_SECRET).
// Mỗi dòng: [method, đường dẫn Express (dưới /api), vai trò, { body, query, file, note }]. Body/query lấy thẳng từ schema Zod của @nckh/shared.
const ALL = 'ASLV', SLV = 'SLV', AS = 'AS';
const importQuery = z.object({ facultyId: S.idSchema });
const catalog = (p, create) => [
  ['GET', `/${p}`, ALL, { query: S.catalogListQuerySchema }],
  ['POST', `/${p}`, AS, { body: create }],
  ['PATCH', `/${p}/:id`, AS, { body: S.catalogUpdateSchema }],
];
export const ROUTES = [
  ['GET', '/health', 'P', { note: 'Kiểm tra sống + DB (503 nếu DB lỗi)' }],
  ['POST', '/auth/login', 'P', { body: S.loginSchema }],
  ['POST', '/auth/refresh', 'P', { note: 'Dùng cookie refresh token httpOnly' }],
  ['POST', '/auth/logout', 'P'],
  ['POST', '/auth/change-password', 'U', { body: S.changePasswordSchema }],
  ['GET', '/auth/me', 'U'],
  ['GET', '/auth/providers', 'P', { note: 'Phương thức đăng nhập đang bật: { google: boolean } (FR28)' }],
  ['GET', '/auth/google/start', 'P', { query: z.object({ next: z.string().max(512).optional() }), note: '302 tới Google (PKCE, state, nonce); 404 khi SSO tắt. Mở bằng liên kết, không dùng form' }],
  ['GET', '/auth/google/callback', 'P', { query: S.ssoCallbackQuerySchema, note: 'Luôn 302 về PUBLIC_APP_URL: /dang-nhap/google (thành công, cookie nckh_rt) hoặc /dang-nhap?sso_error=<mã SSO_ERROR_LABEL>; 404 khi SSO tắt' }],
  ...catalog('faculties', S.facultyCreateSchema),
  ...catalog('majors', S.majorCreateSchema),
  ...catalog('classes', S.classCreateSchema),
  ...catalog('fields', S.fieldCreateSchema),
  ['GET', '/synonyms', 'S', { query: S.catalogListQuerySchema }],
  ['POST', '/synonyms', 'S', { body: S.synonymCreateSchema }],
  ['DELETE', '/synonyms/:id', 'S'],
  ['GET', '/rounds', SLV, { query: S.roundListQuerySchema }],
  ['GET', '/rounds/:id', SLV],
  ['POST', '/rounds', 'S', { body: S.roundCreateSchema }],
  ['PATCH', '/rounds/:id', 'S', { body: S.roundUpdateSchema }],
  ['POST', '/users/import/preview', AS, { query: importQuery, file: true }],
  ['POST', '/users/import/confirm', AS, { query: importQuery, file: true }],
  ['GET', '/users', AS, { query: S.userListQuerySchema }],
  ['GET', '/users/:id', AS],
  ['POST', '/users', AS, { body: S.userCreateSchema }],
  ['PATCH', '/users/:id', AS, { body: S.userUpdateSchema }],
  ['DELETE', '/users/:id', 'A'],
  ['POST', '/users/:id/lock', AS],
  ['POST', '/users/:id/unlock', AS],
  ['POST', '/users/:id/reset-password', AS],
  ['PUT', '/users/:id/staff-scopes', 'A', { body: S.staffScopesSchema }],
  ['POST', '/topics', 'LV', { body: S.topicCreateSchema, note: 'LECTURER: nháp đề tài GV công bố (FR31, API_GD7 §3.1)' }],
  ['GET', '/topics', SLV, { query: S.topicListQuerySchema }],
  ['GET', '/topics/:id', SLV],
  ['PUT', '/topics/:id', 'LV', { body: S.topicUpdateSchema }],
  ['GET', '/topics/:id/submissions', SLV],
  ['GET', '/topics/:id/submissions/:seq', SLV],
  ['GET', '/topics/:id/submission-diff', SLV, { query: S.submissionDiffQuerySchema }],
  ['GET', '/topics/:id/status-history', SLV],
  ['POST', '/topics/:id/invitations', 'V', { body: S.invitationCreateSchema }],
  ['POST', '/topics/:id/leader', 'V', { body: S.leaderTransferSchema }],
  ['POST', '/topics/:id/leave', 'V', { body: S.leaveTopicSchema }],
  ['GET', '/topics/:id/similarity-checks/latest', SLV],
  ['POST', '/topics/:id/similarity-checks', 'LV', { body: S.emptyBodySchema }],
  ['POST', '/topics/:id/similarity-bypasses', 'S', { body: S.similarityBypassCreateSchema }],
  ['POST', '/topics/:id/actions', SLV, { body: S.topicActionSchema, note: 'Chuyển trạng thái; vai trò kiểm theo TRANSITIONS' }],
  ['GET', '/topics/:id/milestones', SLV],
  ['POST', '/topics/:id/milestones', SLV, { body: S.milestoneCreateSchema }],
  ['GET', '/topics/:id/progress', SLV, { query: S.paginationQuery }],
  ['POST', '/topics/:id/progress', SLV, { body: S.progressCreateSchema }],
  ['GET', '/topics/:id/documents', SLV, { query: S.documentListQuerySchema }],
  ['POST', '/topics/:id/documents', 'V', { file: true, body: S.documentUploadFieldsSchema }],
  ['POST', '/topics/:id/documents/links', 'V', { body: S.documentLinkSchema }],
  ['GET', '/topics/:id/feedbacks', SLV, { query: S.feedbackListQuerySchema }],
  ['GET', '/topics/:id/results', SLV],
  ['POST', '/topics/:id/results', SLV, { body: S.finalResultSchema }],
  ['POST', '/topics/:id/result-corrections', 'S', { body: S.resultCorrectionSchema }],
  ['GET', '/topics/:id/change-requests', SLV, { query: S.paginationQuery }],
  ['POST', '/topics/:id/change-requests', SLV, { body: S.changeRequestCreateSchema }],
  ['PUT', '/topics/:id/former-advisors/:lecturerId/read-access', 'S', { body: S.formerAdvisorAccessSchema }],
  ['GET', '/change-requests', SLV, { query: S.changeRequestListQuerySchema }],
  ['GET', '/change-requests/:id', SLV],
  ['POST', '/change-requests/:id/accept', SLV, { body: S.emptyBodySchema }],
  ['POST', '/change-requests/:id/decline', SLV, { body: S.changeRequestDeclineSchema }],
  ['POST', '/change-requests/:id/withdraw', SLV, { body: S.emptyBodySchema }],
  ['POST', '/change-requests/:id/approve', SLV, { body: S.changeRequestApproveSchema }],
  ['GET', '/me/profile', 'U'],
  ['PATCH', '/me/profile', 'U', { body: S.profileUpdateSchema }],
  ['GET', '/me/past-topics', 'V', { query: S.paginationQuery }],
  ['GET', '/advisor-requests', SLV, { query: S.advisorRequestListQuerySchema }],
  ['GET', '/lecturers', SLV, { query: S.lecturerListQuerySchema }],
  ['GET', '/invitations', 'V', { query: S.invitationListQuerySchema }],
  ['POST', '/invitations/:id/accept', 'V'],
  ['POST', '/invitations/:id/decline', 'V'],
  ['POST', '/invitations/:id/cancel', 'V'],
  ['GET', '/recruitments', SLV, { query: S.recruitmentListQuerySchema, note: 'Bảng tin đề tài GV đang tuyển (FR31, API_GD7 §4.2)' }],
  ['GET', '/recruitments/:topicId', SLV],
  ['GET', '/repository', ALL, { query: S.repositoryQuerySchema }],
  ['GET', '/repository/:code', ALL],
  ['PATCH', '/milestones/:id', SLV, { body: S.milestoneUpdateSchema }],
  ['GET', '/milestones/:id/due-changes', SLV],
  ['POST', '/milestones/:id/due-changes', SLV, { body: S.milestoneDueChangeSchema }],
  ['POST', '/milestones/:id/reopen', SLV, { body: S.milestoneReopenSchema }],
  ['GET', '/milestones/:id/reopens', SLV],
  ['POST', '/documents/:id/download-url', SLV, { body: S.emptyBodySchema }],
  ['POST', '/documents/:id/feedbacks', SLV, { body: S.documentFeedbackSchema }],
  ['PATCH', '/progress/:id', SLV, { body: S.progressUpdateSchema }],
  ['POST', '/progress/:id/feedbacks', SLV, { body: S.progressFeedbackSchema }],
  ['GET', '/notifications', 'U', { query: S.notificationListQuerySchema }],
  ['GET', '/notifications/unread-count', 'U'],
  ['POST', '/notifications/read-all', 'U', { body: S.emptyBodySchema }],
  ['POST', '/notifications/:id/read', 'U', { body: S.emptyBodySchema }],
  ['GET', '/stats', 'SL', { query: S.statsQuerySchema }],
  ['GET', '/stats/export.csv', 'SL', { query: S.statsQuerySchema, note: 'Trả text/csv' }],
  ['POST', '/cron/reminders', 'C'],
  ['POST', '/cron/similarity-rechecks', 'C'],
];

const ROLE_NAMES = { A: 'ADMIN', S: 'STAFF', L: 'LECTURER', V: 'STUDENT' };
const toSchema = (s) => {
  const { $schema: _omit, ...json } = z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' });
  return json;
};
export const toOpenApiPath = (p) => p.replace(/:(\w+)/g, '{$1}');
const errRef = (d) => ({ description: d, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });

export const buildOpenApi = () => {
  const paths = {};
  for (const [method, path, roles, o = {}] of ROUTES) {
    const open = roles === 'P' || roles === 'C'; // không dùng bearer của người dùng
    const params = [...path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    if (o.query) {
      const q = toSchema(o.query);
      for (const [name, schema] of Object.entries(q.properties ?? {})) params.push({ name, in: 'query', required: q.required?.includes(name) ?? false, schema });
    }
    const responses = { 200: { description: 'Thành công' } };
    if (o.body || o.query || o.file) responses[400] = errRef('Dữ liệu không hợp lệ (VALIDATION_ERROR)');
    if (!open) {
      responses[401] = errRef('Chưa đăng nhập hoặc token hết hạn');
      if (roles !== 'U') responses[403] = errRef(`Sai vai trò (cho phép: ${roles.split('').map((c) => ROLE_NAMES[c]).join(', ')}) hoặc không có quyền theo quan hệ đề tài`);
    }
    if (roles === 'C') responses[401] = errRef('Thiếu/sai CRON_SECRET');
    if (params.some((p) => p.in === 'path')) responses[404] = errRef('Không tìm thấy');
    if (method !== 'GET') responses[409] = errRef('Xung đột phiên bản hoặc sai trạng thái');
    const who = { P: 'công khai', U: 'mọi người dùng đã đăng nhập', C: 'bộ lập lịch (Bearer CRON_SECRET)' }[roles] ?? roles.split('').map((c) => ROLE_NAMES[c]).join(', ');
    const body = o.body && toSchema(o.body);
    const op = {
      summary: `${method} /api${path}`,
      description: [o.note, `Vai trò: ${who}`].filter(Boolean).join('\n\n'),
      ...(open ? { security: [] } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(o.file
        ? { requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, ...body?.properties }, required: ['file'] } } } } }
        : body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      responses,
    };
    (paths[`/api${toOpenApiPath(path)}`] ??= {})[method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: { title: 'API quản lý nghiên cứu khoa học sinh viên Khoa Công nghệ Thông tin', version: '0.1.0' },
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'object', additionalProperties: true } }, required: ['code', 'message'] } } } },
    },
  };
};

// Swagger UI tải từ CDN (không thêm phụ thuộc npm); chỉ phục vụ khi NODE_ENV khác production.
export const swaggerHtml = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>API NCKH</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.34.1/swagger-ui.css" integrity="sha384-4c3vsE5f+trhFyHrFrLM1fFGUn531NIaC7dcqEWIJdoRQJ5CkJbSuSCwXLpaS1KF" crossorigin="anonymous"></head><body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.34.1/swagger-ui-bundle.js" integrity="sha384-XFYN47VzPiDY6qPtxYKg0nqUeW/upo20xf1j2SUE7gT/i35FJB4cuS/71Iegzk8Z" crossorigin="anonymous"></script>
<script src="/api/docs/init.js"></script></body></html>`;
export const swaggerInit = "SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#ui' });";
