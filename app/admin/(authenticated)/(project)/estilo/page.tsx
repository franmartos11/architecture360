'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import ImageUploader from '@/components/admin/ImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { THEME_PRESETS, RADIUS_OPTIONS } from '@/lib/theme-presets';
import { CURATED_FONTS, ALL_FONT_CLASSNAMES } from '@/lib/fonts';
import { resolveTheme, getContrastWarnings } from '@/lib/resolve-theme';
import { getProjectDisplayUrl } from '@/lib/project-url';
import type { ThemeConfig, ThemeColorOverrides, CustomFont, SavedTheme, Project } from '@/types';

// Mismo orden en el que se usan los tokens en la landing real — de fondo
// principal a acento, para que el picker se lea de "más área cubierta" a
// "menos área cubierta".
const COLOR_FIELDS: { key: keyof ThemeColorOverrides; label: string }[] = [
  { key: 'bg', label: 'Fondo principal' },
  { key: 'bgAlt', label: 'Fondo oscuro / contraste' },
  { key: 'bgAccent', label: 'Fondo de acento' },
  { key: 'surface', label: 'Superficie (tarjetas)' },
  { key: 'text', label: 'Texto principal' },
  { key: 'textOnDark', label: 'Texto sobre fondo oscuro' },
  { key: 'accent', label: 'Acento (botones, links)' },
];

// Radio decorativo de los propios botones de "Esquinas" (no el valor real
// que eligen, ese es RADIUS_OPTIONS[i].value) — mismo orden creciente.
const BUTTON_RADIUS_PREVIEW = [4, 6, 10, 16];

type Device = 'desktop' | 'mobile';
type Group = 'preset' | 'colors' | 'type' | 'shape' | 'themes';

