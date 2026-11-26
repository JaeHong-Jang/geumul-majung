import test from 'node:test';
import assert from 'node:assert/strict';
import { koreanDate } from '../src/format.js';

test('ledger and downloaded records share Korea-local completion dates across midnight', () => {
  assert.equal(koreanDate('2026-11-05T14:59:59Z'), '2026-11-05');
  assert.equal(koreanDate('2026-11-05T15:00:00Z'), '2026-11-06');
  assert.equal(koreanDate('2026-11-06T00:00:00+09:00'), '2026-11-06');
  assert.equal(koreanDate('invalid'), '');
  assert.equal(koreanDate(null), '');
});
