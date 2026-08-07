#!/usr/bin/env node
/**
 * Generador de assets DEMO (placeholder) para el prototipo de recorrido interactivo.
 * No reemplaza contenido real: produce planos 2D esquemáticos y panorámicas 360°
 * ilustradas (SVG) con datos suficientes para probar la mecánica completa
 * (delimitación de deptos/ambientes, tour 360°, recorrido de áreas comunes).
 *
 * Uso: node scripts/generate-demo-assets.mjs
 * Salida: public/floorplans/demo-*.svg, public/tours/demo/*.svg
 *         + imprime por consola los polígonos (%) para pegar en data/mockData.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

// ─── Paleta de marca (tomada de app/globals.css) ───────────────────
const C = {
  green: '#37463f',
  lightgreen: '#83978c',
  brown: '#968676',
  light: '#f5f5f5',
  dark: '#1b1e1c',
};

function write(relPath, content) {
  const full = join(PUBLIC, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
  console.log('✓', relPath);
}

// ─── Helpers de plano 2D (vista cenital) ───────────────────────────
function pctRect([x1, y1, x2, y2], W, H) {
  const x = (x1 / 100) * W, y = (y1 / 100) * H;
  const w = ((x2 - x1) / 100) * W, h = ((y2 - y1) / 100) * H;
  return { x, y, w, h };
}

function bedIcon(x, y, s = 14) {
  return `<g transform="translate(${x},${y})">
    <rect width="${s * 1.6}" height="${s}" rx="2" fill="none" stroke="${C.green}" stroke-width="1"/>
    <circle cx="${s * 0.4}" cy="${s * 0.35}" r="${s * 0.28}" fill="none" stroke="${C.green}" stroke-width="1"/>
  </g>`;
}

function doorArc(x, y, w, flip = false) {
  const sweep = flip ? 1 : 0;
  return `<path d="M ${x} ${y} A ${w} ${w} 0 0 ${sweep} ${flip ? x - w : x + w} ${y - w}" fill="none" stroke="${C.brown}" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="${x}" y1="${y}" x2="${flip ? x - w : x + w}" y2="${y}" stroke="${C.brown}" stroke-width="2"/>`;
}

// ─── 1) Plano del edificio — Torre A, Planta 1 ──────────────────────
function buildBuildingPlan() {
  const W = 1400, H = 900;
  const units = [
    { id: 'A01-01', name: 'A01-01', beds: 1, rect: [3, 6, 24, 40] },
    { id: 'A01-02', name: 'A01-02', beds: 2, rect: [25, 6, 49, 40] },
    { id: 'A01-03', name: 'A01-03', beds: 3, rect: [51, 6, 75, 40] },
    { id: 'A01-04', name: 'A01-04', beds: 1, rect: [76, 6, 97, 40] },
    { id: 'A01-08', name: 'A01-08', beds: 2, rect: [3, 50, 24, 94] },
    { id: 'A01-07', name: 'A01-07', beds: 0, rect: [25, 50, 42, 94] },
    { id: 'A01-05', name: 'A01-05', beds: 2, rect: [44, 50, 72, 94] },
    { id: 'A01-06', name: 'A01-06', beds: 2, rect: [74, 50, 97, 94] },
  ];

  let unitsSvg = '';
  const polygons = {};
  for (const u of units) {
    const [x1, y1, x2, y2] = u.rect;
    const { x, y, w, h } = pctRect(u.rect, W, H);
    unitsSvg += `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.light}" stroke="${C.green}" stroke-width="2"/>
      <text x="${x + w / 2}" y="${y + h / 2 - 6}" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="20" font-weight="700" fill="${C.dark}">${u.name}</text>
      <g transform="translate(${x + w / 2 - (u.beds * 20) / 2},${y + h / 2 + 10})">
        ${Array.from({ length: u.beds }).map((_, i) => bedIcon(i * 20, 0, 14)).join('')}
      </g>
    </g>`;
    // Polygon en % (x,y) — el mismo sistema que ya usa UnitPolygon.tsx
    polygons[u.id] = [
      { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
    ];
  }

  // Puertas hacia el pasillo central
  const doorTop = units.filter(u => u.rect[1] === 6);
  const doorBottom = units.filter(u => u.rect[1] === 50);
  let doorsSvg = '';
  for (const u of doorTop) {
    const cx = ((u.rect[0] + u.rect[2]) / 2 / 100) * W;
    doorsSvg += doorArc(cx, (40 / 100) * H, 18);
  }
  for (const u of doorBottom) {
    const cx = ((u.rect[0] + u.rect[2]) / 2 / 100) * W;
    doorsSvg += doorArc(cx, (50 / 100) * H, 18, true);
  }

  const corridor = pctRect([3, 41, 97, 49], W, H);
  const core = pctRect([46, 42, 54, 48], W, H);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Montserrat, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="${(1 / 100) * W}" y="${(3 / 100) * H}" width="${(98 / 100) * W}" height="${(93 / 100) * H}" fill="none" stroke="${C.dark}" stroke-width="4"/>
  ${unitsSvg}
  <rect x="${corridor.x}" y="${corridor.y}" width="${corridor.w}" height="${corridor.h}" fill="${C.lightgreen}" fill-opacity="0.15" stroke="${C.lightgreen}" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="${W / 2}" y="${corridor.y + corridor.h / 2 + 6}" text-anchor="middle" font-size="16" letter-spacing="2" fill="${C.green}">PALIER</text>
  <rect x="${core.x}" y="${core.y}" width="${core.w}" height="${core.h}" fill="none" stroke="${C.brown}" stroke-width="1.5"/>
  ${doorsSvg}
  <text x="${W / 2}" y="40" text-anchor="middle" font-size="26" font-weight="700" letter-spacing="3" fill="${C.dark}">TORRE A · PLANTA 1</text>
  <text x="${W / 2}" y="64" text-anchor="middle" font-size="13" letter-spacing="2" fill="${C.brown}">PLANO ESQUEMÁTICO DE PROTOTIPO — NO ES PLANO DEFINITIVO</text>
  <g transform="translate(${W - 70},${H - 60})" stroke="${C.dark}" stroke-width="2" fill="none">
    <line x1="0" y1="40" x2="0" y2="0"/><polygon points="0,-8 -6,4 6,4" fill="${C.dark}"/>
    <text x="10" y="4" font-size="14" fill="${C.dark}" stroke="none">N</text>
  </g>
</svg>`;

  write('floorplans/demo-building-plan.svg', svg);
  return polygons;
}

// ─── 2) Plano de ambientes — Unidad A01-01 (SUITE GARDEN) ───────────
function buildUnitRoomPlan() {
  const W = 1000, H = 900;
  const rooms = [
    { id: 'entrada', name: 'Hall de Entrada', rect: [0, 35, 18, 65], tourNodeId: 'entrada' },
    { id: 'living', name: 'Living Comedor', rect: [18, 0, 60, 100], tourNodeId: 'living' },
    { id: 'cocina', name: 'Cocina', rect: [60, 0, 100, 38], tourNodeId: 'cocina' },
    { id: 'dormitorio', name: 'Dormitorio', rect: [60, 38, 84, 100], tourNodeId: 'dormitorio' },
    { id: 'bano', name: 'Baño', rect: [84, 38, 100, 72], tourNodeId: 'bano' },
    { id: 'balcon', name: 'Balcón', rect: [84, 72, 100, 100], tourNodeId: 'balcon' },
  ];

  let svgRooms = '';
  const polygons = {};
  for (const r of rooms) {
    const [x1, y1, x2, y2] = r.rect;
    const { x, y, w, h } = pctRect(r.rect, W, H);
    const isExterior = r.id === 'balcon';
    svgRooms += `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${isExterior ? C.lightgreen : C.light}" fill-opacity="${isExterior ? 0.3 : 1}" stroke="${C.green}" stroke-width="2"/>
      <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="${w < 150 ? 13 : 17}" font-weight="600" fill="${C.dark}">${r.name}</text>
    </g>`;
    polygons[r.id] = { name: r.name, tourNodeId: r.tourNodeId, polygon: [
      { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
    ] };
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Montserrat, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="${C.dark}" stroke-width="6"/>
  ${svgRooms}
  <text x="${W / 2}" y="34" text-anchor="middle" font-size="20" font-weight="700" letter-spacing="2" fill="${C.dark}" stroke="#fff" stroke-width="4" paint-order="stroke">UNIDAD A01-01 · SUITE GARDEN</text>
</svg>`;

  write('floorplans/demo-unit-a0101-rooms.svg', svg);
  return polygons;
}

// ─── 3) Panorámicas 360° esquemáticas (equirectangulares 2:1) ───────
const W = 2048, H = 1024;
const FLOOR_H = H * 0.24;
const CEIL_H = H * 0.14;

function panoShell({ title, subtitle, wallColor, floorColor = '#cbb89a', accent = C.brown, content = '' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Montserrat, sans-serif">
  <defs>
    <linearGradient id="ceil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="${wallColor}"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${floorColor}"/>
      <stop offset="100%" stop-color="#5b4c3a"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${wallColor}"/>
  <rect x="0" y="0" width="${W}" height="${CEIL_H}" fill="url(#ceil)"/>
  <rect x="0" y="${H - FLOOR_H}" width="${W}" height="${FLOOR_H}" fill="url(#floor)"/>
  ${[0.25, 0.5, 0.75].map(f => `<line x1="${W * f}" y1="${CEIL_H}" x2="${W * f}" y2="${H - FLOOR_H}" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>`).join('')}
  ${content}
  ${[256, 768, 1280, 1792].map(cx => `
    <g>
      <rect x="${cx - 150}" y="${CEIL_H + 18}" width="300" height="54" rx="8" fill="#00000055"/>
      <text x="${cx}" y="${CEIL_H + 52}" text-anchor="middle" font-size="26" font-weight="700" fill="#ffffff" letter-spacing="1">${title}</text>
    </g>`).join('')}
  <text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="16" fill="#ffffffaa" letter-spacing="2">${subtitle} · MAQUETA DE PROTOTIPO</text>
</svg>`;
}

function furn(x, y, w, h, r = 6, fill = '#00000030', stroke = '#ffffff90') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
}
function circleIcon(cx, cy, r, fill = '#00000030', stroke = '#ffffff90') {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
}

const baseY = H - FLOOR_H; // línea de piso

const ROOMS = {
  entrada: {
    title: 'HALL DE ENTRADA', wallColor: '#8a9a90',
    content: [200, 900, 1500].map(x => furn(x, baseY - 90, 70, 90, 4)).join('') +
      circleIcon(1800, baseY - 150, 40, '#ffffff20'),
  },
  living: {
    title: 'LIVING COMEDOR', wallColor: C.lightgreen,
    content:
      furn(120, baseY - 160, 420, 160, 14) + // sofá
      furn(220, baseY - 200, 220, 40, 6) + // respaldo
      furn(650, baseY - 60, 160, 60, 8) + // mesa ratona
      [1150, 1250, 1350, 1450].map(x => circleIcon(x, baseY - 40, 26)).join('') + // sillas mesa
      furn(1120, baseY - 90, 380, 50, 6) + // mesa comedor
      furn(1650, CEIL_H + 120, 260, 140, 4, '#ffffff15'), // ventanal
  },
  cocina: {
    title: 'COCINA', wallColor: '#b7c6c0',
    content:
      furn(150, baseY - 140, 900, 140, 4, '#00000040') + // isla/mesada
      [350, 500, 650].map(x => circleIcon(x, baseY - 70, 22, '#37463f88')).join('') + // hornallas
      furn(1250, baseY - 260, 220, 260, 6) + // heladera
      furn(1550, CEIL_H + 10, 400, 60, 4), // alacena
  },
  dormitorio: {
    title: 'DORMITORIO', wallColor: '#a99a8f',
    content:
      furn(600, baseY - 170, 500, 170, 10) +
      circleIcon(730, baseY - 190, 55, '#ffffff30') +
      circleIcon(1000, baseY - 190, 55, '#ffffff30') +
      furn(1150, baseY - 100, 110, 100, 6) + // mesa de luz
      furn(1750, baseY - 260, 220, 260, 4), // placard
  },
  bano: {
    title: 'BAÑO', wallColor: '#9fb2c2',
    content:
      furn(200, baseY - 130, 220, 130, 8) + // bañera
      circleIcon(650, baseY - 40, 30, '#ffffff30') + // inodoro
      furn(950, baseY - 90, 200, 90, 10) + // vanitory
      furn(1300, CEIL_H + 50, 220, 220, 4, '#ffffff10'), // espejo
  },
  balcon: {
    title: 'BALCÓN', wallColor: '#7ea0c7', floorColor: '#c9c2b0',
    content:
      Array.from({ length: 16 }).map((_, i) => `<line x1="${i * 128 + 20}" y1="${baseY - 140}" x2="${i * 128 + 20}" y2="${baseY}" stroke="#ffffff70" stroke-width="6"/>`).join('') +
      furn(850, baseY - 90, 140, 90, 6) + circleIcon(1050, baseY - 60, 30) + circleIcon(1150, baseY - 60, 30),
  },

  // Áreas comunes
  'hall-ingreso': {
    title: 'HALL DE INGRESO', wallColor: '#4c5c53',
    content: furn(750, baseY - 120, 500, 60, 6, '#00000050') + // recepción
      circleIcon(300, baseY - 100, 60, '#ffffff20') + circleIcon(1750, baseY - 100, 60, '#ffffff20'),
  },
  pasillo: {
    title: 'PASILLO TIPO', wallColor: '#6b6154',
    content: [200, 700, 1200, 1700].map(x => furn(x, baseY - 200, 90, 200, 4, '#00000040')).join(''), // puertas
  },
  pileta: {
    title: 'PILETA', wallColor: '#6fa8c9', floorColor: '#d8d2c0',
    content: furn(300, baseY - 40, 1450, 40, 2, '#2e7ea6cc') + // espejo de agua
      [200, 500, 1600, 1900].map(x => furn(x, baseY - 90, 120, 40, 8)).join('') + // reposeras
      [500, 1600].map(x => `<line x1="${x + 60}" y1="${baseY - 260}" x2="${x + 60}" y2="${baseY - 90}" stroke="#ffffffaa" stroke-width="6"/><path d="M ${x - 40} ${baseY - 260} A 100 60 0 0 1 ${x + 160} ${baseY - 260}" fill="#ffffff30"/>`).join(''),
  },
  parrilla: {
    title: 'PARRILLA / QUINCHO', wallColor: '#8a6b4f',
    content: furn(250, baseY - 120, 180, 120, 6, '#3a2f2a') + circleIcon(340, baseY - 140, 20, '#c0392b') +
      furn(900, baseY - 70, 400, 70, 8) + [850, 1000, 1150, 1300].map((cx) => circleIcon(cx + 50, baseY - 100, 24)).join(''),
  },
  gimnasio: {
    title: 'GIMNASIO', wallColor: '#525252',
    content: furn(250, baseY - 150, 260, 150, 6) + furn(650, CEIL_H + 30, 500, 300, 4, '#ffffff10') + // espejo
      furn(1400, baseY - 110, 300, 110, 10),
  },
  jardines: {
    title: 'JARDINES', wallColor: '#8fb0a0', floorColor: '#7d9b6c',
    content: [200, 500, 1500, 1800].map(x => circleIcon(x, baseY - 220, 90, '#3f6b3f') + `<rect x="${x - 8}" y="${baseY - 130}" width="16" height="130" fill="#5b4327"/>`).join('') +
      furn(900, baseY - 60, 260, 60, 6),
  },
};

for (const [id, r] of Object.entries(ROOMS)) {
  const svg = panoShell({ title: r.title, subtitle: id.startsWith('hall') || ['pasillo','pileta','parrilla','gimnasio','jardines'].includes(id) ? 'ÁREAS COMUNES' : 'UNIDAD A01-01', wallColor: r.wallColor, floorColor: r.floorColor, content: r.content });
  write(`tours/demo/${id}.svg`, svg);
}

// ─── Ejecutar generadores de plano y volcar polígonos por consola ───
const buildingPolygons = buildBuildingPlan();
const roomPolygons = buildUnitRoomPlan();

console.log('\n// ─── Pegar en data/mockData.ts ───\n');
console.log('export const demoBuildingPolygons =', JSON.stringify(buildingPolygons, null, 2), ';\n');
console.log('export const demoUnitRooms =', JSON.stringify(roomPolygons, null, 2), ';\n');
