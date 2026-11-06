import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ConfirmDialog } from './ui.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';

afterEach(cleanup);

function Host({ reason }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Mở</button>
      {open && (reason
        ? <ReasonDialog title="Từ chối" confirmLabel="Gửi" onSubmit={vi.fn()} onCancel={() => setOpen(false)} />
        : <ConfirmDialog title="Xóa?" message="Chắc chưa" onConfirm={vi.fn()} onCancel={() => setOpen(false)} />)}
    </>
  );
}

describe('hộp thoại truy cập được', () => {
  it('ReasonDialog: focus vào ô lý do, Tab/Shift+Tab xoay vòng, Esc đóng và trả focus', () => {
    render(<Host reason />);
    const opener = screen.getByText('Mở');
    opener.focus();
    fireEvent.click(opener);
    const area = screen.getByLabelText('Lý do');
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Gửi'));
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('ConfirmDialog: focus vào Hủy, Esc đóng', () => {
    render(<Host />);
    fireEvent.click(screen.getByText('Mở'));
    expect(document.activeElement).toBe(screen.getByText('Hủy'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
