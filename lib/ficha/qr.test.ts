import { describe, it, expect } from 'vitest';
import { qrPng } from './qr';

describe('qrPng', () => {
  it('devuelve un PNG', async () => {
    const png = await qrPng('https://x.com/a');
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
