'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  sectionKey: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

// Aísla cada sección de la home del proyecto: si una falla al renderizar
// (dato inesperado, componente roto), desaparece ESA sección y el resto de
// la página sigue en pie — antes un solo error tumbaba la home entera con
// la pantalla global de "Algo salió mal". Se usa siempre envuelto en un
// <Suspense> (ver app/proyecto/[slug]/page.tsx): durante el SSR React no
// consulta error boundaries, así que el Suspense hace que esa sección se
// re-renderice en el cliente, donde este boundary sí la atrapa.
export default class SectionBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[sitio público] la sección "${this.props.sectionKey}" falló al renderizar`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
