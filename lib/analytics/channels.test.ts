import { describe, it, expect } from 'vitest';
import { channelSlug, channelLink, filterLeadsByChannel, leadChannelLabel, NO_CHANNEL } from './channels';

describe('channelSlug', () => {
  it('nombre libre a slug de link', () => {
    expect(channelSlug('Inmobiliaria Pérez & Asoc.')).toBe('inmobiliaria-perez-asoc');
  });
  it('recorta a 60', () => {
    expect(channelSlug('a'.repeat(80))).toHaveLength(60);
  });
  it('sin letras ni números: vacío', () => {
    expect(channelSlug('¡¡¡')).toBe('');
  });
});

describe('channelLink', () => {
  it('con dominio propio', () => {
    expect(channelLink('perez', 'torre', 'https://app.atrium.com', 'torre.com')).toBe('https://torre.com/?ref=perez');
  });
  it('sin dominio propio: /proyecto/slug del panel', () => {
    expect(channelLink('perez', 'torre', 'http://localhost:3000')).toBe('http://localhost:3000/proyecto/torre?ref=perez');
  });
});

describe('filterLeadsByChannel / leadChannelLabel', () => {
  const leads = [{ id: 'a', ref: 'perez' }, { id: 'b', ref: null }, { id: 'c', ref: 'instagram' }, { id: 'd' }];

  it('null: todos', () => {
    expect(filterLeadsByChannel(leads, null).map(l => l.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('un ref: solo ese', () => {
    expect(filterLeadsByChannel(leads, 'perez').map(l => l.id)).toEqual(['a']);
  });
  it('__none__: los que no tienen canal', () => {
    expect(filterLeadsByChannel(leads, NO_CHANNEL).map(l => l.id)).toEqual(['b', 'd']);
  });
  it('etiqueta: nombre del canal registrado, o el ref crudo, o vacío', () => {
    const chans = [{ slug: 'perez', name: 'Inmobiliaria Pérez' }];
    expect(leadChannelLabel('perez', chans)).toBe('Inmobiliaria Pérez');
    expect(leadChannelLabel('instagram', chans)).toBe('?ref=instagram');
    expect(leadChannelLabel(null, chans)).toBeNull();
  });
});