// Fuentes/temas propios son cuenta-scoped (ver supabase/schema.sql: tablas
// `fonts`/`saved_themes`), no de este proyecto puntual — por eso se piden
// aparte de /api/admin/project/preview, y lo que se suba/guarde acá va a
// aparecer también en cualquier otro proyecto del mismo dueño.
//
// No hay "publicar" — cada cambio hace PATCH a /api/admin/project apenas
// se toca (mismo autosave que el resto del admin). El preview de abajo
// muestra exactamente lo que ya está guardado, no un borrador aparte.
export default function AdminEstiloPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [themeConfig, setThemeConfig] = useState<ThemeConfig | null>(null);
  const [ownerFonts, setOwnerFonts] = useState<CustomFont[]>([]);
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingFont, setUploadingFont] = useState(false);
  const [fontDragOver, setFontDragOver] = useState(false);
  const [newFontName, setNewFontName] = useState('');
  const [newFontFile, setNewFontFile] = useState<File | null>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [open, setOpen] = useState<Record<Group, boolean>>({ preset: true, colors: true, type: false, shape: false, themes: false });
  const fontInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const activeProjectId = useActiveProjectId();

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    Promise.all([
      fetch(withActiveProject('/api/admin/project/preview', activeProjectId)).then(r => r.json()),
      fetch('/api/admin/fonts').then(r => r.json()),
      fetch('/api/admin/saved-themes').then(r => r.json()),
    ])
      .then(([projectData, fontsData, themesData]) => {
        if (!projectData.project) throw new Error('sin proyecto');
        setProject(projectData.project);
        setThemeConfig(projectData.project.themeConfig ?? {});
        setOwnerFonts((fontsData.fonts ?? []).map((f: { id: string; name: string; file_url: string; format: string }) => ({
          id: f.id, name: f.name, fileUrl: f.file_url, format: f.format,
        })));
        setSavedThemes((themesData.themes ?? []).map((t: { id: string; name: string; config: ThemeConfig }) => ({
          id: t.id, name: t.name, config: t.config,
        })));
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [activeProjectId]);

  const persist = async (next: ThemeConfig) => {
    setThemeConfig(next);
    setSaving(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeConfig: next }),
    });
    setSaving(false);
    if (!res.ok) toast('No se pudo guardar.', 'error');
  };

  const uploadFont = async (file: File, name: string) => {
    setUploadingFont(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    const res = await fetch('/api/admin/fonts', { method: 'POST', body: formData });
    setUploadingFont(false);
    if (res.ok) {
      const data = await res.json();
      setOwnerFonts(prev => [...prev, { id: data.font.id, name: data.font.name, fileUrl: data.font.file_url, format: data.font.format }]);
      setNewFontName('');
      setNewFontFile(null);
      toast('Tipografía subida.');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo subir la tipografía.', 'error');
    }
  };

  const handleUploadFont = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFontFile || !newFontName.trim()) return;
    uploadFont(newFontFile, newFontName.trim());
  };

  const saveCurrentAsTheme = async () => {
    if (!themeConfig || !newThemeName.trim()) return;
    const res = await fetch('/api/admin/saved-themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newThemeName.trim(), config: themeConfig }),
    });
    if (res.ok) {
      const data = await res.json();
      setSavedThemes(prev => [...prev, { id: data.theme.id, name: data.theme.name, config: data.theme.config }]);
      setNewThemeName('');
      toast('Tema guardado.');
    } else {
      toast('No se pudo guardar el tema.', 'error');
    }
  };

  const toggleGroup = (k: Group) => setOpen(o => ({ ...o, [k]: !o[k] }));

  if (loading) return <LoadingSpinner text="Cargando estilo..." tone="light" />;
  if (loadError || !themeConfig || !project) return <ErrorState message="No se pudo cargar el estilo." onRetry={load} />;

  const preset = THEME_PRESETS.find(p => p.key === themeConfig.presetKey) ?? THEME_PRESETS[0];
  const resolved = resolveTheme(themeConfig, ownerFonts);
  const tokens = { ...preset.tokens, ...themeConfig.customColors };
  const effectiveRadius = themeConfig.radius ?? preset.tokens.radius;
  const warnings = getContrastWarnings(tokens);
  const overrideCount = Object.keys(themeConfig.customColors ?? {}).length;
  const headingOptions = Object.values(CURATED_FONTS).filter(f => f.role === 'heading' || f.role === 'both');
  const bodyOptions = Object.values(CURATED_FONTS).filter(f => f.role === 'body' || f.role === 'both');
  const fontLabel = (key: string | undefined, fallback: typeof preset.headingFont) => {
    if (!key) return `Del preset (${CURATED_FONTS[fallback].label})`;
    if (key.startsWith('custom:')) return ownerFonts.find(f => f.id === key.slice(7))?.name ?? 'Tipografía propia';
    return key in CURATED_FONTS ? CURATED_FONTS[key as keyof typeof CURATED_FONTS].label : CURATED_FONTS[fallback].label;
  };
  const displayUrl = typeof window !== 'undefined'
    ? getProjectDisplayUrl(project.slug, window.location.origin).replace(/^https?:\/\//, '')
    : `${project.slug}.arq360.com`;

  const presetLabel = preset.label;
  const label = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500';
  const fontFamilyOf = (key: string | undefined, fallback: typeof preset.headingFont) => {
    if (key?.startsWith('custom:')) return resolved.cssVars[key === themeConfig.headingFont ? '--theme-font-heading' : '--theme-font-body'];
    const k = (key && key in CURATED_FONTS ? key : fallback) as keyof typeof CURATED_FONTS;
    return CURATED_FONTS[k].cssVar;
  };

  return (
    // Diseño "Sitio · Estilo": controles en una columna a la izquierda
    // (temas, colores, tipografía, esquinas) y la vista previa a la
    // derecha. En xl+ cada columna scrollea por dentro; debajo se apilan
    // con la vista previa primero. -m-6 md:-m-8 anula el padding del shell.
    <div className={`-m-6 md:-m-8 flex flex-col-reverse xl:flex-row xl:h-screen bg-[#F5F3EE] ${ALL_FONT_CLASSNAMES}`}>
      {/* ── Controles ─────────────────────────────────────────── */}
      <section aria-label="Controles de estilo" className="xl:w-[400px] shrink-0 px-4 sm:px-7 py-8 flex flex-col gap-7 xl:overflow-y-auto xl:border-r border-gray-200">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className={`m-0 ${label}`}>Sitio web</p>
            <p className="m-0 text-xs text-gray-500" aria-live="polite">{saving ? 'Guardando...' : 'Guardado'}</p>
          </div>
          <h1 className="m-0 text-[36px] leading-[1.05] font-semibold text-gray-900">Estilo</h1>
          <p className="m-0 text-[13px] leading-relaxed text-gray-600">Empezá por un tema y ajustá. Los cambios se guardan solos y los contrastes se verifican solos.</p>
        </div>

        {/* Temas */}
        <div className="flex flex-col gap-2.5">
          <p className={`m-0 ${label}`}>Temas</p>
          <div className="grid grid-cols-2 gap-2.5">
            {THEME_PRESETS.map(p => {
              const on = preset.key === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  title={p.description}
                  onClick={() => persist({ ...themeConfig, presetKey: p.key, customColors: {}, radius: undefined })}
                  disabled={saving}
                  className={`text-left flex flex-col gap-2.5 p-2.5 rounded-xl bg-white transition-colors ${on ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'}`}
                >
                  <span className="flex h-9 rounded-lg overflow-hidden" aria-hidden="true">
                    {[p.tokens.bg, p.tokens.accent, p.tokens.bgAccent, p.tokens.bgAlt].map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
                  </span>
                  <span className="flex items-center justify-between gap-2 px-0.5">
                    <span className="text-[13px] font-semibold text-gray-900 truncate">{p.label}</span>
                    <span className="text-[17px] text-gray-900" style={{ fontFamily: CURATED_FONTS[p.headingFont].cssVar }} aria-hidden="true">Aa</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Colores */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className={`m-0 ${label}`}>Colores</p>
            {warnings.length > 0
              ? <span className="text-xs font-semibold text-amber-800">Contraste bajo en {warnings.join(' y ')}</span>
              : <span className="text-xs font-semibold text-brand-800">Contraste legible ✓</span>}
          </div>
          {COLOR_FIELDS.map(({ key, label: colorLabel }) => {
            const current = themeConfig.customColors?.[key];
            const value = current ?? preset.tokens[key];
            return (
              <div key={key} className="flex items-center gap-3 min-h-[50px] px-3 rounded-xl border border-gray-200 bg-white">
                <label className="relative w-7 h-7 rounded-lg border border-gray-200 shrink-0 overflow-hidden cursor-pointer">
                  <span className="absolute inset-0" style={{ background: value }} />
                  <span className="sr-only">Elegir {colorLabel}</span>
                  <input
                    type="color"
                    value={value}
                    disabled={saving}
                    onChange={e => persist({ ...themeConfig, customColors: { ...themeConfig.customColors, [key]: e.target.value } })}
                    className="absolute -top-1 -left-1 w-10 h-10 opacity-0 cursor-pointer"
                  />
                </label>
                <span className="flex-1 min-w-0 text-[13px] text-gray-900 truncate">{colorLabel}</span>
                {current !== undefined && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const nextColors = { ...themeConfig.customColors };
                      delete nextColors[key];
                      persist({ ...themeConfig, customColors: nextColors });
                    }}
                    className="min-h-[32px] text-[11px] font-semibold text-gray-900 underline underline-offset-2 shrink-0"
                  >
                    Deshacer
                  </button>
                )}
                <span className="text-xs font-mono text-gray-600 uppercase shrink-0">{value}</span>
              </div>
            );
          })}
          {overrideCount > 0 && (
            <button type="button" onClick={() => persist({ ...themeConfig, customColors: {} })} disabled={saving}
              className="self-start min-h-[36px] text-[13px] font-semibold text-gray-900 underline underline-offset-2">
              Volver a los colores de {presetLabel}
            </button>
          )}
        </div>

        {/* Tipografía */}
        <div className="flex flex-col gap-2.5">
          <p className={`m-0 ${label}`}>Tipografía</p>
          <div className="grid grid-cols-2 gap-2.5">
            {([
              ['Títulos', 'headingFont', headingOptions, preset.headingFont, 22],
              ['Cuerpo', 'bodyFont', bodyOptions, preset.bodyFont, 17],
            ] as const).map(([title, field, options, fallback, size]) => (
              <label key={field} className="relative flex flex-col gap-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 cursor-pointer min-w-0">
                <span className="text-[11px] text-gray-600">{title}</span>
                <span className="text-gray-900 truncate leading-tight" style={{ fontFamily: fontFamilyOf(themeConfig[field], fallback), fontSize: size }}>
                  {fontLabel(themeConfig[field], fallback).replace(/^Del preset \((.*)\)$/, '$1')}
                </span>
                <select
                  aria-label={`Tipografía de ${title.toLowerCase()}`}
                  value={themeConfig[field] ?? ''}
                  onChange={e => persist({ ...themeConfig, [field]: e.target.value || undefined })}
                  disabled={saving}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                >
                  <option value="">Del tema ({CURATED_FONTS[fallback].label})</option>
                  {options.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  {ownerFonts.length > 0 && (
                    <optgroup label="Mis tipografías">
                      {ownerFonts.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => toggleGroup('type')} aria-expanded={open.type}
            className="self-start min-h-[36px] text-[13px] font-semibold text-brand-700">
            {open.type ? '− Cerrar' : '+ Subir mi tipografía'}
          </button>
          {open.type && (
            <form onSubmit={handleUploadFont} className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 bg-white">
              <Input value={newFontName} onChange={e => setNewFontName(e.target.value)} placeholder="Nombre, ej: Neue Haas Grotesk" aria-label="Nombre de la tipografía" />
              <div
                onDragOver={e => { e.preventDefault(); setFontDragOver(true); }}
                onDragLeave={() => setFontDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setFontDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) setNewFontFile(file);
                }}
                onClick={() => fontInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Subir archivo de tipografía: arrastrá un archivo o hacé click para elegirlo"
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fontInputRef.current?.click(); } }}
                className={`min-h-[56px] border-[1.5px] border-dashed rounded-lg flex flex-col items-center justify-center gap-0.5 text-center px-3 py-2 cursor-pointer transition-colors ${
                  fontDragOver ? 'border-brand-700 bg-brand-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                }`}
              >
                <p className="m-0 text-xs font-medium text-gray-700">{newFontFile ? newFontFile.name : 'Arrastrá el archivo de la fuente'}</p>
                <p className="m-0 text-[11px] text-gray-500">.woff2 · .woff · .ttf · .otf</p>
                <input
                  ref={fontInputRef}
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={e => setNewFontFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" disabled={uploadingFont || !newFontFile || !newFontName.trim()} size="sm" className="self-end">
                {uploadingFont ? 'Subiendo...' : 'Subir'}
              </Button>
            </form>
          )}
        </div>

        {/* Esquinas */}
        <div className="flex flex-col gap-2.5">
          <p className={`m-0 ${label}`}>Esquinas</p>
          <div role="radiogroup" aria-label="Esquinas" className="grid p-[3px] rounded-[10px] bg-[#EAE7E0] gap-0.5" style={{ gridTemplateColumns: `repeat(${RADIUS_OPTIONS.length}, minmax(0, 1fr))` }}>
            {RADIUS_OPTIONS.map((r, i) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={effectiveRadius === r.value}
                disabled={saving}
                onClick={() => persist({ ...themeConfig, radius: r.value === preset.tokens.radius ? undefined : r.value })}
                className={`min-h-[38px] px-1 text-xs truncate ${effectiveRadius === r.value ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}
                style={{ borderRadius: BUTTON_RADIUS_PREVIEW[i] }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fondo de pantalla */}
        <div className="flex flex-col gap-2">
          <p className={`m-0 ${label}`}>Fondo de pantalla</p>
          <p className="m-0 text-xs leading-relaxed text-gray-600">Una imagen detrás de todas las secciones. No es la foto de portada — esa se edita en Secciones › Portada.</p>
          <ImageUploader
            value={themeConfig.backgroundImageUrl ?? ''}
            onChange={url => persist({ ...themeConfig, backgroundImageUrl: url || undefined })}
            folder="theme"
          />
          {themeConfig.backgroundImageUrl && (
            <button
              type="button"
              disabled={saving}
              onClick={() => persist({ ...themeConfig, backgroundImageUrl: undefined })}
              className="self-start min-h-[32px] text-xs font-semibold text-red-700 underline underline-offset-2"
            >
              Quitar fondo de pantalla
            </button>
          )}
        </div>

        {/* Temas propios */}
        <div className="flex flex-col gap-2">
          {savedThemes.length > 0 && <p className={`m-0 ${label}`}>Mis temas</p>}
          {savedThemes.map(t => {
            const tTokens = { ...(THEME_PRESETS.find(p => p.key === t.config.presetKey) ?? THEME_PRESETS[0]).tokens, ...t.config.customColors };
            return (
              <div key={t.id} className="flex items-center gap-3 min-h-[50px] px-3 rounded-xl border border-gray-200 bg-white">
                <span className="flex h-6 w-14 flex-none rounded-md overflow-hidden" aria-hidden="true">
                  {[tTokens.bg, tTokens.accent, tTokens.bgAccent, tTokens.bgAlt].map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
                </span>
                <span className="flex-1 min-w-0 text-[13px] font-medium text-gray-900 truncate">{t.name}</span>
                <button type="button" onClick={() => persist(t.config)} disabled={saving}
                  className="min-h-[34px] px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-900 hover:border-gray-400 shrink-0">
                  Aplicar
                </button>
              </div>
            );
          })}
          {open.themes ? (
            <div className="flex gap-2">
              <input
                value={newThemeName}
                onChange={e => setNewThemeName(e.target.value)}
                placeholder="Nombre, ej: Mi estilo de siempre"
                aria-label="Nombre del tema"
                autoFocus
                className="flex-1 min-w-0 min-h-[44px] px-3 rounded-[10px] border border-gray-300 bg-white text-sm outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30"
              />
              <Button type="button" onClick={saveCurrentAsTheme} disabled={!newThemeName.trim()} className="shrink-0">Guardar</Button>
            </div>
          ) : (
            <button type="button" onClick={() => toggleGroup('themes')}
              className="min-h-[44px] rounded-[10px] border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 hover:border-gray-400">
              Guardar como tema propio
            </button>
          )}
        </div>
      </section>

      {/* ── Vista previa ──────────────────────────────────────── */}
      <section aria-label="Vista previa" className="flex-1 min-w-0 px-4 sm:px-8 py-8 bg-[#EFECE6] flex flex-col gap-4 xl:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[13px] font-semibold text-gray-900">Vista previa · tema {presetLabel}{overrideCount ? ' (ajustado)' : ''}</span>
          <div role="radiogroup" aria-label="Dispositivo" className="inline-flex p-[3px] rounded-[10px] bg-[#E4E0D8]">
            {(['desktop', 'mobile'] as Device[]).map(d => (
              <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)}
                className={`min-h-[32px] px-3 rounded-lg text-xs ${device === d ? 'bg-white font-semibold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>
                {d === 'desktop' ? 'Escritorio' : 'Celular'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-center">
          <div className={`atrium-reset flex flex-col rounded-2xl overflow-hidden bg-white shadow-[0_1px_2px_rgba(23,25,26,0.06),0_16px_40px_-16px_rgba(23,25,26,0.22)] transition-[width] duration-200 ${device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full max-w-[980px]'}`}>
            <div className="h-8 shrink-0 bg-white border-b border-[#E4E0D8] flex items-center gap-1.5 px-3">
              <span className="w-2 h-2 rounded-full bg-[#D6D1C7]" />
              <span className="w-2 h-2 rounded-full bg-[#D6D1C7]" />
              <span className="w-2 h-2 rounded-full bg-[#D6D1C7]" />
              <span className="ml-2 text-[10px] font-mono text-[#6B6A65] truncate">{displayUrl}</span>
            </div>
            <div className={ALL_FONT_CLASSNAMES} style={resolved.cssVars as React.CSSProperties}>
              {resolved.fontFaceCss && <style dangerouslySetInnerHTML={{ __html: resolved.fontFaceCss }} />}

              <div
                className="relative flex flex-col items-center justify-center gap-2.5 text-center px-6 overflow-hidden bg-[var(--theme-bg-alt)]"
                style={{ height: device === 'mobile' ? 240 : 300 }}
              >
                <div className="absolute inset-0 opacity-70" style={{ background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 10px, rgba(255,255,255,0) 10px 20px)' }} />
                <div className="relative flex flex-col items-center gap-2">
                  <p className="font-[family-name:var(--theme-font-body)] text-[var(--theme-text-on-dark)] opacity-75" style={{ fontSize: 9, letterSpacing: '0.22em' }}>
                    {(project.location || 'UBICACIÓN').toUpperCase()}
                  </p>
                  <p className="font-[family-name:var(--theme-font-heading)] font-normal text-[var(--theme-text-on-dark)] max-w-[80%]" style={{ fontSize: device === 'mobile' ? 22 : 32, lineHeight: 1.15 }}>
                    {project.name}
                  </p>
                  {project.tagline && (
                    <p className="font-[family-name:var(--theme-font-body)] text-[var(--theme-text-on-dark)] opacity-80 text-xs">{project.tagline}</p>
                  )}
                  <button
                    type="button"
                    className="mt-2 font-[family-name:var(--theme-font-body)] font-medium"
                    style={{
                      fontSize: 9, letterSpacing: '0.16em', padding: device === 'mobile' ? '8px 16px' : '10px 22px',
                      border: '1px solid var(--theme-text-on-dark)', color: 'var(--theme-text-on-dark)', borderRadius: `min(var(--theme-radius), 22px)`,
                    }}
                  >
                    VER MASTERPLAN
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 bg-[var(--theme-bg)]" style={{ padding: device === 'mobile' ? '28px 22px' : '46px 56px' }}>
                <p className="font-[family-name:var(--theme-font-body)] font-medium text-[var(--theme-accent)]" style={{ fontSize: 9, letterSpacing: '0.2em' }}>SOBRE EL PROYECTO</p>
                <p className="font-[family-name:var(--theme-font-heading)] text-[var(--theme-text)]" style={{ fontSize: device === 'mobile' ? 20 : 27, lineHeight: 1.2 }}>
                  Tu proyecto, con esta combinación
                </p>
                <p className="font-[family-name:var(--theme-font-body)] text-[var(--theme-text-muted)] text-sm leading-relaxed max-w-[560px]">
                  Así se ven los títulos y el cuerpo de texto en la landing pública.
                </p>
                <div className="flex gap-3 flex-wrap mt-1">
                  <span
                    className="font-[family-name:var(--theme-font-body)] font-medium"
                    style={{ fontSize: 9, letterSpacing: '0.14em', padding: '10px 20px', background: 'var(--theme-accent)', color: 'var(--theme-text-on-dark)', borderRadius: `min(var(--theme-radius), 22px)` }}
                  >
                    VER LOTES
                  </span>
                  <span
                    className="font-[family-name:var(--theme-font-body)] font-medium"
                    style={{ fontSize: 9, letterSpacing: '0.14em', padding: '10px 20px', border: '1px solid var(--theme-text)', color: 'var(--theme-text)', borderRadius: `min(var(--theme-radius), 22px)` }}
                  >
                    TOUR 360°
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 items-start bg-[var(--theme-bg-alt)]" style={{ padding: device === 'mobile' ? '28px 22px' : '46px 56px' }}>
                <p className="font-[family-name:var(--theme-font-body)] font-medium text-[var(--theme-text-on-dark)] opacity-60" style={{ fontSize: 9, letterSpacing: '0.2em' }}>MASTERPLAN INTERACTIVO</p>
                <p className="font-[family-name:var(--theme-font-heading)] font-normal text-[var(--theme-text-on-dark)]" style={{ fontSize: device === 'mobile' ? 19 : 24 }}>
                  Sección oscura / de contraste
                </p>
                <p className="font-[family-name:var(--theme-font-body)] text-[var(--theme-text-on-dark)] opacity-70 text-xs leading-relaxed max-w-[460px]">
                  Se usa para el masterplan, las tipologías y el cierre de la página.
                </p>
                <span
                  className="mt-1 font-[family-name:var(--theme-font-body)] font-medium"
                  style={{ fontSize: 9, letterSpacing: '0.14em', padding: '9px 18px', background: 'var(--theme-bg-accent)', color: 'var(--theme-text-on-dark)', borderRadius: `min(var(--theme-radius), 22px)` }}
                >
                  ENTRAR AL MASTERPLAN
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
