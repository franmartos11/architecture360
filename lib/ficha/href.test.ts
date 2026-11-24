import { describe, it, expect } from 'vitest';
import { fichaHref } from './href';

const U = '11111111-1111-4111-8111-111111111111';

describe('fichaHref', () => {
  it('sin ref', () => {
    expect(fichaHref('torre-sol', U, null)).toBe(`/api/ficha/torre-sol/${U}`);
  });
  it('con ref', () => {
    expect(fichaHref('torre-sol', U, 'inmo-sur')).toBe(`/api/ficha/torre-sol/${U}?ref=inmo-sur`);
  });
});
