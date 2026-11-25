import { describe, expect, it, vi } from 'vitest';
import { leerChatPublico } from './public-chat';

describe('leerChatPublico', () => {
  it('con el chat encendido devuelve el nombre del bot', async () => {
    const rpc = vi.fn(async () => ({ data: { nombre_bot: 'Sofía' }, error: null }));
    expect(await leerChatPublico(rpc, 'p1')).toEqual({ nombreBot: 'Sofía' });
    expect(rpc).toHaveBeenCalledWith('public_project_chat', { p_project_id: 'p1' });
  });

  it('sin nombre: null', async () => {
    expect(await leerChatPublico(async () => ({ data: { nombre_bot: '  ' }, error: null }), 'p1')).toEqual({ nombreBot: null });
  });

  it('apagado, con error o sin la función en la base: sin chat', async () => {
    expect(await leerChatPublico(async () => ({ data: null, error: null }), 'p1')).toBeUndefined();
    expect(await leerChatPublico(async () => ({ data: null, error: { message: 'no existe' } }), 'p1')).toBeUndefined();
    expect(await leerChatPublico(async () => { throw new Error('x'); }, 'p1')).toBeUndefined();
  });
});
