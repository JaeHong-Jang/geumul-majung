import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ByproductPicker } from './ui/ByproductPicker';
import type { Byproduct } from './byproducts';

afterEach(cleanup);
function Example() {
  const [rows, setRows] = useState<Byproduct[]>([]);
  return <ByproductPicker value={rows} onChange={setRows} />;
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

it('품목 칩을 바꿔도 아래쪽 목록 누적, 같은 재질을 다시 누르면 해제, 개별 삭제', () => {
  render(<Example />);
  click('폐합성수지'); click('PP');
  click('고철'); click('철');
  const summary = screen.getByRole('region', { name: '추가한 품목' });
  expect(within(summary).getAllByRole('listitem')).toHaveLength(2);
  expect(within(summary).getByText('PP')).toBeVisible();
  expect(within(summary).getByText('철')).toBeVisible();
  expect(within(screen.getByRole('group', { name: '품목' })).getByRole('button', { name: /폐합성수지/ })).toHaveTextContent('1');
  expect(screen.getByRole('group', { name: '품목' }).compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  click('철');
  expect(within(summary).getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(within(screen.getByRole('group', { name: '품목' })).getByRole('button', { name: /폐합성수지/ }));
  expect(screen.getByRole('button', { name: 'PP' })).toHaveAttribute('aria-pressed', 'true');
  click('PE');
  expect(within(summary).getAllByRole('listitem')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '폐합성수지 PP 삭제' }));
  expect(within(summary).getAllByRole('listitem')).toHaveLength(1);
  expect(within(summary).getByText('PE')).toBeVisible();
});

it('목록에 없는 재질도 직접 입력해 추가', () => {
  render(<Example />);
  click('기타 폐기물');
  fireEvent.change(screen.getByLabelText('재질 또는 부산물명'), { target: { value: '  공정 부산물  ' } });
  click('품목 추가');
  expect(within(screen.getByRole('region', { name: '추가한 품목' })).getByText('공정 부산물')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('추가 완료');
});
