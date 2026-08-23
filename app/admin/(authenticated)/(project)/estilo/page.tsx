'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import ImageUploader from '@/components/admin/ImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import { THEME_PRESETS } from '@/lib/theme-presets';
import { CURATED_FONTS, ALL_FONT_CLASSNAMES } from '@/lib/fonts';
import { resolveTheme } from '@/lib/resolve-theme';
import type { ThemeConfig, ThemeColorOverrides, CustomFont, SavedTheme } from '@/types';

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

// Fuentes/temas propios son cuenta-scoped (ver supabase/schema.sql: tablas
// `fonts`/`saved_themes`), no de este proyecto puntual — por eso se piden
// aparte de /api/admin/project/preview, y lo que se suba/guarde acá va a
// aparecer también en cualquier otro proyecto del mismo dueño.
export default function AdminEstiloPage() {
  const [themeConfig, setThemeConfig] = useState<ThemeConfig | null>(null);
  const [ownerFonts, setOwnerFonts] = useState<CustomFont[]>([]);
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingFont, setUploadingFont] = useState(false);
  const [newFontName, setNewFontName] = useState('');
  const [newFontFile, setNewFontFile] = useState<File | null>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch('/api/admin/project/preview').then(r => r.json()),
      fetch('/api/admin/fonts').then(r => r.json()),
      fetch('/api/admin/saved-themes').then(r => r.json()),
    ])
      .then(([projectData, fontsData, themesData]) => {
        setThemeConfig(projectData.project?.themeConfig ?? {});
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

  const handleUploadFont = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFontFile || !newFontName.trim()) return;
    setUploadingFont(true);
    const formData = new FormData();
    formData.append('file', newFontFile);
    formData.append('name', newFontName.trim());
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

  if (loading) return <LoadingSpinner text="Cargando estilo..." tone="light" />;
  if (loadError || !themeConfig) return <ErrorState message="No se pudo cargar el estilo." onRetry={load} />;

  const preset = THEME_PRESETS.find(p => p.key === themeConfig.presetKey) ?? THEME_PRESETS[0];
  const resolved = resolveTheme(themeConfig, ownerFonts);
  const headingOptions = Object.values(CURATED_FONTS).filter(f => f.role === 'heading' || f.role === 'both');
  const bodyOptions = Object.values(CURATED_FONTS).filter(f => f.role === 'body' || f.role === 'both');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Estilo</h2>
        <p className="text-sm text-gray-500 mt-1">
          Elegí la paleta y tipografía de tu sitio — se aplica a toda la landing pública. Los cambios se guardan solos.
        </p>
      </div>

      {/* Preview en vivo */}
      <div className={`${ALL_FONT_CLASSNAMES} theme-bg-image rounded-2xl overflow-hidden border border-gray-200`} style={resolved.cssVars as React.CSSProperties}>
        {resolved.fontFaceCss && <style dangerouslySetInnerHTML={{ __html: resolved.fontFaceCss }} />}
        <div className="p-10 bg-[var(--theme-bg)] text-center">
          <p className="font-[family-name:var(--theme-font-heading)] text-3xl text-[var(--theme-text)]">Tu proyecto</p>
          <p className="font-[family-name:var(--theme-font-body)] text-sm text-[var(--theme-text-muted)] mt-2">
            Así se ve el título y el cuerpo de texto con esta combinación.
          </p>
          <button type="button" className="mt-4 px-5 py-2 text-sm tracking-wider bg-[var(--theme-accent)] text-[var(--theme-text-on-dark)]">
            BOTÓN
          </button>
        </div>
        <div className="p-6 bg-[var(--theme-bg-alt)] text-center">
          <p className="font-[family-name:var(--theme-font-body)] text-[var(--theme-text-on-dark)] text-sm">Sección oscura / de contraste</p>
        </div>
      </div>

      {/* Colores personalizados */}
      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Colores personalizados</h3>
          <p className="text-sm text-gray-500">
            Pisan puntualmente el color del preset elegido arriba — lo que no toques acá sigue viniendo de la combinación.
          </p>
        </CardHeader>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {COLOR_FIELDS.map(({ key, label }) => {
            const current = themeConfig.customColors?.[key];
            const value = current ?? preset.tokens[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <label htmlFor={`color-${key}`} className="relative w-10 h-10 rounded-lg border border-gray-200 shrink-0 overflow-hidden cursor-pointer">
                  <input
                    id={`color-${key}`}
                    type="color"
                    value={value}
                    disabled={saving}
                    onChange={e => persist({ ...themeConfig, customColors: { ...themeConfig.customColors, [key]: e.target.value } })}
                    className="absolute -top-1 -left-1 w-12 h-12 cursor-pointer"
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{value}</p>
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
                    className="text-xs text-gray-400 hover:text-gray-700 shrink-0"
                  >
                    usar del preset
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Fondo de pantalla general */}
      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Fondo de pantalla del sitio</h3>
          <p className="text-sm text-gray-500">
            Una imagen detrás de todas las secciones, que se vuelven levemente transparentes para dejarla asomar. No es la foto del hero —
            esa se edita aparte, en Portada.
          </p>
        </CardHeader>
        <div className="p-6 space-y-2">
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
              className="text-xs text-red-500 hover:text-red-600"
            >
              Quitar fondo de pantalla
            </button>
          )}
        </div>
      </Card>

      {/* Presets */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Combinaciones</h3>
        </CardHeader>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {THEME_PRESETS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => persist({ ...themeConfig, presetKey: p.key })}
              disabled={saving}
              className={`text-left rounded-xl border-2 overflow-hidden transition-colors ${
                preset.key === p.key ? 'border-brand-500' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="h-16 flex">
                <div className="flex-1" style={{ background: p.tokens.bg }} />
                <div className="flex-1" style={{ background: p.tokens.bgAccent }} />
                <div className="flex-1" style={{ background: p.tokens.bgAlt }} />
              </div>
              <div className="p-3">
                <p className="font-medium text-gray-900 text-sm">{p.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Tipografía */}
      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Tipografía</h3>
          <p className="text-sm text-gray-500">Por defecto usa el par del preset elegido — podés cambiar título y cuerpo por separado.</p>
        </CardHeader>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <select
              value={themeConfig.headingFont ?? ''}
              onChange={e => persist({ ...themeConfig, headingFont: e.target.value || undefined })}
              disabled={saving}
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="">Del preset ({CURATED_FONTS[preset.headingFont].label})</option>
              {headingOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              {ownerFonts.length > 0 && (
                <optgroup label="Mis tipografías">
                  {ownerFonts.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cuerpo</label>
            <select
              value={themeConfig.bodyFont ?? ''}
              onChange={e => persist({ ...themeConfig, bodyFont: e.target.value || undefined })}
              disabled={saving}
              className="w-full px-3.5 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="">Del preset ({CURATED_FONTS[preset.bodyFont].label})</option>
              {bodyOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              {ownerFonts.length > 0 && (
                <optgroup label="Mis tipografías">
                  {ownerFonts.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        <form onSubmit={handleUploadFont} className="p-6 pt-0 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Input label="Subir mi tipografía — nombre" value={newFontName} onChange={e => setNewFontName(e.target.value)} placeholder="Ej: Neue Haas Grotesk" />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Archivo (.woff2, .woff, .ttf, .otf)</label>
            <input
              type="file"
              accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
              onChange={e => setNewFontFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            />
          </div>
          <Button type="submit" disabled={uploadingFont || !newFontFile || !newFontName.trim()} className="shrink-0">
            {uploadingFont ? 'Subiendo...' : '+ Subir'}
          </Button>
        </form>
      </Card>

      {/* Temas guardados */}
      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Mis temas guardados</h3>
          <p className="text-sm text-gray-500">Guardá esta combinación para reusarla en otro de tus proyectos.</p>
        </CardHeader>
        <div className="divide-y divide-gray-100">
          {savedThemes.map(t => (
            <div key={t.id} className="p-4 flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-gray-900">{t.name}</p>
              <button type="button" onClick={() => persist(t.config)} disabled={saving} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Aplicar
              </button>
            </div>
          ))}
          {savedThemes.length === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">Todavía no guardaste ningún tema.</p>
          )}
        </div>
        <div className="p-6 bg-gray-50/50 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Input label="Guardar tema actual como..." value={newThemeName} onChange={e => setNewThemeName(e.target.value)} placeholder="Ej: Mi estilo de siempre" />
          </div>
          <Button type="button" onClick={saveCurrentAsTheme} disabled={!newThemeName.trim()} className="shrink-0">
            Guardar
          </Button>
        </div>
      </Card>
    </div>
  );
}
