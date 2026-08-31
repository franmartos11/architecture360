import { describe, it, expect } from 'vitest';
import { clientIp } from './request-ip';

function req(headers: Record<string, string>) {
  return new Request('http://localhost/api/test', { headers });
}

describe('clientIp', () => {
  it('toma la primera IP de x-forwarded-for cuando hay varios hops', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))).toBe('1.2.3.4');
  });

  it('recorta espacios alrededor de la primera IP', () => {
    expect(clientIp(req({ 'x-forwarded-for': '  1.2.3.4  , 10.0.0.1' }))).toBe('1.2.3.4');
  });

  it('cae a x-real-ip si no hay x-forwarded-for', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('prefiere x-forwarded-for por sobre x-real-ip si ambos están', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '9.9.9.9' }))).toBe('1.1.1.1');
  });

  it('devuelve null si no hay ningún header de IP', () => {
    expect(clientIp(req({}))).toBeNull();
  });
});
