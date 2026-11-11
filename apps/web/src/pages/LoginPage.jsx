import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@nckh/shared';
import { useNavigate, useSearchParams } from 'react-router';
import { login } from '../lib/api.js';
import { applyServerErrors } from '../lib/forms.js';
import { useCooldown } from '../lib/useCooldown.js';
import { canVisit, homePath, safeNext } from '../lib/nav.js';
import { FormField } from '../components/FormField.jsx';
import { btnPrimary } from '../components/ui.jsx';
import { BookOpenCheck, Eye, EyeOff, FlaskConical, ShieldCheck, Users } from 'lucide-react';

const FEATURES = [
  [BookOpenCheck, 'Đăng ký và theo dõi đề tài theo từng đợt'],
  [Users, 'Kết nối nhóm sinh viên với giảng viên hướng dẫn'],
  [ShieldCheck, 'Kiểm tra trùng lặp và xét duyệt minh bạch'],
];

// Chỉ dev: tài khoản dữ liệu mẫu (prisma/seed.js). Bản build production thay DEV = false nên mảng và mật khẩu bị loại khỏi bundle.
const DEMO_ACCOUNTS = import.meta.env.DEV ? [
  ['Quản trị viên', 'QT001'], ['Cán bộ khoa', 'CB001'], ['Giảng viên', 'GV001'], ['Sinh viên', '2374801030010'],
].map(([label, code]) => ({ label, code, password: 'Nckh@2026-dev' })) : [];

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState('');
  const cd = useCooldown();
  const { register, handleSubmit, setError, resetField, setFocus, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const user = await login(values);
      // next là trang của phiên trước (có thể vai trò khác): vai trò mới không vào được thì về trang chủ của vai trò
      const next = safeNext(params.get('next'));
      navigate(user.mustChangePassword ? '/doi-mat-khau' : (next && canVisit(user.role, next) ? next : homePath(user.role)), { replace: true });
    } catch (err) {
      if (err.status === 429) cd.start(err.retryAfter);
      const msgs = applyServerErrors(err, setError, ['identifier', 'password']);
      setFormError(msgs.join(' '));
      // Giữ ô mã, xóa ô mật khẩu (UI §4.1)
      resetField('password', { defaultValue: '' });
      setFocus('password');
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative isolate hidden overflow-hidden bg-blue-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -z-10 -top-32 -right-32 size-96 rounded-full bg-vlu-red/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -z-10 -bottom-40 -left-24 size-96 rounded-full bg-blue-500/40 blur-3xl" />
        <p className="flex items-center gap-2.5 text-lg font-bold"><FlaskConical aria-hidden="true" className="size-5" />Nghiên cứu khoa học sinh viên</p>
        <div>
          <p className="max-w-md text-5xl leading-[1.1] font-bold tracking-tight">Quản lý nghiên cứu khoa học sinh viên</p>
          <ul className="mt-10 max-w-md divide-y divide-white/15 border-y border-white/15 text-blue-100">
            {FEATURES.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3 py-3"><Icon aria-hidden="true" className="size-4 shrink-0" />{text}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-blue-100/70">Khoa Công nghệ Thông tin</p>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-md sm:p-8">
      <p className="mb-8 flex items-center gap-2 font-semibold text-blue-800 lg:hidden"><FlaskConical aria-hidden="true" className="size-5" />Nghiên cứu khoa học sinh viên</p>
      <h1 className="text-2xl font-bold">Đăng nhập</h1>
      <p className="mt-1 text-sm text-slate-600">Dùng mã sinh viên/giảng viên hoặc email do khoa cấp.</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <FormField label="Mã hoặc email" error={errors.identifier?.message}>
          <input type="text" autoComplete="username" autoCapitalize="none" {...register('identifier')} />
        </FormField>
        <FormField label="Mật khẩu" error={errors.password?.message}>
          <input type={show ? 'text' : 'password'} autoComplete="current-password" {...register('password')} />
        </FormField>
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
          {show ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
          {show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        </button>
        {formError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words">{formError}</p>}
        {cd.active && <p className="text-sm text-slate-700">{cd.message}</p>}
        <button type="submit" disabled={isSubmitting || cd.active} className={`${btnPrimary} w-full`}>
          {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      {import.meta.env.DEV && (
        <section aria-label="Đăng nhập nhanh" className="mt-8 border-t border-slate-300 pt-5">
          <h2 className="text-sm font-semibold">Đăng nhập nhanh (dữ liệu mẫu)</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.code} type="button" disabled={isSubmitting || cd.active}
                onClick={() => { setValue('identifier', a.code); setValue('password', a.password); handleSubmit(onSubmit)(); }}
                className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:border-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                <span className="block font-semibold">{a.label}</span><span className="text-slate-600">{a.code}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      </div>
      </div>
    </main>
  );
}
