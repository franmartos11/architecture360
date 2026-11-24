// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MetricsResponse } from '@/lib/analytics/metrics';
import MetricsSummary from './MetricsSummary';

const data = (fichas?: number): MetricsResponse => ({
  range: '30d' as MetricsResponse['range'],
  summary: {
    visitors: 40, sessions: 55, unit_viewers: 20, tour_viewers: 8, web_converters: 4, web_leads: 3,
    whatsapp_clickers: 1, other_leads: 5, mobile_visitors: 30, desktop_visitors: 10, rate: 0.1,
    ...(fichas === undefined ? {} : { ficha_downloads: fichas }),
  } as MetricsResponse['summary'],
  units: [],
  sources: { channels: [], unregistered: [], direct: [] },
});

describe('MetricsSummary', () => {
  afterEach(cleanup);

  it('muestra las fichas descargadas', () => {
    render(<MetricsSummary data={data(7)} onGoToChannels={() => {}} />);
    const label = screen.getByText('Fichas descargadas desde el sitio');
    expect(label.parentElement?.textContent).toContain('7');
  });

  it('sin el dato (base sin el SQL nuevo) muestra 0', () => {
    render(<MetricsSummary data={data()} onGoToChannels={() => {}} />);
    const text = screen.getByText('Fichas descargadas desde el sitio').parentElement?.textContent ?? '';
    expect(text).toContain('0');
    expect(text).not.toMatch(/NaN|undefined/);
  });
});
