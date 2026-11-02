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
    <main className="mx-auto max-w-sm p-4">
      <h1 className="text-xl font-bold">Đăng nhập</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
        <FormField label="Mã hoặc email" error={errors.identifier?.message}>
          <input type="text" autoComplete="username" autoCapitalize="none" {...register('identifier')} />
        </FormField>
        <FormField label="Mật khẩu" error={errors.password?.message}>
          <input type={show ? 'text' : 'password'} autoComplete="current-password" {...register('password')} />
        </FormField>
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} className="min-h-11 text-sm text-blue-700 underline">
          {show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        </button>
        {formError && <p role="alert" className="text-sm text-red-700 break-words">{formError}</p>}
        {cd.active && <p className="text-sm text-slate-700">{cd.message}</p>}
        <button type="submit" disabled={isSubmitting || cd.active} className="min-h-11 w-full rounded-md bg-blue-700 px-4 font-medium text-white disabled:opacity-60">
          {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  );
}
