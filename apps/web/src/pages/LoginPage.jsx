import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@nckh/shared';
import { useNavigate, useSearchParams } from 'react-router';
import { login } from '../lib/api.js';
import { applyServerErrors } from '../lib/forms.js';
import { useCooldown } from '../lib/useCooldown.js';
import { homePath, safeNext } from '../lib/nav.js';
import { FormField } from '../components/FormField.jsx';
import { btnPrimary } from '../components/ui.jsx';
import { BookOpenCheck, Eye, EyeOff, FlaskConical, ShieldCheck, Users } from 'lucide-react';

const FEATURES = [
  [BookOpenCheck, 'Đăng ký và theo dõi đề tài theo từng đợt'],
  [Users, 'Kết nối nhóm sinh viên với giảng viên hướng dẫn'],
  [ShieldCheck, 'Kiểm tra trùng lặp và xét duyệt minh bạch'],
];

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState('');
  const cd = useCooldown();
  const { register, handleSubmit, setError, resetField, setFocus, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const user = await login(values);
      navigate(user.mustChangePassword ? '/doi-mat-khau' : (safeNext(params.get('next')) ?? homePath(user.role)), { replace: true });
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
      <div className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-violet-600/50 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-40 -left-24 size-[30rem] rounded-full bg-blue-600/50 blur-3xl" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.12)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent)] bg-[size:22px_22px]" />
        <p className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="grid size-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur"><FlaskConical aria-hidden="true" className="size-5" /></span>NCKH Khoa CNTT
        </p>
        <div className="relative">
          <p className="max-w-md bg-gradient-to-br from-white to-blue-200 bg-clip-text text-4xl leading-tight font-bold tracking-tight text-transparent">Quản lý nghiên cứu khoa học sinh viên</p>
          <ul className="mt-10 space-y-3 text-slate-200">
            {FEATURES.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur"><span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-blue-500/40 to-violet-500/40"><Icon aria-hidden="true" className="size-4" /></span>{text}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-slate-400">Khoa Công nghệ Thông tin</p>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm animate-fade-up rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-xl backdrop-blur-xl sm:p-8">
      <p className="mb-8 flex items-center gap-2 font-semibold text-blue-800 lg:hidden"><FlaskConical aria-hidden="true" className="size-5" />NCKH Khoa CNTT</p>
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
      </div>
      </div>
    </main>
  );
}
