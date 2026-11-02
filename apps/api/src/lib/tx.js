// Transaction có khóa dòng (API_GD2 §1.8). lock_timeout PHẢI < timeout của transaction, nếu không Prisma báo P2028 thay vì 55P03.
export const LOCK_TIMEOUT = '3s';
export const LOCK_TX_OPTIONS = { timeout: 15000, maxWait: 5000 };
export const withLockTx = (prisma, fn) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('lock_timeout', ${LOCK_TIMEOUT}, true)`; // câu ĐẦU TIÊN, trước mọi câu lấy khóa
    return fn(tx);
  }, LOCK_TX_OPTIONS);
