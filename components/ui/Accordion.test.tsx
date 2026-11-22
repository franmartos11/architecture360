// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useState } from 'react';
import MotionProvider from './MotionProvider';
import { Accordion, AccordionItem } from './Accordion';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

afterEach(cleanup);

function Harness({ collapsible = false }: { collapsible?: boolean }) {
  const [value, setValue] = useState('a');
  return (
    <MotionProvider>
      <Accordion value={value} onChange={setValue} collapsible={collapsible}>
        <AccordionItem value="a" label="Primera"><p>Contenido A</p></AccordionItem>
        <AccordionItem value="b" label="Segunda"><p>Contenido B</p></AccordionItem>
      </Accordion>
    </MotionProvider>
  );
}

describe('Accordion', () => {
  it('muestra solo la sección abierta y enlaza el disparador con su panel', () => {
    render(<Harness />);
    const a = screen.getByRole('button', { name: /Primera/ });
    expect(a.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(a.getAttribute('aria-controls')!)?.textContent).toBe('Contenido A');
    expect(screen.queryByText('Contenido B')).toBeNull();
  });

  it('abrir otra sección cierra la anterior', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Segunda/ }));
    expect(screen.getByText('Contenido B')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Contenido A')).toBeNull());
    expect(screen.getByRole('button', { name: /Segunda/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('collapsible: reclickear la abierta la cierra', async () => {
    render(<Harness collapsible />);
    fireEvent.click(screen.getByRole('button', { name: /Primera/ }));
    await waitFor(() => expect(screen.queryByText('Contenido A')).toBeNull());
    expect(screen.getByRole('button', { name: /Primera/ }).getAttribute('aria-expanded')).toBe('false');
  });
});
