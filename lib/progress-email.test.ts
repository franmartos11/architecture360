import { describe, it, expect } from 'vitest';
import { buildProgressEmail } from './progress-email';

const base = {
  projectName: 'Torre <Mar>',
  progress: { stages: [], updates: [], percent: 40, deliveryEstimate: 'Dic "2027"' },
  projectUrl: 'https://torre.com/proyecto/torre#algo',
  unsubscribeUrl: 'https://torre.com/api/leads/unsubscribe?lead=1&t=2',
};

describe('buildProgressEmail', () => {
  it('escapa todo el texto que viene del usuario', () => {
    const { subject, html } = buildProgressEmail({
      ...base,
      update: { id: 'a"b', date: '2026-10-01', title: '<script>x</script>', body: 'a & <img src=x onerror=1>', images: ['https://x.com/a.jpg"onload="1'] },
    });
    expect(subject).toBe('Novedades de la obra · Torre <Mar>'); // el asunto es un header, no HTML
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Dic &quot;2027&quot;');
    expect(html).not.toContain('"onload="');
    expect(html).toContain('#avance-a%22b'); // el id va codificado en el hash
  });

  it('sin portada de fotos no arma imagen; con porcentaje y baja', () => {
    const { html } = buildProgressEmail({ ...base, update: { id: 'u', date: '2026-10-01', title: 'T', images: [], video: 'https://x.com/c.mp4' } });
    expect(html).not.toContain('<img');
    expect(html).toContain('40%');
    expect(html).toContain('/api/leads/unsubscribe?lead=1&amp;t=2');
    expect(html).toContain('https://torre.com/proyecto/torre#avance-u');
  });

  it('descarta una portada que no es http(s)', () => {
    const { html } = buildProgressEmail({ ...base, update: { id: 'u', date: '2026-10-01', title: 'T', images: ['javascript:alert(1)'] } });
    expect(html).not.toContain('javascript:');
  });
});
