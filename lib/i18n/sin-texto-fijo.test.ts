// Guardián del sitio en varios idiomas: en los componentes ya migrados no
// puede quedar texto visible escrito a mano (tiene que salir del diccionario,
// lib/i18n/messages). Revisa con el parser de TypeScript:
//  - texto JSX entre etiquetas;
//  - strings y templates dentro de {…} que son hijos de JSX;
//  - atributos visibles escritos a mano (aria-label, placeholder, alt, title, label).
// Lo que es igual en todos los idiomas (WhatsApp, 360°, m², 3D...) está permitido.
// Spec: docs/superpowers/specs/2026-11-25-multi-idioma-design.md
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const RAIZ = path.resolve(__dirname, '../..');

/** Zonas del sitio público; cada una se migra entera. */
const ZONAS: Record<string, string[]> = {
  sitio: [
    'components/ui/Navbar.tsx',
    'components/ui/ProjectMenu.tsx',
    'components/ui/ProjectChrome.tsx',
    'components/ui/ExploreSwitcher.tsx',
    'components/ui/LeadCaptureModal.tsx',
    'components/ui/MortgageCalculatorModal.tsx',
    'components/ui/ShareMenu.tsx',
    'components/project-landing',
    'components/HomeContactForm.tsx',
    'components/BeforeAfterSlider.tsx',
    'components/CommentSection.tsx',
    'components/ProcessGallery.tsx',
    'components/SwiperCarousels.tsx',
    'components/TabsSection.tsx',
    'app/proyecto',
  ],
  plano: ['components/units', 'components/floorplan'],
  unidad: ['components/unit'],
  resto: [
    'components/amenities',
    'components/aerial',
    'components/location',
    'components/masterplan',
    'components/tour',
    'components/financing',
    'components/bim',
    'components/Calculator.tsx',
    'components/chat',
    'components/i18n',
  ],
};

/** Archivos que se ven en el sitio pero son del panel (el dueño en vista previa): no se traducen. */
const EXCLUIDOS = new Set(['components/project-landing/DraftPreviewBar.tsx']);

const ATRIBUTOS_VISIBLES = new Set(['aria-label', 'placeholder', 'alt', 'title', 'label']);
/** Iguales en todos los idiomas. */
const PERMITIDAS = /\b(WhatsApp|BIM|3D|2D|PDF|USD|ARS|UVA|CAC|Instagram|Facebook|LinkedIn|YouTube|Atrium|ES|EN|OK|km|m²|m2)\b/g;
const TIENE_PALABRA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/;

function archivos(entrada: string): string[] {
  const abs = path.join(RAIZ, entrada);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return /\.tsx$/.test(entrada) ? [entrada] : [];
  return fs.readdirSync(abs).flatMap(n => archivos(path.join(entrada, n)));
}

function esTexto(s: string): boolean {
  return TIENE_PALABRA.test(s.replace(PERMITIDAS, ''));
}

function textosFijos(rel: string): string[] {
  const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hallados: string[] = [];
  const anotar = (n: ts.Node, texto: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
    hallados.push(`${rel}:${line + 1}  ${texto.trim().slice(0, 70)}`);
  };
  // Strings dentro de una expresión que es hija de JSX ({cond ? 'Sí' : 'No'}).
  const enExpresion = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (esTexto(n.text)) anotar(n, n.text);
    } else if (ts.isTemplateExpression(n)) {
      const partes = [n.head.text, ...n.templateSpans.map(s => s.literal.text)].join(' ');
      if (esTexto(partes)) anotar(n, partes);
    }
    // No se baja a JSX anidado (lo revisa visitar) ni a llamadas: t('clave') es la forma correcta.
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || ts.isCallExpression(n)) return;
    ts.forEachChild(n, enExpresion);
  };
  const visitar = (n: ts.Node) => {
    if (ts.isJsxText(n) && esTexto(n.text)) anotar(n, n.text);
    if (ts.isJsxExpression(n) && n.expression && !ts.isJsxAttribute(n.parent)) enExpresion(n.expression);
    if (ts.isJsxAttribute(n) && ATRIBUTOS_VISIBLES.has(n.name.getText(sf)) && n.initializer) {
      const ini = n.initializer;
      if (ts.isStringLiteral(ini) && esTexto(ini.text)) anotar(ini, ini.text);
      if (ts.isJsxExpression(ini) && ini.expression) enExpresion(ini.expression);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return hallados;
}

describe.each(Object.entries(ZONAS))('sin texto fijo: %s', (_zona, entradas) => {
  it('todo el texto visible sale del diccionario', () => {
    const lista = entradas
      .flatMap(archivos)
      .filter(f => !/\.test\.tsx$/.test(f) && !EXCLUIDOS.has(f));
    const hallados = lista.flatMap(textosFijos);
    expect(hallados, `Texto fijo:\n${hallados.join('\n')}`).toEqual([]);
  });
});
