import { AppError } from './errors.js';

// Nhận đúng MỘT file từ multipart/form-data (QD_ZOD §4.3 cho nhập CSV). Tự viết vì multer chưa có trong dependency
// (đề xuất ở báo cáo T207b). Giới hạn: file, số phần, field văn bản; vượt file -> 413, hỏng/lạ -> 400.
// shortcut: đọc cả body vào RAM (đã chặn ≤ fileSize + slack); đổi sang multer ^2.5.0 khi T403 thêm dependency.
const bad = (msg = 'Dữ liệu tải lên không hợp lệ') => new AppError(400, 'VALIDATION_ERROR', msg, { file: msg });
const tooBig = () => new AppError(413, 'PAYLOAD_TOO_LARGE', 'File vượt quá dung lượng cho phép');
const SLACK = 8 * 1024; // phần đầu/biên của các part

// BUG-008: trả lỗi sớm (403) khi client còn đang gửi thân lớn làm kết nối bị reset (ECONNRESET/EPIPE).
// Bỏ dữ liệu ngay khi đến (không giữ vào RAM) tới khi hết thân, rồi mới trả lỗi. Chặn DoS: quá maxBytes hoặc quá timeoutMs thì trả lỗi luôn.
export const drainThen = (req, next, err, { maxBytes = 32 * 1024 * 1024, timeoutMs = 10000 } = {}) => {
  let size = 0;
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    clearTimeout(timer);
    req.removeAllListeners('data');
    next(err);
  };
  const timer = setTimeout(fire, timeoutMs);
  req.on('data', (c) => { size += c.length; if (size > maxBytes) fire(); });
  req.on('end', fire);
  req.on('error', fire);
  req.on('aborted', fire);
  req.resume();
};

export const singleFileUpload = ({ field = 'file', fileSize, maxParts = 7, fieldSize = 1024 }) => (req, _res, next) => {
  const boundary = /^multipart\/form-data;.*boundary=(?:"([^"]{1,70})"|([^;\s"]{1,70}))/i.exec(req.headers['content-type'] ?? '');
  if (!boundary) return next(bad('Cần gửi file bằng multipart/form-data'));
  const limit = fileSize + maxParts * (fieldSize + 1024) + SLACK;
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    return next(tooBig());
  }
  const chunks = [];
  let size = 0;
  let done = false;
  const finish = (err) => {
    if (done) return;
    done = true;
    req.removeAllListeners('data');
    if (err) req.resume();
    next(err);
  };
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) return finish(tooBig());
    chunks.push(c);
  });
  req.on('error', () => finish(bad()));
  req.on('aborted', () => finish(bad()));
  req.on('end', () => {
    if (done) return;
    try {
      req.file = extract(Buffer.concat(chunks), boundary[1] ?? boundary[2], { field, fileSize, maxParts, fieldSize });
      finish();
    } catch (e) {
      finish(e);
    }
  });
};

function extract(buf, boundary, { field, fileSize, maxParts, fieldSize }) {
  const delim = Buffer.from(`--${boundary}`);
  let pos = buf.indexOf(delim);
  if (pos !== 0) throw bad();
  let file = null;
  let parts = 0;
  for (;;) {
    pos += delim.length;
    if (buf.subarray(pos, pos + 2).toString('latin1') === '--') break; // biên kết thúc
    if (buf.subarray(pos, pos + 2).toString('latin1') !== '\r\n') throw bad();
    pos += 2;
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    const next = buf.indexOf(Buffer.concat([Buffer.from('\r\n'), delim]), pos);
    if (headEnd < 0 || next < 0 || headEnd > next || ++parts > maxParts) throw bad();
    const head = buf.subarray(pos, headEnd).toString('utf8');
    const body = buf.subarray(headEnd + 4, next);
    const disp = /^content-disposition:\s*form-data;(.*)$/im.exec(head);
    if (!disp) throw bad();
    const name = /[;\s]name="([^"]*)"/i.exec(` ${disp[1]}`)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disp[1])?.[1];
    if (filename !== undefined) {
      if (name !== field || file) throw bad();
      if (body.length > fileSize) throw tooBig();
      file = { originalname: filename, buffer: body, size: body.length };
    } else if (body.length > fieldSize) throw bad();
    pos = next + 2;
  }
  if (!file) throw bad('Thiếu file tải lên');
  return file;
}
