import { z } from 'zod';

// Lo que manda lib/signed-upload.ts para pedir una URL firmada: los datos
// del archivo, no el archivo. El peso lo declara el cliente — alcanza
// para cortar temprano con un mensaje claro; el tope duro lo pone el
// file_size_limit del bucket en Supabase.
export const uploadTicketSchema = z.object({
  name: z.string().min(1, 'Falta el archivo').max(255),
  type: z.string().max(100),
  size: z.number().int().nonnegative(),
  folder: z.string().max(100).optional(),
});
