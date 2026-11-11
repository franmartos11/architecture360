'use client';

import { createContext, useContext } from 'react';

// El dominio propio ACTIVO del proyecto que se está editando (www.torre.com), o
// null. Lo carga el layout del panel en el servidor (lib/project-domains.ts) y lo
// leen las pantallas que muestran o copian el link público, para que sea la
// dirección definitiva y no la de la plataforma.
const CustomDomainContext = createContext<string | null>(null);

export function CustomDomainProvider({ hostname, children }: { hostname: string | null; children: React.ReactNode }) {
  return <CustomDomainContext.Provider value={hostname}>{children}</CustomDomainContext.Provider>;
}

export function useCustomDomain(): string | null {
  return useContext(CustomDomainContext);
}
