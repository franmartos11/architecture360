export interface TransferTargetInput {
  ownerId: string;
  ownerHasHandle: boolean;
  targetId: string | null;
  hasPending: boolean;
}

// Reglas previas a crear una transferencia de propiedad. El orden importa:
// primero lo que depende de la persona dueña, después el destino y por
// último el estado del proyecto.
export function validateTransferTarget(
  { ownerId, ownerHasHandle, targetId, hasPending }: TransferTargetInput,
): { error: string; status: 400 | 404 | 409 } | null {
  // Al aceptar, la dueña anterior pasa a project_members (FK a profiles):
  // sin fila de perfil con handle no habría forma de dejarla en el equipo.
  if (!ownerHasHandle) return { error: 'Necesitás un perfil con handle para transferir', status: 400 };
  if (targetId === null) return { error: 'No existe ningún perfil con ese handle', status: 404 };
  if (targetId === ownerId) return { error: 'Ya sos el dueño de este proyecto', status: 400 };
  if (hasPending) return { error: 'Ya hay una transferencia pendiente: cancelala primero', status: 409 };
  return null;
}
