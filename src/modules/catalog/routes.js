import {
  facultyCreateSchema,
  majorCreateSchema,
  classCreateSchema,
  fieldCreateSchema,
  catalogUpdateSchema,
  catalogListQuerySchema,
  synonymCreateSchema,
  idSchema,
} from '@nckh/shared';
import { requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessRouter } from '../../lib/router.js';
import { createCatalogService, writeRoles } from './service.js';

const KINDS = [
  { path: 'faculties', kind: 'Faculty', create: facultyCreateSchema },
  { path: 'majors', kind: 'Major', create: majorCreateSchema },
  { path: 'classes', kind: 'Class', create: classCreateSchema },
  { path: 'fields', kind: 'Field', create: fieldCreateSchema },
];

const idParam = (_req, _res, next, id) => {
  if (!idSchema.safeParse(id).success) throw notFound();
  next();
};
// tên cột unique -> tên trường request (details của DUPLICATE)
const dupFields = (req, _res, next) => {
  req.duplicateFields = { code: 'code', term: 'term' };
  next();
};

/** Trả về { tiền tố: router } để app mount ở /api/<tiền tố>. Đọc: mọi vai trò; ghi: theo writeRoles + phạm vi khoa trong service. */
export const catalogRouters = ({ repo, guard }) => {
  const svc = createCatalogService({ repo });
  const routers = {};

  for (const { path, kind, create } of KINDS) {
    const r = (routers[path] = businessRouter(guard));
    r.param('id', idParam);
    r.use(dupFields);
    const writers = requireRole(...writeRoles(kind));
    r.get('/', validate(catalogListQuerySchema, 'query'), async (req, res) => {
      res.json(await svc.list(kind, req.user, req.validated));
    });
    r.post('/', writers, validate(create), async (req, res) => {
      res.status(201).json({ item: await svc.create(kind, req.user, req.body, req.ip) });
    });
    r.patch('/:id', writers, validate(catalogUpdateSchema), async (req, res) => {
      res.json({ item: await svc.update(kind, req.user, req.params.id, req.body, req.ip) });
    });
  }

  const r = (routers.synonyms = businessRouter(guard));
  const staffOnly = requireRole('STAFF');
  r.param('id', idParam);
  r.use(dupFields);
  r.get('/', staffOnly, validate(catalogListQuerySchema, 'query'), async (req, res) => {
    res.json(await svc.listSynonyms(req.validated));
  });
  r.post('/', staffOnly, validate(synonymCreateSchema), async (req, res) => {
    res.status(201).json({ item: await svc.createSynonym(req.user, req.body, req.ip) });
  });
  r.delete('/:id', staffOnly, async (req, res) => {
    await svc.deleteSynonym(req.user, req.params.id, req.ip);
    res.status(204).end();
  });
  return routers;
};
