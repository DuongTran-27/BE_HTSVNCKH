import { repositoryQuerySchema } from '@nckh/shared';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createRepositoryService } from './repositoryService.js';

// /api/repository – mọi vai trò đã đăng nhập kể cả ADMIN (G3); dữ liệu công khai nội bộ, không có quan hệ riêng tư.
export const repositoryRouter = ({ repo, guard }) => {
  const svc = createRepositoryService({ repo });
  const r = businessRouter(guard);
  r.get('/', validate(repositoryQuerySchema, 'query'), async (req, res) => res.json(await svc.list(req.validated)));
  r.get('/:code', async (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(req.params.code)) throw notFound();
    res.json(await svc.get(req.params.code));
  });
  return r;
};
