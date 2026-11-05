import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const COLORS = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#4d7c0f', '#475569'];

/** Biểu đồ từ đúng `rows` của API (cùng số với bảng và CSV). Bảng bên dưới là bản đọc được bằng trình đọc màn hình */
export function StatsChart({ rows, type, label }) {
  return (
    <div role="img" aria-label={`Biểu đồ ${label}: ${rows.map((r) => `${r.label} ${r.count}`).join(', ')}`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {type === 'pie' ? (
          <PieChart>
            <Pie data={rows} dataKey="count" nameKey="label" outerRadius="80%">
              {rows.map((r, i) => <Cell key={String(r.key)} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : (
          <BarChart data={rows} margin={{ left: 0, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" interval={0} tick={{ fontSize: 11 }} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis allowDecimals={false} width={32} />
            <Tooltip />
            <Bar dataKey="count" name="Số đề tài" fill="#1d4ed8" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
