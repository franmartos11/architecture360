'use client';

import { createContext, useContext } from 'react';

// Número de WhatsApp del bot conectado al proyecto (solo dígitos), o null si
// el proyecto no tiene bot conectado. Se provee una vez en el layout público
// del proyecto para que cualquier botón "Consultar por WhatsApp" lo lea sin
// recibirlo por props.
const ProjectWhatsappContext = createContext<string | null>(null);

export function ProjectWhatsappProvider({
  numero,
  children,
}: {
  numero?: string | null;
  children: React.ReactNode;
}) {
  return (
    <ProjectWhatsappContext.Provider value={numero || null}>
      {children}
    </ProjectWhatsappContext.Provider>
  );
}

export function useProjectWhatsapp(): string | null {
  return useContext(ProjectWhatsappContext);
}
