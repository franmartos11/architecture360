'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera } from 'lucide-react';
import ImageUploader from '@/components/admin/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import { getProjectTypeConfig } from '@/lib/project-types';
import { PROFILE_AVAILABILITY } from '@/lib/profile-availability';
import { SPECIALTIES_CATALOG, LANGUAGES_CATALOG } from '@/lib/skills-catalog';
import { labelStyle, inputStyle } from '@/components/admin/portfolio-editor/styles';
import ListSection, { type ListFieldConfig } from '@/components/admin/portfolio-editor/ListSection';
import SkillsSection from '@/components/admin/portfolio-editor/SkillsSection';
import StrengthCard, { type StrengthCheck } from '@/components/admin/portfolio-editor/StrengthCard';
import PreviewCard from '@/components/admin/portfolio-editor/PreviewCard';
import VisibilityCard from '@/components/admin/portfolio-editor/VisibilityCard';
import type { ProfileExperience, ProfileEducation, ProfileCertification, ProfileAward, ProfileSkill, ProfileAvailability } from '@/types';

const ANCHORS = [
  { label: 'Aptitudes', href: '#aptitudes' },
  { label: 'Experiencia', href: '#exp' },
  { label: 'Educación', href: '#edu' },
  { label: 'Certificados', href: '#cert' },
  { label: 'Premios', href: '#award' },
  { label: 'Proyectos', href: '#proyectos' },
];

const AUTOSAVE_DELAY_MS = 800;

interface ProjectRow {
  id: string; slug: string; name: string;
  masterplan_image: string | null; project_type: string;
  sale_mode: string; show_in_portfolio: boolean;
}
interface CollaborationRow {
  id: string; contribution: string; status: 'pending' | 'accepted' | 'declined';
  project: { slug: string; name: string; masterplan_image: string | null } | null;
}

interface FormState {
  displayName: string;
  accountType: 'person' | 'company';
  headline: string;
  license: string;
  availability: ProfileAvailability;
  location: string;
  bio: string;
  avatarImage: string;
  bannerImage: string;
  contactEmail: string;
  whatsapp: string;
  linkedinUrl: string;
  instagramUrl: string;
  websiteUrl: string;
  specialties: string[];
  languages: string[];
  skills: ProfileSkill[];
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  certifications: ProfileCertification[];
  awards: ProfileAward[];
  isPublic: boolean;
  showContact: boolean;
  isIndexed: boolean;
  featuredProjectId: string | null;
}

const EMPTY_FORM: FormState = {
  displayName: '', accountType: 'person', headline: '', license: '', availability: 'open',
  location: '', bio: '', avatarImage: '', bannerImage: '',
  contactEmail: '', whatsapp: '', linkedinUrl: '', instagramUrl: '', websiteUrl: '',
  specialties: [], languages: [], skills: [], experiences: [], education: [], certifications: [], awards: [],
  isPublic: true, showContact: true, isIndexed: true, featuredProjectId: null,
};

const EXP_FIELDS: ListFieldConfig[] = [
  { key: 'role', label: 'ROL / CARGO', placeholder: 'Arquitecto de proyecto' },
  { key: 'company', label: 'ESTUDIO / EMPRESA', placeholder: 'Estudio Martos' },
  { key: 'startYear', label: 'DESDE', placeholder: '2021' },
  { key: 'endYear', label: 'HASTA', placeholder: 'Presente' },
  { key: 'description', label: 'QUÉ HICISTE (OPCIONAL)', placeholder: 'Documentación ejecutiva y dirección de obra de 6 proyectos.', full: true },
];
const EDU_FIELDS: ListFieldConfig[] = [
  { key: 'institution', label: 'INSTITUCIÓN', placeholder: 'FAPyD — UNR', full: true },
  { key: 'career', label: 'CARRERA / TÍTULO', placeholder: 'Arquitectura' },
  { key: 'startYear', label: 'DESDE', placeholder: '2014' },
  { key: 'endYear', label: 'HASTA', placeholder: '2020' },
];
const CERT_FIELDS: ListFieldConfig[] = [
  { key: 'name', label: 'CERTIFICADO', placeholder: 'BIM Management con Revit', full: true },
  { key: 'issuer', label: 'ENTIDAD', placeholder: 'Autodesk' },
  { key: 'year', label: 'AÑO', placeholder: '2025' },
  { key: 'url', label: 'CREDENCIAL (OPCIONAL)', placeholder: 'https://credencial.com/…', full: true },
];
const AWARD_FIELDS: ListFieldConfig[] = [
  { key: 'name', label: 'PREMIO O PUBLICACIÓN', placeholder: 'Mención — Concurso Vivienda Colectiva', full: true },
  { key: 'issuer', label: 'OTORGA / MEDIO', placeholder: 'Colegio de Arquitectos' },
  { key: 'year', label: 'AÑO', placeholder: '2026' },
  { key: 'url', label: 'ENLACE (OPCIONAL)', placeholder: 'https://…', full: true },
];

