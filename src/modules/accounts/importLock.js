// Cờ toàn tiến trình: chỉ một lượt xác nhận nhập CSV chạy tại một thời điểm (QD_ZOD §4.4.5).
// Kiểm và đặt cờ trong cùng một lượt đồng bộ (không có await ở giữa) nên hai request không cùng lọt qua.
// shortcut: đúng với 1 instance; nhiều instance cần khóa dùng chung (pg_try_advisory_lock).
let busy = false;

export const importLock = {
  tryAcquire() {
    if (busy) return false;
    busy = true;
    return true;
  },
  release() {
    busy = false;
  },
};
