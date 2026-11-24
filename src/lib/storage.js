// Bộ chuyển đổi kho file (API_GD45 §5.8). Interface:
//   upload(buffer, { publicId }) -> { public_id, bytes, type, resource_type }
//   destroy(publicId) · signedDownloadUrl(publicId, { expiresAt: Date, attachment }) -> string
//   list({ prefix, cursor }) -> { resources: [{ public_id, bytes, created_at }], next_cursor }
// Bản thật bọc SDK `cloudinary` v2 (tiêm vào để test mock được); bản giả trong bộ nhớ dùng cho dev/test.

export const defaultStorageFolder = (env = process.env) => env.CLOUDINARY_FOLDER || `nckh/${env.NODE_ENV || 'development'}`;

export const UPLOAD_TIMEOUT_MS = 30000;

export function createCloudinaryStorage({ cloudinary }) {
  return {
    upload: (buffer, { publicId }) =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'raw', type: 'authenticated', public_id: publicId, overwrite: false, timeout: UPLOAD_TIMEOUT_MS },
          (err, result) => (err ? reject(err) : resolve(result)),
        );
        stream.end(buffer);
      }),
    destroy: (publicId) => cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated', invalidate: true }),
    // private_download_url: URL có chữ ký + expires_at (hết hạn thật); attachment buộc trình duyệt tải về (M2 review T199).
    // Cấm dùng URL giao hàng .../authenticated/s--sig--/... vì chữ ký không hết hạn.
    signedDownloadUrl: (publicId, { expiresAt, attachment = true }) =>
      cloudinary.utils.private_download_url(publicId, '', {
        resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(expiresAt.getTime() / 1000), attachment,
      }),
    list: async ({ prefix, cursor }) => {
      const r = await cloudinary.api.resources({ resource_type: 'raw', type: 'authenticated', prefix, max_results: 500, ...(cursor && { next_cursor: cursor }) });
      return { resources: r.resources.map((x) => ({ public_id: x.public_id, bytes: x.bytes, created_at: x.created_at })), next_cursor: r.next_cursor ?? null };
    },
  };
}

// Bản giả: lưu trong Map, đếm lần gọi, giả lỗi. Không có mạng, không có bí mật.
export function createMemoryStorage({ now = () => new Date() } = {}) {
  const files = new Map();
  const calls = { upload: 0, destroy: 0, sign: 0, list: 0 };
  const s = {
    files, calls, signed: [],
    failUpload: false, failSign: false, failDestroy: false,
    tamper: null, // (result) => result: giả response upload sai (kiểm bước xác minh)
    async upload(buffer, { publicId }) {
      calls.upload += 1;
      if (s.failUpload) throw new Error('storage down');
      if (files.has(publicId)) throw new Error('đã tồn tại (overwrite=false)');
      files.set(publicId, { buffer, bytes: buffer.length, created_at: now().toISOString() });
      const r = { public_id: publicId, bytes: buffer.length, type: 'authenticated', resource_type: 'raw' };
      return s.tamper ? s.tamper(r) : r;
    },
    async destroy(publicId) {
      calls.destroy += 1;
      if (s.failDestroy) throw new Error('storage down');
      files.delete(publicId);
      return { result: 'ok' };
    },
    signedDownloadUrl(publicId, { expiresAt, attachment = true }) {
      calls.sign += 1;
      if (s.failSign) throw new Error('storage down');
      const url = `https://api.cloudinary.test/v1_1/demo/raw/download?public_id=${encodeURIComponent(publicId)}&type=authenticated&expires_at=${Math.floor(expiresAt.getTime() / 1000)}${attachment ? '&attachment=true' : ''}&signature=fake`;
      s.signed.push(url);
      return url;
    },
    async list({ prefix, cursor }) {
      calls.list += 1;
      const all = [...files].filter(([id]) => id.startsWith(prefix ?? '')).sort(([a], [b]) => (a < b ? -1 : 1));
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + 2); // trang nhỏ để test phân trang
      return {
        resources: page.map(([id, f]) => ({ public_id: id, bytes: f.bytes, created_at: f.created_at })),
        next_cursor: start + 2 < all.length ? String(start + 2) : null,
      };
    },
  };
  return s;
}