function suggestBio(form: FormState): string {
  const parts: string[] = [];
  parts.push(form.headline ? `${form.headline}.` : (form.accountType === 'company' ? 'Estudio de arquitectura.' : 'Arquitecto.'));
  if (form.location) parts.push(`Con base en ${form.location}.`);
  if (form.specialties.length > 0) parts.push(`Especializado en ${form.specialties.slice(0, 3).join(', ').toLowerCase()}.`);
  if (form.availability === 'open') parts.push('Abierto a colaborar con otros estudios en concursos y obra nueva.');
  else if (form.availability === 'hiring') parts.push('Actualmente sumando gente al equipo.');
  return parts.join(' ');
}

function chipClass(active: boolean) {
  return `h-[26px] px-[11px] rounded-lg text-[11.5px] font-medium cursor-pointer transition-colors border ${
    active ? 'bg-[rgba(92,122,88,0.14)] text-[#3f5a3c] border-[rgba(92,122,88,0.3)]' : 'bg-[#f5f4f0] text-[rgba(28,25,23,0.6)] border-transparent hover:border-[rgba(92,122,88,0.3)]'
  }`;
}

export default function AdminPortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [collaborations, setCollaborations] = useState<CollaborationRow[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/profile').then(r => r.json()),
      fetch('/api/admin/projects').then(r => r.json()),
      fetch('/api/collaborators/mine').then(r => r.json()),
    ]).then(([profileData, projectsData, colsData]) => {
      const p = profileData.profile;
      if (p) {
        setHandle(p.handle);
        setForm({
          displayName: p.display_name ?? '',
          accountType: p.account_type === 'company' ? 'company' : 'person',
          headline: p.headline ?? '',
          license: p.license ?? '',
          availability: p.availability ?? 'open',
          location: p.location ?? '',
          bio: p.bio ?? '',
          avatarImage: p.avatar_image ?? '',
          bannerImage: p.banner_image ?? '',
          contactEmail: p.contact_email ?? '',
          whatsapp: p.whatsapp ?? '',
          linkedinUrl: p.linkedin_url ?? '',
          instagramUrl: p.instagram_url ?? '',
          websiteUrl: p.website_url ?? '',
          specialties: p.specialties ?? [],
          languages: p.languages ?? [],
          skills: p.skills ?? [],
          experiences: p.experiences ?? [],
          education: p.education ?? [],
          certifications: p.certifications ?? [],
          awards: p.awards ?? [],
          isPublic: p.is_public ?? true,
          showContact: p.show_contact ?? true,
          isIndexed: p.is_indexed ?? true,
          featuredProjectId: p.featured_project_id ?? null,
        });
      }
      setProjects(projectsData.projects ?? []);
      setCollaborations(colsData.collaborations ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Autosave debounced, disparado a mano desde `set()`/los onChange de
  // abajo — nunca desde un useEffect que mire `form`: ese approach también
  // dispara apenas termina de cargar (form pasa de EMPTY_FORM a los datos
  // reales), autoguardando de entrada sin que la persona haya tocado nada.
  // El PATCH es upsert de fila completa (ver /api/admin/profile), así que
  // siempre manda el form entero, no un diff.
  const scheduleSave = useCallback((next: FormState) => {
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.profile?.handle) setHandle(data.profile.handle);
      } else {
        const d = await res.json().catch(() => ({}));
        toast(d.error ?? 'No se pudo guardar.', 'error');
      }
      setSaveState('saved');
    }, AUTOSAVE_DELAY_MS);
  }, [toast]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => {
      const next = { ...f, [key]: value };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/portfolio/${handle}`);
      toast('Enlace de tu portfolio copiado.');
    } catch {
      toast('No se pudo copiar el enlace.', 'error');
    }
  };

  const respondToCollaboration = async (id: string, status: 'accepted' | 'declined') => {
    setRespondingId(id);
    const res = await fetch(`/api/collaborators/${id}/respond`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setRespondingId(null);
    if (res.ok) setCollaborations(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    else toast('No se pudo responder.', 'error');
  };

  const toggleInPortfolio = async (project: ProjectRow) => {
    const next = !project.show_in_portfolio;
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, show_in_portfolio: next } : p));
    if (!next && form.featuredProjectId === project.id) set('featuredProjectId', null);
    const res = await fetch(`/api/admin/project?projectId=${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showInPortfolio: next }) });
    if (!res.ok) { setProjects(prev => prev.map(p => p.id === project.id ? { ...p, show_in_portfolio: !next } : p)); toast('No se pudo actualizar.', 'error'); }
  };

  if (loading) return <LoadingSpinner text="Cargando..." tone="light" />;

  const isCompany = form.accountType === 'company';
  const bioLen = form.bio.length;
  const visibleProjectsCount = projects.filter(p => p.show_in_portfolio).length;

  const checks: StrengthCheck[] = [
    { label: 'Titular profesional', ok: !!form.headline.trim(), weight: 12, href: '#titular' },
    { label: 'Presentación de 2 líneas', ok: bioLen >= 60, weight: 16, href: '#presentacion' },
    { label: 'Al menos 5 aptitudes', ok: form.skills.length >= 5, weight: 14, href: '#aptitudes' },
    ...(isCompany ? [] : [
      { label: 'Una experiencia cargada', ok: form.experiences.length > 0, weight: 18, href: '#exp' },
      { label: 'Formación académica', ok: form.education.length > 0, weight: 12, href: '#edu' },
      { label: 'Un certificado', ok: form.certifications.length > 0, weight: 10, href: '#cert' },
      { label: 'Premios o publicaciones', ok: form.awards.length > 0, weight: 8, href: '#award' },
    ]),
    { label: 'Proyectos visibles', ok: visibleProjectsCount > 0, weight: 10, href: '#proyectos' },
  ];

  return (
    <div style={{ fontFamily: "'Poppins', ui-sans-serif, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      <div className="sticky top-14 z-30 bg-[rgba(245,244,240,0.92)] backdrop-blur-md border-b border-[rgba(28,25,23,0.08)]">
        <div className="max-w-[1260px] mx-auto px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="shrink-0">
            <p className="font-semibold text-[15px] text-[#1c1a17]">Editar mi portfolio</p>
            <div className="flex items-center gap-2 mt-[3px]">
              <button
                type="button"
                onClick={copyUrl}
                className="h-[22px] px-2 rounded-md bg-[rgba(28,25,23,0.06)] hover:bg-[rgba(28,25,23,0.1)] text-[11px] text-[rgba(28,25,23,0.55)] hover:text-[#1c1a17] transition-colors whitespace-nowrap"
              >
                atrium.com/{handle || '…'}
              </button>
              <span className="text-[11px]" style={{ color: saveState === 'saving' ? '#4a6647' : 'rgba(28,25,23,0.4)' }}>
                {saveState === 'saving' ? 'Guardando…' : 'Todos los cambios guardados'}
              </span>
            </div>
          </div>
          <div className="flex-1" />
          <nav className="flex items-center gap-1.5 flex-wrap">
            {ANCHORS.filter(a => !isCompany || (a.label !== 'Experiencia' && a.label !== 'Educación' && a.label !== 'Certificados' && a.label !== 'Premios')).map(a => (
              <a key={a.href} href={a.href} className="h-7 px-2.5 rounded-lg bg-[rgba(28,25,23,0.05)] hover:bg-[rgba(92,122,88,0.14)] text-[11.5px] font-medium text-[rgba(28,25,23,0.6)] hover:text-[#4a6647] transition-colors whitespace-nowrap">
                {a.label}
              </a>
            ))}
          </nav>
          {handle && (
            <>
              <div className="w-px h-[26px] bg-[rgba(28,25,23,0.1)]" />
              <a href={`/portfolio/${handle}`} target="_blank" rel="noopener noreferrer" className="h-8 px-3.5 rounded-[9px] border border-[rgba(28,25,23,0.14)] bg-white text-[12px] font-medium text-[#1c1a17] hover:bg-[#f5f4f0] transition-colors whitespace-nowrap">
                Ver portfolio ↗
              </a>
            </>
          )}
        </div>
      </div>

      <div className="max-w-[1260px] mx-auto px-6 py-[22px] pb-[90px] grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-[22px] items-start">
        <div className="flex flex-col gap-4 min-w-0">

          {/* ── Perfil básico ── */}
          <div className="rounded-2xl bg-white border border-[rgba(28,25,23,0.08)] overflow-hidden">
            <div className="h-32 relative" style={{ background: form.bannerImage ? undefined : 'repeating-linear-gradient(115deg,#2b2925 0 18px,#232120 18px 36px)' }}>
              {form.bannerImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.bannerImage} alt="" className="w-full h-full object-cover" />
              )}
              <div className="absolute top-3 right-3">
                <button
                  type="button"
                  onClick={() => setBannerEditorOpen(v => !v)}
                  className="h-[30px] px-3 rounded-lg bg-white/90 hover:bg-white flex items-center gap-1.5 text-[11.5px] font-medium text-[#1c1a17] transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" /> Cambiar portada
                </button>
              </div>
              <div
                onClick={() => setAvatarEditorOpen(v => !v)}
                className="absolute left-[22px] -bottom-[34px] w-[92px] h-[92px] rounded-full border-4 border-white flex items-center justify-center font-semibold text-[32px] text-white/90 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden"
                style={{ background: 'linear-gradient(135deg,#9aa896,#5c7a58)' }}
              >
                {form.avatarImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.avatarImage} alt="" className="w-full h-full object-cover" />
                ) : (form.displayName || '?').charAt(0).toUpperCase()}
              </div>
            </div>

            {(bannerEditorOpen || avatarEditorOpen) && (
              <div className="px-[22px] pt-4 grid grid-cols-2 gap-4 bg-[#faf9f6] border-b border-[rgba(28,25,23,0.06)] pb-4">
                {bannerEditorOpen && <ImageUploader label="Imagen de portada" value={form.bannerImage} onChange={v => set('bannerImage', v)} folder="profiles" />}
                {avatarEditorOpen && <ImageUploader label={isCompany ? 'Logo' : 'Foto de perfil'} value={form.avatarImage} onChange={v => set('avatarImage', v)} folder="profiles" />}
              </div>
            )}

            <div className="px-[22px] pt-[46px] pb-5">
              <div className="flex items-start gap-4 flex-wrap">
                <div id="titular" className="flex-1 min-w-[280px] flex flex-col gap-[11px] scroll-mt-[130px]">
                  <div>
                    <div className={labelStyle}>NOMBRE</div>
                    <input value={form.displayName} onChange={e => set('displayName', e.target.value)} placeholder="Tu nombre o el del estudio" className={inputStyle} />
                  </div>
                  <div>
                    <div className={labelStyle}>TITULAR PROFESIONAL</div>
                    <input value={form.headline} onChange={e => set('headline', e.target.value.slice(0, 90))} maxLength={90} placeholder="Arquitecto · Vivienda y refuncionalización" className={inputStyle} />
                    <p className="font-light text-[10.5px] text-[rgba(28,25,23,0.4)] mt-1">Es lo primero que se lee debajo de tu nombre en el feed y en las búsquedas. {form.headline.length}/90</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className={labelStyle}>UBICACIÓN</div>
                      <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Córdoba, Argentina" className={inputStyle} />
                    </div>
                    <div>
                      <div className={labelStyle}>MATRÍCULA</div>
                      <input value={form.license} onChange={e => set('license', e.target.value)} placeholder="CAC 12.345" className={inputStyle} />
                    </div>
                  </div>
                </div>

                <div className="w-[230px] flex flex-col gap-3">
                  <div>
                    <div className={labelStyle}>TIPO DE PERFIL</div>
                    <div className="flex p-[3px] rounded-[9px] bg-[#f5f4f0] border border-[rgba(28,25,23,0.08)]">
                      {(['person', 'company'] as const).map(t => (
                        <button
                          key={t} type="button" onClick={() => set('accountType', t)}
                          className="flex-1 h-[30px] flex items-center justify-center rounded-[7px] text-[11.5px] font-medium transition-colors"
                          style={form.accountType === t ? { background: '#fff', color: '#1c1a17', boxShadow: '0 1px 3px rgba(28,26,23,0.1)' } : { color: 'rgba(28,25,23,0.5)' }}
                        >
                          {t === 'person' ? 'Persona' : 'Estudio'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className={labelStyle}>DISPONIBILIDAD</div>
                    <div className="flex flex-col gap-[5px]">
                      {PROFILE_AVAILABILITY.map(a => (
                        <button
                          key={a.key} type="button" onClick={() => set('availability', a.key)}
                          className="h-[30px] px-2.5 flex items-center gap-2 rounded-lg text-[11.5px] font-medium transition-colors border"
                          style={form.availability === a.key
                            ? { background: 'rgba(92,122,88,0.12)', color: '#3f5a3c', borderColor: 'rgba(92,122,88,0.3)' }
                            : { background: '#faf9f6', color: 'rgba(28,25,23,0.58)', borderColor: 'rgba(28,25,23,0.08)' }}
                        >
                          <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: a.color }} />
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div id="presentacion" className="mt-4 pt-4 border-t border-[rgba(28,25,23,0.07)] scroll-mt-[130px]">
                <div className={labelStyle}>PRESENTACIÓN</div>
                <textarea
                  value={form.bio}
                  onChange={e => set('bio', e.target.value.slice(0, 320))}
                  maxLength={320}
                  rows={3}
                  placeholder="Contá en dos líneas qué hacés, con quién trabajás y qué proyectos te interesan."
                  className="w-full rounded-[11px] border border-[rgba(28,25,23,0.13)] bg-[#faf9f6] px-[13px] py-[11px] text-[13px] leading-[1.6] text-[#1c1a17] outline-none resize-y transition-colors focus:border-[rgba(92,122,88,0.55)] focus:bg-white placeholder:text-[rgba(28,25,23,0.34)]"
                />
                <div className="flex items-center gap-2.5 mt-1.5">
                  <button type="button" onClick={() => set('bio', suggestBio(form))} className="h-7 px-[11px] rounded-lg text-[11px] font-medium transition-colors" style={{ background: 'rgba(92,122,88,0.12)', color: '#4a6647' }}>
                    Sugerir con mis datos
                  </button>
                  <div className="flex-1" />
                  <span className="text-[10.5px]" style={{ color: bioLen >= 60 ? 'rgba(28,25,23,0.4)' : '#b0503a' }}>{bioLen}/320</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[rgba(28,25,23,0.07)] grid grid-cols-2 gap-4">
                <div>
                  <div className={labelStyle}>ESPECIALIDADES</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {SPECIALTIES_CATALOG.map(sp => (
                      <button key={sp} type="button" onClick={() => set('specialties', form.specialties.includes(sp) ? form.specialties.filter(x => x !== sp) : [...form.specialties, sp])} className={chipClass(form.specialties.includes(sp))}>
                        {sp}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className={labelStyle}>IDIOMAS</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {LANGUAGES_CATALOG.map(lg => (
                      <button key={lg} type="button" onClick={() => set('languages', form.languages.includes(lg) ? form.languages.filter(x => x !== lg) : [...form.languages, lg])} className={chipClass(form.languages.includes(lg))}>
                        {lg}
                      </button>
                    ))}
                  </div>
                  <div className={`${labelStyle} mt-3.5`}>CONTACTO</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="Email" className="h-8 px-2.5 rounded-lg border border-[rgba(28,25,23,0.13)] bg-[#faf9f6] text-[11.5px] text-[#1c1a17] outline-none focus:border-[rgba(92,122,88,0.55)] focus:bg-white placeholder:text-[rgba(28,25,23,0.34)]" />
                    <input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="WhatsApp" className="h-8 px-2.5 rounded-lg border border-[rgba(28,25,23,0.13)] bg-[#faf9f6] text-[11.5px] text-[#1c1a17] outline-none focus:border-[rgba(92,122,88,0.55)] focus:bg-white placeholder:text-[rgba(28,25,23,0.34)]" />
                    <input value={form.linkedinUrl} onChange={e => set('linkedinUrl', e.target.value)} placeholder="LinkedIn" className="h-8 px-2.5 rounded-lg border border-[rgba(28,25,23,0.13)] bg-[#faf9f6] text-[11.5px] text-[#1c1a17] outline-none focus:border-[rgba(92,122,88,0.55)] focus:bg-white placeholder:text-[rgba(28,25,23,0.34)]" />
                    <input value={form.instagramUrl} onChange={e => set('instagramUrl', e.target.value)} placeholder="Instagram" className="h-8 px-2.5 rounded-lg border border-[rgba(28,25,23,0.13)] bg-[#faf9f6] text-[11.5px] text-[#1c1a17] outline-none focus:border-[rgba(92,122,88,0.55)] focus:bg-white placeholder:text-[rgba(28,25,23,0.34)]" />
                    <input value={form.websiteUrl} onChange={e => set('websiteUrl', e.target.value)} placeholder="Sitio web" className="h-8 px-2.5 rounded-lg border border-[rgba(28,25,23,0.13)] bg-[#faf9f6] text-[11.5px] text-[#1c1a17] outline-none focus:border-[rgba(92,122,88,0.55)] focus:bg-white placeholder:text-[rgba(28,25,23,0.34)] col-span-2" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SkillsSection skills={form.skills} onChange={s => set('skills', s)} />

          {!isCompany && (
            <>
              <ListSection<ProfileExperience>
                id="exp" title="Experiencia" description="Dónde trabajaste y qué hiciste ahí." addLabel="Agregar experiencia"
                emptyText="Sumá al menos un estudio u obra: es el dato que más miran quienes buscan colaboradores."
                items={form.experiences} fields={EXP_FIELDS} emptyItem={{ company: '', role: '', startYear: '', endYear: '', description: '' }}
                onChange={v => set('experiences', v)}
                renderItem={it => ({ title: it.role, subtitle: it.company, meta: `${it.startYear || ''} – ${it.endYear || 'Presente'}`, note: it.description })}
              />
              <ListSection<ProfileEducation>
                id="edu" title="Educación" description="Formación de grado, posgrado y cursos largos." addLabel="Agregar formación"
                emptyText="Agregá tu formación académica — universidad, posgrado o especialización."
                items={form.education} fields={EDU_FIELDS} emptyItem={{ institution: '', career: '', startYear: '', endYear: '' }}
                onChange={v => set('education', v)}
                renderItem={it => ({ title: it.institution, subtitle: it.career, meta: it.startYear ? `${it.startYear} – ${it.endYear || 'En curso'}` : '' })}
              />
              <ListSection<ProfileCertification>
                id="cert" title="Certificados" description="Cursos y credenciales verificables." addLabel="Agregar certificado"
                emptyText="Agregá certificados o cursos que hayas completado."
                items={form.certifications} fields={CERT_FIELDS} emptyItem={{ name: '', issuer: '', year: '', url: '' }}
                onChange={v => set('certifications', v)}
                renderItem={it => ({ title: it.name, subtitle: it.issuer, meta: it.year })}
              />
              <ListSection<ProfileAward>
                id="award" title="Premios y publicaciones" description="Concursos, menciones y obra publicada." addLabel="Agregar reconocimiento" isNew
                emptyText="Concursos, menciones y obra publicada en medios — hoy no hay dónde cargarlos."
                items={form.awards} fields={AWARD_FIELDS} emptyItem={{ name: '', issuer: '', year: '', url: '' }}
                onChange={v => set('awards', v)}
                renderItem={it => ({ title: it.name, subtitle: it.issuer, meta: it.year })}
              />
            </>
          )}

          {collaborations.some(c => c.status === 'pending') && (
            <div className="rounded-2xl bg-white border border-[rgba(201,138,94,0.35)] overflow-hidden">
              <div className="px-5 py-[17px] border-b border-[rgba(201,138,94,0.2)]">
                <p className="font-semibold text-[14.5px] text-[#1c1a17]">Proyectos donde te acreditaron</p>
                <p className="font-light text-[11.5px] text-[rgba(28,25,23,0.48)] mt-0.5">Confirmá para que aparezca en tu portfolio.</p>
              </div>
              {collaborations.map(c => (
                <div key={c.id} className="flex items-center gap-3.5 px-5 py-3.5 border-b border-[rgba(28,25,23,0.05)] last:border-b-0">
                  <div className="w-10 h-10 rounded-lg bg-[#f5f4f0] overflow-hidden shrink-0 flex items-center justify-center">
                    {c.project?.masterplan_image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.project.masterplan_image} alt="" className="w-full h-full object-cover" />
                      : <span className="text-lg">🏗️</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[13px] text-[#1c1a17] truncate">{c.project?.name ?? '(proyecto borrado)'}</p>
                    {c.contribution && <p className="text-[11px] text-[rgba(28,25,23,0.4)] truncate">{c.contribution}</p>}
                  </div>
                  {c.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => respondToCollaboration(c.id, 'declined')} disabled={respondingId === c.id} className="text-[12.5px] text-[rgba(28,25,23,0.5)] hover:text-[#1c1a17] transition-colors px-2">Rechazar</button>
                      <button onClick={() => respondToCollaboration(c.id, 'accepted')} disabled={respondingId === c.id} className="h-8 px-3 rounded-lg bg-[#1c1a17] text-white text-[12px] font-medium hover:bg-[#2f3d2c] transition-colors">Aceptar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div id="proyectos" className="rounded-2xl bg-white border border-[rgba(28,25,23,0.08)] overflow-hidden scroll-mt-[130px]">
            <div className="px-5 py-[17px] border-b border-[rgba(28,25,23,0.06)] flex items-center gap-3">
              <div>
                <p className="font-semibold text-[14.5px] text-[#1c1a17]">Proyectos en mi portfolio</p>
                <p className="font-light text-[11.5px] text-[rgba(28,25,23,0.48)] mt-0.5">Elegí cuáles se muestran y cuál abre tu portfolio como destacado.</p>
              </div>
              <div className="flex-1" />
              <span className="text-[11.5px] text-[rgba(28,25,23,0.45)] whitespace-nowrap">{visibleProjectsCount} de {projects.length} visibles</span>
            </div>
            {projects.map(p => {
              const featured = form.featuredProjectId === p.id;
              return (
                <div key={p.id} className="px-5 py-[13px] flex items-center gap-[13px] border-b border-[rgba(28,25,23,0.05)] last:border-b-0">
                  <button
                    type="button" onClick={() => toggleInPortfolio(p)} aria-pressed={p.show_in_portfolio}
                    className="w-[38px] h-[22px] rounded-xl shrink-0 flex p-0.5 transition-colors"
                    style={{ background: p.show_in_portfolio ? '#5c7a58' : 'rgba(28,25,23,0.16)', justifyContent: p.show_in_portfolio ? 'flex-end' : 'flex-start' }}
                  >
                    <span className="w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(28,26,23,0.25)]" />
                  </button>
                  <div className="w-11 h-11 rounded-lg bg-[repeating-linear-gradient(115deg,#e6e3dc_0_10px,#dedbd3_10px_20px)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13px] text-[#1c1a17]">{p.name}</p>
                    <p className="text-[11.5px] text-[rgba(28,25,23,0.45)] mt-px">{getProjectTypeConfig(p.project_type, p.sale_mode).label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!p.show_in_portfolio) { toast('Primero hacelo visible.', 'error'); return; } set('featuredProjectId', featured ? null : p.id); }}
                    className="h-7 px-[11px] rounded-lg text-[11px] font-medium transition-colors shrink-0"
                    style={featured ? { background: 'rgba(201,138,94,0.16)', color: '#96603a' } : { background: '#f5f4f0', color: 'rgba(28,25,23,0.5)' }}
                  >
                    {featured ? '★ Destacado' : '☆ Destacar'}
                  </button>
                </div>
              );
            })}
            {projects.length === 0 && <p className="px-5 py-6 text-[12.5px] text-[rgba(28,25,23,0.45)] text-center">Todavía no tenés proyectos creados.</p>}
          </div>
        </div>

        <div className="flex flex-col gap-3.5 sticky top-[132px]">
          <StrengthCard checks={checks} />
          <PreviewCard
            avatarImage={form.avatarImage}
            name={form.displayName}
            headline={form.headline}
            location={form.location}
            availability={form.availability}
            bio={form.bio}
            skills={form.skills}
            stats={[
              { value: String(visibleProjectsCount), label: 'Proyectos' },
              { value: String(form.experiences.length), label: 'Experiencias' },
            ]}
          />
          <VisibilityCard
            isPublic={form.isPublic} showContact={form.showContact} isIndexed={form.isIndexed}
            onChange={patch => setForm(f => { const next = { ...f, ...patch }; scheduleSave(next); return next; })}
          />
        </div>
      </div>
    </div>
  );
}
