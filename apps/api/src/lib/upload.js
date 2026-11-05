// Upload báo cáo (QD_ZOD §4.2, §4.3): multer ^2.5.0, memoryStorage, giới hạn cứng, kiểm nội dung trên buffer.
import multer from 'multer';
import { DOCUMENT_FILE_TYPES, UPLOAD_HARD_MAX_BYTES } from '@nckh/shared';
import { AppError, badRequest } from './errors.js';

export const extOf = (name = '') => {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name);
  return m ? m[1].toLowerCase() : '';
};
export const unsupported = () => badRequest('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { file: 'Loại file không được hỗ trợ' });

// multer/busboy: quá cỡ -> 413, mọi lỗi khác -> 400 (bắt theo lớp, không liệt kê mã)
export const toUploadError = (err) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'File vượt quá dung lượng cho phép');
  return badRequest('VALIDATION_ERROR', 'Dữ liệu tải lên không hợp lệ', { file: 'Dữ liệu tải lên không hợp lệ' });
};

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_HARD_MAX_BYTES, files: 1, fields: 10, fieldSize: 10 * 1024, parts: 12, fieldNameSize: 100 },
  // Đồng bộ, chỉ lọc đuôi; không tin mimetype của client
  fileFilter: (req, file, cb) => {
    const ok = extOf(file.originalname) in DOCUMENT_FILE_TYPES;
    if (!ok) req.fileRejected = true;
    cb(null, ok);
  },
}).single('file');

export const documentUpload = (req, res, next) => uploader(req, res, (err) => next(err && toUploadError(err)));

const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);
const OOXML_DIR = { docx: 'word/', pptx: 'ppt/', xlsx: 'xl/' };
// Không giải nén (chống zip bomb): tên mục trong central directory của ZIP lưu không nén
export const contentMatches = (ext, buf) => {
  if (ext === 'pdf') return startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (!(ext in OOXML_DIR)) return false;
  return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) && buf.includes('[Content_Types].xml') && buf.includes(OOXML_DIR[ext]);
};

// Tên hiển thị: bỏ đường dẫn, ký tự điều khiển và \ / : * ? " < > |; ≤ 200 ký tự giữ đuôi; rỗng -> tai-lieu.<đuôi>
export const sanitizeFileName = (raw, ext) => {
  let name = String(raw ?? '');
  // busboy giải mã tên file theo latin1: khôi phục UTF-8 nếu hợp lệ
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  if (!utf8.includes('�')) name = utf8;
  name = name.split(/[\\/]/).pop();
  const base = name.slice(0, name.length - (ext ? ext.length + 1 : 0)).replace(/[\p{Cc}\p{Cf}\\/:*?"<>|]/gu, '').trim();
  return `${(base || 'tai-lieu').slice(0, 200 - ext.length - 1)}.${ext}`;
};
