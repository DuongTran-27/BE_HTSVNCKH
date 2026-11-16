// `npm run dev` (gốc): sau khi db:dev:up xong, chạy API + web trong cùng một terminal. Ctrl+C dừng cả hai (DB dev vẫn chạy).
import { spawn, spawnSync } from 'node:child_process';

const children = ['dev:api', 'dev:web'].map((script) => spawn('npm', ['run', script], { stdio: 'inherit', shell: true }));

let stopping = false;
const stopAll = (code) => {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // shell: true trên Windows tạo cây tiến trình; kill() chỉ giết cmd.exe, còn node/vite vẫn giữ cổng
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
  process.exit(code);
};

for (const c of children) c.on('exit', (code) => stopAll(code ?? 1));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
