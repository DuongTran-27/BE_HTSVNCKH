import { describe, expect, it } from 'vitest';
import { wordDiff } from './diff.js';

describe('wordDiff', () => {
  it('giống nhau -> một đoạn same', () => expect(wordDiff('a b', 'a b')).toEqual([{ type: 'same', text: 'a b' }]));
  it('thêm và bớt từ', () => {
    const d = wordDiff('học máy cơ bản', 'học máy nâng cao');
    expect(d.filter((p) => p.type === 'del').map((p) => p.text.trim())).toEqual(['cơ bản']);
    expect(d.filter((p) => p.type === 'add').map((p) => p.text.trim())).toEqual(['nâng cao']);
  });
  it('rỗng -> toàn bộ là thêm', () => expect(wordDiff('', 'x')).toEqual([{ type: 'add', text: 'x' }]));
});
