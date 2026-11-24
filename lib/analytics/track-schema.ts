import { z } from 'zod';

// Lo que el tracker del sitio público le manda a POST /api/track.
export const TRACK_TYPES = ['page', 'unit', 'tour', 'brief', 'whatsapp', 'ficha'] as const;
export type TrackType = (typeof TRACK_TYPES)[number];

export const trackSchema = z.object({
  /** Lo genera el navegador: con el mismo id se completa después la duración de una unidad. */
  id: z.uuid(),
  projectSlug: z.string().min(1).max(100),
  visitorId: z.uuid(),
  sessionId: z.uuid(),
  type: z.enum(TRACK_TYPES),
  path: z.string().max(300),
  unitId: z.uuid().optional(),
  ref: z.string().max(60).optional(),
  referrerHost: z.string().max(120).optional(),
  durationSeconds: z.number().int().min(0).optional(),
});

export type TrackPayload = z.infer<typeof trackSchema>;
