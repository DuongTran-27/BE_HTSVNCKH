import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { topicCreateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { applyServerErrors } from '../../lib/forms.js';
import { toast } from '../../lib/toast.js';
import { FormField } from '../../components/FormField.jsx';
import { Options, QueryBox, btnPrimary } from '../../components/ui.jsx';

// R5 – UI §4.5
export function TopicCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const rounds = useQuery({ queryKey: ['rounds', 'all'], queryFn: async () => (await api('/rounds?pageSize=100')).items });
  const { register, handleSubmit, setError, formState: { errors } } = useForm({ resolver: zodResolver(topicCreateSchema), defaultValues: { roundId: '', title: '' } });
  const create = useMutation({
    mutationFn: (body) => api('/topics', { method: 'POST', body }),
    onSuccess: ({ topic }) => {
      qc.setQueryData(['topic', topic.id], topic);
      qc.invalidateQueries({ queryKey: ['topics'] });
      toast(`Đã tạo đề tài ${topic.code}`, { type: 'success' });
      navigate(`/de-tai/${topic.id}/sua`);
    },
    onError: (err) => {
      if (err.sessionExpired) return;
      // REGISTRATION_CLOSED gắn vào ô đợt (UI §4.5); lỗi khác theo details hoặc cấp form
      if (err.code === 'REGISTRATION_CLOSED') setError('roundId', { type: 'server', message: err.message });
      else applyServerErrors(err, setError, ['roundId', 'title']).forEach((m) => setError('root', { message: m }));
    },
  });
  return (
    <section>
      <h1 className="text-2xl font-semibold">Tạo đề tài</h1>
      <QueryBox query={rounds} empty="Khoa chưa mở đợt đăng ký nào." isEmpty={(d) => d.length === 0}>
        {(items) => (
          <form noValidate onSubmit={handleSubmit((v) => create.mutate({ roundId: v.roundId, title: v.title }))} className="mt-4 max-w-xl space-y-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <FormField label="Đợt đăng ký" error={errors.roundId?.message}>
              <select {...register('roundId')}>
                <Options placeholder="Chọn đợt" options={items.map((r) => ({ value: r.id, label: `${r.name} – ${r.academicYear} (${r.registrationOpen ? 'Đang mở đăng ký' : 'Chưa mở hoặc đã đóng đăng ký'})` }))} />
              </select>
            </FormField>
            <FormField label="Tên đề tài (có thể bổ sung sau)" error={errors.title?.message}><input type="text" {...register('title')} /></FormField>
            {errors.root?.message && <p role="alert" className="break-words text-red-700">{errors.root.message}</p>}
            <button type="submit" disabled={create.isPending} className={btnPrimary}>{create.isPending ? 'Đang xử lý…' : 'Tạo nháp'}</button>
          </form>
        )}
      </QueryBox>
    </section>
  );
}
