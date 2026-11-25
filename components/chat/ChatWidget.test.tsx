// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

const track = vi.fn();
vi.mock('@/components/analytics/SiteTracker', () => ({ useTrack: () => track }));
vi.mock('@/lib/analytics/client-state', () => ({
  readAttribution: () => ({ visitorId: '22222222-2222-4222-8222-222222222222', ref: 'perez' }),
  safeStorage: () => window.localStorage,
}));

import ChatWidget from './ChatWidget';

const T = '11111111-1111-4111-8111-111111111111';
const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  track.mockClear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'Abrir chat' }));
const escribir = (texto: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Tu mensaje' }), { target: { value: texto } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
};
const cuerpo = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body as string);

describe('ChatWidget', () => {
  it('abre con el saludo del bot y tres sugerencias', () => {
    render(<ChatWidget projectSlug="torre-sol" nombreBot="Sofía" />);
    abrir();
    expect(screen.getByText(/Soy Sofía/)).toBeTruthy();
    for (const s of ['¿Qué unidades hay disponibles?', '¿Tienen planes de pago?', 'Quiero agendar una visita']) {
      expect(screen.getByRole('button', { name: s })).toBeTruthy();
    }
  });

  it('sin nombre se presenta como el asistente virtual', () => {
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    expect(screen.getByText(/el asistente virtual/)).toBeTruthy();
  });

  it('manda el mensaje con la atribución, muestra "escribiendo…" y después la respuesta con imágenes', async () => {
    let soltar!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { soltar = r; }));
    render(<ChatWidget projectSlug="torre-sol" nombreBot="Sofía" />);
    abrir();
    escribir('Hola');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat/torre-sol');
    expect(cuerpo(0)).toEqual({ mensaje: 'Hola', visitorId: '22222222-2222-4222-8222-222222222222', ref: 'perez' });
    expect(screen.getByText('escribiendo…')).toBeTruthy();
    soltar(new Response(JSON.stringify({ token: T, partes: ['¡Hola!', '¿Qué buscás?'], imagenes: ['https://x/f.jpg'] }), { status: 200 }));
    await screen.findByText('¿Qué buscás?');
    expect(screen.getByText('¡Hola!')).toBeTruthy();
    expect(screen.getByAltText('Imagen del proyecto').getAttribute('src')).toBe('https://x/f.jpg');
    expect(screen.queryByText('escribiendo…')).toBeNull();
  });

  it('un documento se muestra como link para abrir el PDF', async () => {
    fetchMock.mockReturnValueOnce(ok({ token: T, partes: ['Acá va.'], imagenes: [], documentos: ['https://x/brief.pdf'] }));
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    escribir('Pasame el brief');
    const link = await screen.findByRole('link', { name: /Abrir el PDF/ });
    expect(link.getAttribute('href')).toBe('https://x/brief.pdf');
    expect(screen.queryByAltText('Imagen del proyecto')).toBeNull();
  });

  it('guarda el token, lo manda en el siguiente mensaje y registra la charla una sola vez', async () => {
    fetchMock.mockReturnValueOnce(ok({ token: T, partes: ['a'], imagenes: [] })).mockReturnValueOnce(ok({ token: T, partes: ['b'], imagenes: [] }));
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    escribir('uno');
    await screen.findByText('a');
    escribir('dos');
    await screen.findByText('b');
    expect(cuerpo(1).token).toBe(T);
    expect(JSON.parse(window.localStorage.getItem('atrium_chat_torre-sol')!).token).toBe(T);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('chat');
  });

  it('una sugerencia se manda como mensaje', async () => {
    fetchMock.mockReturnValueOnce(ok({ token: T, partes: ['Hay 3.'], imagenes: [] }));
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    fireEvent.click(screen.getByRole('button', { name: '¿Qué unidades hay disponibles?' }));
    await screen.findByText('Hay 3.');
    expect(cuerpo(0).mensaje).toBe('¿Qué unidades hay disponibles?');
  });

  it('con una charla guardada, al abrir la retoma', async () => {
    window.localStorage.setItem('atrium_chat_torre-sol', JSON.stringify({ token: T, at: Date.now() }));
    fetchMock.mockReturnValueOnce(ok({ mensajes: [{ autor: 'cliente', tipo: 'texto', cuerpo: 'Hola de antes' }, { autor: 'bot', tipo: 'texto', cuerpo: 'Respuesta de antes' }] }));
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    await screen.findByText('Respuesta de antes');
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/chat/torre-sol?token=${T}`);
    expect(screen.getByText('Hola de antes')).toBeTruthy();
  });

  it('una charla que ya no existe se olvida', async () => {
    window.localStorage.setItem('atrium_chat_torre-sol', JSON.stringify({ token: T, at: Date.now() }));
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response('{}', { status: 404 })));
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    await waitFor(() => expect(window.localStorage.getItem('atrium_chat_torre-sol')).toBeNull());
  });

  it.each([
    ['limite_dia', 'Ahora no puedo responder. Dejanos tu consulta en el formulario de contacto.'],
    ['limite_charla', 'Llegamos al límite de esta charla. Dejanos tu contacto y te escribimos.'],
  ])('tope %s: mensaje claro', async (error, texto) => {
    fetchMock.mockReturnValueOnce(ok({ token: null, partes: [], imagenes: [], error }));
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    escribir('Hola');
    await screen.findByText(texto);
  });

  it('si falla el envío: "No se pudo enviar." y Reintentar manda el mismo mensaje', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockReturnValueOnce(ok({ token: T, partes: ['Ahora sí'], imagenes: [] }));
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    escribir('Hola');
    await screen.findByText('No se pudo enviar.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Ahora sí');
    expect(cuerpo(1).mensaje).toBe('Hola');
    expect(screen.getAllByText('Hola')).toHaveLength(1);
  });

  it('el campo no deja más de 1000 caracteres', () => {
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    expect(screen.getByRole('textbox', { name: 'Tu mensaje' }).getAttribute('maxlength')).toBe('1000');
  });

  it('se cierra', () => {
    render(<ChatWidget projectSlug="torre-sol" nombreBot={null} />);
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar chat' }));
    expect(screen.queryByRole('textbox', { name: 'Tu mensaje' })).toBeNull();
  });
});
