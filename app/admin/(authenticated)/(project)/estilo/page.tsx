'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import ImageUploader from '@/components/admin/ImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
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

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    Promise.all([
      fetch('/api/admin/project/preview').then(r => r.json()),
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

  useEffect(load, []);

  const persist = async (next: ThemeConfig) => {
    setThemeConfig(next);
    setSaving(true);
    const res = await fetch('/api/admin/project', {
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

  return (
    <div className="flex flex-col xl:flex-row gap-6 xl:items-stretch xl:h-[calc(100vh-4rem)]">
      {/* ── Preview ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 w-full flex flex-col gap-4 xl:h-full xl:overflow-hidden">
        <div className="shrink-0">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Estilo</h2>
          <p className="text-sm text-gray-500 mt-1">
            Elegí la paleta y tipografía de tu sitio — se ve acá al instante y se aplica a toda la landing pública. Los cambios se guardan solos.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-3 flex-wrap">
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              className={`h-7 px-3.5 rounded-md text-xs font-medium transition-colors ${device === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Escritorio
            </button>
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              className={`h-7 px-3.5 rounded-md text-xs font-medium transition-colors ${device === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Celular
            </button>
          </div>
          <div className="flex-1" />
          {warnings.length > 0 ? (
            <span className="h-7 px-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center whitespace-nowrap">
              Contraste bajo en {warnings.join(' y ')}
            </span>
          ) : (
            <span className="text-xs text-gray-400 whitespace-nowrap">Contraste legible en todas las combinaciones ✓</span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-gray-100/60 border border-gray-200 p-4 sm:p-8 flex items-start justify-center">
          <div className={`flex flex-col rounded-xl border border-gray-200 shadow-sm bg-white overflow-hidden transition-[width] duration-200 ${device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full max-w-[980px]'}`}>
            <div className="h-8 shrink-0 bg-gray-900 flex items-center gap-1.5 px-3">
              <span className="w-2 h-2 rounded-full bg-white/25" />
              <span className="w-2 h-2 rounded-full bg-white/25" />
              <div className="flex-1 h-4 rounded-md bg-white/10 flex items-center px-2 min-w-0">
                <span className="text-[9px] text-white/45 truncate">{displayUrl}</span>
              </div>
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
      </div>

      {/* ── Controles ─────────────────────────────────────────── */}
      <div className="w-full xl:w-[440px] shrink-0 xl:h-full">
        <Card className="flex flex-col xl:h-full">
          <div className="shrink-0 px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-gray-900">Controles</p>
            <p className="text-xs text-gray-400">{saving ? 'Guardando...' : 'Guardado'}</p>
          </div>

          <div className="flex-1 xl:min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            <PanelGroup
              title="Combinación"
              summary={`${preset.label}${overrideCount ? ` · ${overrideCount} color${overrideCount > 1 ? 'es' : ''} pisado${overrideCount > 1 ? 's' : ''}` : ''}`}
              open={open.preset}
              onToggle={() => toggleGroup('preset')}
            >
              <div className="grid grid-cols-2 gap-2.5">
                {THEME_PRESETS.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => persist({ ...themeConfig, presetKey: p.key, customColors: {}, radius: undefined })}
                    disabled={saving}
                    className={`text-left rounded-lg border overflow-hidden transition-colors bg-white ${
                      preset.key === p.key ? 'border-2 border-brand-500' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="h-8 flex">
                      <div className="flex-1" style={{ background: p.tokens.bg }} />
                      <div className="flex-1" style={{ background: p.tokens.bgAccent }} />
                      <div className="flex-1" style={{ background: p.tokens.bgAlt }} />
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="flex items-center gap-1.5 font-semibold text-gray-900 text-[11.5px]">
                        {p.label}
                        {preset.key === p.key && <span className="text-[9px] font-medium text-brand-700">● en uso</span>}
                      </p>
                      <p className="text-[9.5px] leading-tight text-gray-500 mt-0.5">{p.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </PanelGroup>

            <PanelGroup
              title="Colores"
              summary={overrideCount ? `${overrideCount} personalizado${overrideCount > 1 ? 's' : ''}, el resto del preset` : 'Todos vienen del preset'}
              open={open.colors}
              onToggle={() => toggleGroup('colors')}
              action={overrideCount > 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); persist({ ...themeConfig, customColors: {} }); }}
                  className="h-7 px-2.5 rounded-md border border-gray-200 bg-white text-[11px] font-medium text-gray-900 hover:border-gray-300 transition-colors shrink-0"
                >
                  Volver al preset
                </button>
              )}
            >
              <div className="flex flex-col">
                {COLOR_FIELDS.map(({ key, label }) => {
                  const current = themeConfig.customColors?.[key];
                  const value = current ?? preset.tokens[key];
                  return (
                    <div key={key} className="flex items-center gap-3 py-2 border-t border-gray-100 first:border-t-0">
                      <label className="relative w-9 h-9 rounded-lg border border-gray-200 shrink-0 overflow-hidden cursor-pointer">
                        <span className="absolute inset-0" style={{ background: value }} />
                        <input
                          type="color"
                          value={value}
                          disabled={saving}
                          onChange={e => persist({ ...themeConfig, customColors: { ...themeConfig.customColors, [key]: e.target.value } })}
                          className="absolute -top-1 -left-1 w-11 h-11 opacity-0 cursor-pointer"
                        />
                      </label>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-medium text-gray-900">{label}</p>
                        <p className="text-[10px] text-gray-400 font-mono truncate">{value}{current !== undefined ? ' · personalizado' : ''}</p>
                      </div>
                      {current !== undefined && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            const nextColors = { ...themeConfig.customColors };
                            delete nextColors[key];
                            persist({ ...themeConfig, customColors: nextColors });
                          }}
                          className="text-[11px] font-medium text-brand-600 hover:text-brand-700 shrink-0"
                        >
                          Deshacer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </PanelGroup>

            <PanelGroup
              title="Tipografía"
              summary={`${fontLabel(themeConfig.headingFont, preset.headingFont)} + ${fontLabel(themeConfig.bodyFont, preset.bodyFont)}`}
              open={open.type}
              onToggle={() => toggleGroup('type')}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium text-gray-900">Títulos</label>
                  <select
                    value={themeConfig.headingFont ?? ''}
                    onChange={e => persist({ ...themeConfig, headingFont: e.target.value || undefined })}
                    disabled={saving}
                    className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="">Del preset ({CURATED_FONTS[preset.headingFont].label})</option>
                    {headingOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    {ownerFonts.length > 0 && (
                      <optgroup label="Mis tipografías">
                        {ownerFonts.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <p className="text-lg text-gray-900 bg-gray-50 rounded-lg px-3 py-2 mt-0.5" style={{ fontFamily: resolved.cssVars['--theme-font-heading'] }}>
                    Loteo Zona Sur
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium text-gray-900">Cuerpo</label>
                  <select
                    value={themeConfig.bodyFont ?? ''}
                    onChange={e => persist({ ...themeConfig, bodyFont: e.target.value || undefined })}
                    disabled={saving}
                    className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="">Del preset ({CURATED_FONTS[preset.bodyFont].label})</option>
                    {bodyOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    {ownerFonts.length > 0 && (
                      <optgroup label="Mis tipografías">
                        {ownerFonts.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-3 py-2 mt-0.5" style={{ fontFamily: resolved.cssVars['--theme-font-body'] }}>
                    Lotes con frente al río, servicios completos y acceso controlado.
                  </p>
                </div>

                <form onSubmit={handleUploadFont} className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                  <p className="text-[11.5px] font-medium text-gray-900">Subir mi tipografía</p>
                  <Input value={newFontName} onChange={e => setNewFontName(e.target.value)} placeholder="Ej: Neue Haas Grotesk" />
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
                    className={`min-h-[52px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-0.5 text-center px-3 py-2 cursor-pointer transition-colors ${
                      fontDragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50/60'
                    }`}
                  >
                    <p className="text-[11px] font-medium text-gray-600">{newFontFile ? newFontFile.name : 'Arrastrá el archivo de la fuente'}</p>
                    <p className="text-[10px] text-gray-400">.woff2 · .woff · .ttf · .otf</p>
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
                    {uploadingFont ? 'Subiendo...' : '+ Subir'}
                  </Button>
                </form>
              </div>
            </PanelGroup>

            <PanelGroup
              title="Formas y fondo"
              summary={`Esquinas ${RADIUS_OPTIONS.find(r => r.value === effectiveRadius)?.label.toLowerCase() ?? effectiveRadius}${themeConfig.backgroundImageUrl ? ' · con fondo de pantalla' : ''}`}
              open={open.shape}
              onToggle={() => toggleGroup('shape')}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11.5px] font-medium text-gray-900">Esquinas</p>
                  <div className="flex gap-1.5">
                    {RADIUS_OPTIONS.map((r, i) => (
                      <button
                        key={r.value}
                        type="button"
                        disabled={saving}
                        onClick={() => persist({ ...themeConfig, radius: r.value === preset.tokens.radius ? undefined : r.value })}
                        className={`flex-1 h-9 text-[11px] font-medium border transition-colors ${
                          effectiveRadius === r.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                        style={{ borderRadius: BUTTON_RADIUS_PREVIEW[i] }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100">
                  <p className="text-[11.5px] font-medium text-gray-900">Fondo de pantalla del sitio</p>
                  <p className="text-[10.5px] text-gray-500 leading-relaxed">
                    Una imagen detrás de todas las secciones. No es la foto del hero — esa se edita en Portada.
                  </p>
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
                      className="text-[11px] text-red-500 hover:text-red-600 self-start"
                    >
                      Quitar fondo de pantalla
                    </button>
                  )}
                </div>
              </div>
            </PanelGroup>

            <PanelGroup
              title="Mis temas guardados"
              summary={savedThemes.length ? `${savedThemes.length} guardado${savedThemes.length > 1 ? 's' : ''}` : 'Ninguno todavía'}
              open={open.themes}
              onToggle={() => toggleGroup('themes')}
            >
              <div className="flex flex-col gap-2">
                {savedThemes.map(t => {
                  const tTokens = { ...(THEME_PRESETS.find(p => p.key === t.config.presetKey) ?? THEME_PRESETS[0]).tokens, ...t.config.customColors };
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 px-2.5 py-2 border border-gray-200 rounded-lg">
                      <div className="flex h-6 w-12 flex-none rounded overflow-hidden">
                        <div className="flex-1" style={{ background: tTokens.bg }} />
                        <div className="flex-1" style={{ background: tTokens.bgAccent }} />
                        <div className="flex-1" style={{ background: tTokens.bgAlt }} />
                      </div>
                      <p className="flex-1 min-w-0 text-[11.5px] font-medium text-gray-900 truncate">{t.name}</p>
                      <button
                        type="button"
                        onClick={() => persist(t.config)}
                        disabled={saving}
                        className="h-7 px-2.5 rounded-md border border-gray-200 bg-white text-[11px] font-medium text-gray-900 hover:border-gray-300 transition-colors shrink-0"
                      >
                        Aplicar
                      </button>
                    </div>
                  );
                })}
                {savedThemes.length === 0 && (
                  <p className="py-3 text-xs text-gray-400 text-center">Todavía no guardaste ningún tema.</p>
                )}
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <input
                    value={newThemeName}
                    onChange={e => setNewThemeName(e.target.value)}
                    placeholder="Ej: Mi estilo de siempre"
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-gray-300 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                  <Button type="button" size="sm" onClick={saveCurrentAsTheme} disabled={!newThemeName.trim()} className="shrink-0">
                    Guardar
                  </Button>
                </div>
              </div>
            </PanelGroup>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PanelGroup({
  title, summary, open, onToggle, action, children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0 border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="flex-1 min-w-0">
          <span className="block text-[12.5px] font-semibold text-gray-900">{title}</span>
          <span className="block text-[10.5px] text-gray-500 mt-0.5 truncate">{summary}</span>
        </span>
        {action}
        <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
