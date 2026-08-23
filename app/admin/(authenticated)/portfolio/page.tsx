'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImageUploader from '@/components/admin/ImageUploader';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { getProjectTypeConfig } from '@/lib/project-types';
import Image from 'next/image';
import type { ProfileExperience, ProfileEducation, ProfileCertification } from '@/types';

// ─── Catálogo de aptitudes ────────────────────────────────────────────
const SKILLS_CATALOG: Record<string, string[]> = {
  'Software BIM / CAD': ['AutoCAD', 'Revit', 'ArchiCAD', 'BricsCAD', 'Civil 3D', 'Vectorworks'],
  '3D y Visualización': ['SketchUp', 'Rhino', '3ds Max', 'Blender', 'Lumion', 'V-Ray', 'Enscape', 'Twinmotion', 'Corona Renderer'],
  'Diseño y Edición': ['Photoshop', 'Illustrator', 'InDesign', 'Premiere', 'After Effects', 'Figma', 'Canva'],
  'Gestión': ['MS Project', 'Trello', 'Notion', 'Excel / Planillas'],
  'Habilidades de obra': ['Dirección de Obra', 'Presupuestos', 'Cómputos Métricos', 'Relevamiento', 'Certificaciones de Obra'],
  'Diseño': ['Diseño Arquitectónico', 'Diseño Urbano', 'Paisajismo', 'Diseño Interior', 'Diseño Sustentable', 'Diseño Paramétrico'],
  'Otros': ['Fotografía', 'Maquetería', 'BIM Management', 'Licitaciones', 'Normativa Urbana', 'Gestión de Proyectos'],
};

interface ProjectRow {
  id: string; slug: string; name: string;
  masterplan_image: string | null; project_type: string;
  sale_mode: string; show_in_portfolio: boolean;
}
interface ProfileRow {
  handle: string; display_name: string; account_type: 'person' | 'company';
  bio: string | null; avatar_image: string | null; banner_image: string | null; location: string | null;
  contact_email: string | null; whatsapp: string | null;
  linkedin_url: string | null; instagram_url: string | null; website_url: string | null;
  skills: string[] | null; experiences: ProfileExperience[] | null;
  education: ProfileEducation[] | null; certifications: ProfileCertification[] | null;
}
interface CollaborationRow {
  id: string; contribution: string; status: 'pending' | 'accepted' | 'declined';
  project: { slug: string; name: string; masterplan_image: string | null } | null;
}

// ─── Modal base ────────────────────────────────────────────────────────
function ProfileModal({ isOpen, onClose, title, onSave, saving, children }: {
  isOpen: boolean; onClose: () => void; title: string;
  onSave: () => void; saving: boolean; children: React.ReactNode;
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {children}
            </div>
            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button onClick={onSave} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Modal: Perfil básico ──────────────────────────────────────────────
function BasicInfoModal({ isOpen, onClose, form, setForm, onSave, saving, hasProfile }: {
  isOpen: boolean; onClose: () => void; saving: boolean; hasProfile: boolean;
  form: { displayName: string; accountType: 'person' | 'company'; bio: string; avatarImage: string; bannerImage: string; location: string };
  setForm: (f: typeof form) => void; onSave: () => void;
}) {
  const isCompany = form.accountType === 'company';
  return (
    <ProfileModal isOpen={isOpen} onClose={onClose} title="Editar perfil" onSave={onSave} saving={saving}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de perfil</label>
        <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
          {(['person', 'company'] as const).map(type => (
            <button key={type} type="button" onClick={() => setForm({ ...form, accountType: type })}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${form.accountType === type ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {type === 'person' ? 'Persona' : 'Estudio / Empresa'}
            </button>
          ))}
        </div>
      </div>
      <Input label={isCompany ? 'Nombre del estudio' : 'Nombre'} value={form.displayName}
        onChange={e => setForm({ ...form, displayName: e.target.value })} required />
      {!hasProfile && (
        <p className="text-xs text-gray-400">El link de tu portfolio se genera solo a partir del nombre.</p>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
        <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={3}
          placeholder="Contá algo sobre vos..." className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all text-sm" />
      </div>
      <Input label="Ubicación" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Buenos Aires, Argentina" />
      <div className="grid grid-cols-2 gap-4">
        <ImageUploader label={isCompany ? 'Logo' : 'Foto de perfil'}
          value={form.avatarImage} onChange={url => setForm({ ...form, avatarImage: url })} folder="profiles" />
        <ImageUploader label="Imagen de portada (banner)"
          value={form.bannerImage} onChange={url => setForm({ ...form, bannerImage: url })} folder="profiles" />
      </div>
    </ProfileModal>
  );
}

// ─── Modal: Contacto ───────────────────────────────────────────────────
function ContactModal({ isOpen, onClose, form, setForm, onSave, saving }: {
  isOpen: boolean; onClose: () => void; saving: boolean;
  form: { contactEmail: string; whatsapp: string; linkedinUrl: string; instagramUrl: string; websiteUrl: string };
  setForm: (f: typeof form) => void; onSave: () => void;
}) {
  return (
    <ProfileModal isOpen={isOpen} onClose={onClose} title="Editar contacto" onSave={onSave} saving={saving}>
      <Input label="Email de contacto" type="email" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} placeholder="juana@ejemplo.com" />
      <Input label="WhatsApp" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="+54 9 11 1234-5678" />
      <Input label="LinkedIn" value={form.linkedinUrl} onChange={e => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/..." />
      <Input label="Instagram" value={form.instagramUrl} onChange={e => setForm({ ...form, instagramUrl: e.target.value })} placeholder="https://instagram.com/..." />
      <Input label="Sitio web / Behance / Portfolio" value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://..." />
    </ProfileModal>
  );
}

// ─── Modal: Aptitudes ──────────────────────────────────────────────────
function SkillsModal({ isOpen, onClose, selected, onSave, saving, onChange }: {
  isOpen: boolean; onClose: () => void; saving: boolean;
  selected: string[]; onChange: (s: string[]) => void; onSave: () => void;
}) {
  const [openCat, setOpenCat] = useState<string | null>(Object.keys(SKILLS_CATALOG)[0]);
  const toggle = (skill: string) =>
    onChange(selected.includes(skill) ? selected.filter(s => s !== skill) : [...selected, skill]);

  return (
    <ProfileModal isOpen={isOpen} onClose={onClose} title="Aptitudes" onSave={onSave} saving={saving}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-brand-50 rounded-xl border border-brand-100">
          {selected.map(s => (
            <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-600 text-white text-xs font-medium">
              {s}<button type="button" onClick={() => toggle(s)} className="opacity-70 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
      )}
      {selected.length === 0 && <p className="text-sm text-gray-400 italic">Seleccioná aptitudes del catálogo.</p>}
      <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
        {Object.entries(SKILLS_CATALOG).map(([cat, skills]) => (
          <div key={cat}>
            <button type="button" onClick={() => setOpenCat(openCat === cat ? null : cat)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <span>{cat}</span>
              <span className="text-gray-400 text-xs">
                {skills.filter(s => selected.includes(s)).length > 0 && `${skills.filter(s => selected.includes(s)).length} sel. `}
                {openCat === cat ? '▲' : '▼'}
              </span>
            </button>
            {openCat === cat && (
              <div className="px-4 pb-4 flex flex-wrap gap-2">
                {skills.map(skill => {
                  const sel = selected.includes(skill);
                  return (
                    <button key={skill} type="button" onClick={() => toggle(skill)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${sel ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-600'}`}>
                      {sel ? '✓ ' : ''}{skill}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 text-right">{selected.length} seleccionadas</p>
    </ProfileModal>
  );
}

// ─── Modal: Experiencia (agregar / editar) ────────────────────────────
const EMPTY_EXP: ProfileExperience = { company: '', role: '', startYear: '', endYear: '', description: '' };
function ExperienceModal({ isOpen, onClose, item, onSave, saving }: {
  isOpen: boolean; onClose: () => void; saving: boolean;
  item: ProfileExperience | null; onSave: (v: ProfileExperience) => void;
}) {
  const [form, setForm] = useState<ProfileExperience>(item ?? EMPTY_EXP);
  useEffect(() => { setForm(item ?? EMPTY_EXP); }, [item, isOpen]);

  return (
    <ProfileModal isOpen={isOpen} onClose={onClose}
      title={item ? 'Editar experiencia' : 'Agregar experiencia'}
      onSave={() => onSave(form)} saving={saving}>
      <p className="text-xs text-gray-400">* Indica campo obligatorio</p>
      <Input label="Empresa / Estudio *" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Estudio Arq. Pérez" />
      <Input label="Rol / Cargo *" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Arquitecto Junior" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Año de inicio *</label>
          <select value={form.startYear} onChange={e => setForm({ ...form, startYear: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm">
            <option value="">Año</option>
            {Array.from({ length: 40 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Año de fin</label>
          <select value={form.endYear ?? ''} onChange={e => setForm({ ...form, endYear: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm">
            <option value="">Presente</option>
            {Array.from({ length: 40 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción (opcional)</label>
        <textarea value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })}
          rows={3} placeholder="Describí brevemente tus tareas o logros..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm resize-none" />
      </div>
    </ProfileModal>
  );
}

// ─── Modal: Educación ─────────────────────────────────────────────────
const EMPTY_EDU: ProfileEducation = { institution: '', career: '', startYear: '', endYear: '' };
function EducationModal({ isOpen, onClose, item, onSave, saving }: {
  isOpen: boolean; onClose: () => void; saving: boolean;
  item: ProfileEducation | null; onSave: (v: ProfileEducation) => void;
}) {
  const [form, setForm] = useState<ProfileEducation>(item ?? EMPTY_EDU);
  useEffect(() => { setForm(item ?? EMPTY_EDU); }, [item, isOpen]);

  return (
    <ProfileModal isOpen={isOpen} onClose={onClose}
      title={item ? 'Editar educación' : 'Añadir educación'}
      onSave={() => onSave(form)} saving={saving}>
      <p className="text-xs text-gray-400">* Indica campo obligatorio</p>
      <Input label="Institución educativa *" value={form.institution}
        onChange={e => setForm({ ...form, institution: e.target.value })} placeholder="P. ej. Universidad de Buenos Aires" />
      <Input label="Carrera / Título" value={form.career}
        onChange={e => setForm({ ...form, career: e.target.value })} placeholder="Arquitectura" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Año de inicio</label>
          <select value={form.startYear} onChange={e => setForm({ ...form, startYear: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm">
            <option value="">Año</option>
            {Array.from({ length: 40 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Año de fin</label>
          <select value={form.endYear ?? ''} onChange={e => setForm({ ...form, endYear: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm">
            <option value="">En curso</option>
            {Array.from({ length: 40 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      </div>
    </ProfileModal>
  );
}

// ─── Modal: Certificado ───────────────────────────────────────────────
const EMPTY_CERT: ProfileCertification = { name: '', issuer: '', year: '', url: '', imageUrl: '' };
function CertificationModal({ isOpen, onClose, item, onSave, saving }: {
  isOpen: boolean; onClose: () => void; saving: boolean;
  item: ProfileCertification | null; onSave: (v: ProfileCertification) => void;
}) {
  const [form, setForm] = useState<ProfileCertification>(item ?? EMPTY_CERT);
  useEffect(() => { setForm(item ?? EMPTY_CERT); }, [item, isOpen]);

  return (
    <ProfileModal isOpen={isOpen} onClose={onClose}
      title={item ? 'Editar certificado' : 'Agregar certificado'}
      onSave={() => onSave(form)} saving={saving}>
      <p className="text-xs text-gray-400">* Indica campo obligatorio</p>
      <Input label="Nombre del certificado *" value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Curso de BIM con Revit" />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Entidad emisora *" value={form.issuer}
          onChange={e => setForm({ ...form, issuer: e.target.value })} placeholder="Autodesk" />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Año *</label>
          <select value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm">
            <option value="">Año</option>
            {Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <Input label="URL del certificado (opcional)" value={form.url ?? ''}
        onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://credencial.com/..." />
      <ImageUploader label="Imagen del certificado (opcional)"
        value={form.imageUrl ?? ''} onChange={url => setForm({ ...form, imageUrl: url })} folder="profiles" />
    </ProfileModal>
  );
}

// ─── Componente de sección con botones +/✏️ ───────────────────────────
function SectionCard({ title, onAdd, children }: {
  title: string; onAdd: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <button onClick={onAdd}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" aria-label={`Agregar ${title}`}>
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  );
}

// ─── Fila de ítem (experiencia / educación / certificado) ──────────────
function ItemRow({ children, onEdit, onDelete }: {
  children: React.ReactNode; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-4 px-6 py-5 group">
      <div className="flex-1 min-w-0">{children}</div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" aria-label="Editar">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Eliminar">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Ícono de inicial ─────────────────────────────────────────────────
function InitialIcon({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 font-semibold text-gray-500 text-base ${className}`}>
      {text.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────
export default function AdminPortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [handle, setHandle] = useState('');

  // Datos del perfil
  const [basicForm, setBasicForm] = useState({ displayName: '', accountType: 'person' as 'person' | 'company', bio: '', avatarImage: '', bannerImage: '', location: '' });
  const [contactForm, setContactForm] = useState({ contactEmail: '', whatsapp: '', linkedinUrl: '', instagramUrl: '', websiteUrl: '' });
  const [skills, setSkills] = useState<string[]>([]);
  const [experiences, setExperiences] = useState<ProfileExperience[]>([]);
  const [education, setEducation] = useState<ProfileEducation[]>([]);
  const [certifications, setCertifications] = useState<ProfileCertification[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [collaborations, setCollaborations] = useState<CollaborationRow[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Control de modales
  const [modal, setModal] = useState<
    | { type: 'basic' } | { type: 'contact' } | { type: 'skills' }
    | { type: 'exp'; item: ProfileExperience | null; idx: number | null }
    | { type: 'edu'; item: ProfileEducation | null; idx: number | null }
    | { type: 'cert'; item: ProfileCertification | null; idx: number | null }
    | null
  >(null);

  const toast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/admin/profile').then(r => r.json()),
      fetch('/api/admin/projects').then(r => r.json()),
      fetch('/api/collaborators/mine').then(r => r.json()),
    ]).then(([profileData, projectsData, colsData]) => {
      const p: ProfileRow | null = profileData.profile;
      if (p) {
        setHasProfile(true);
        setHandle(p.handle);
        setBasicForm({ displayName: p.display_name ?? '', accountType: p.account_type === 'company' ? 'company' : 'person', bio: p.bio ?? '', avatarImage: p.avatar_image ?? '', bannerImage: p.banner_image ?? '', location: p.location ?? '' });
        setContactForm({ contactEmail: p.contact_email ?? '', whatsapp: p.whatsapp ?? '', linkedinUrl: p.linkedin_url ?? '', instagramUrl: p.instagram_url ?? '', websiteUrl: p.website_url ?? '' });
        setSkills(p.skills ?? []);
        setExperiences(p.experiences ?? []);
        setEducation(p.education ?? []);
        setCertifications(p.certifications ?? []);
      }
      setProjects(projectsData.projects ?? []);
      setCollaborations(colsData.collaborations ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Guardado genérico: llama al API con el estado actual fusionado
  const saveProfile = useCallback(async (patch: Partial<{
    displayName: string; accountType: 'person' | 'company';
    bio: string; avatarImage: string; bannerImage: string; location: string;
    contactEmail: string; whatsapp: string; linkedinUrl: string; instagramUrl: string; websiteUrl: string;
    skills: string[]; experiences: ProfileExperience[]; education: ProfileEducation[]; certifications: ProfileCertification[];
  }>) => {
    setSaving(true);
    const body = {
      displayName: basicForm.displayName,
      accountType: basicForm.accountType, bio: basicForm.bio,
      avatarImage: basicForm.avatarImage, bannerImage: basicForm.bannerImage, location: basicForm.location,
      ...contactForm, skills, experiences, education, certifications,
      ...patch,
    };
    const res = await fetch('/api/admin/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      // El handle se auto-genera server-side la primera vez que se crea el
      // perfil (ver /api/admin/profile) — lo tomamos de la respuesta en vez
      // de mandarlo nosotros.
      const data = await res.json().catch(() => null);
      if (data?.profile?.handle) setHandle(data.profile.handle);
      setHasProfile(true); setModal(null); toast('Guardado.');
    } else {
      const d = await res.json().catch(() => ({})); toast(d.error ?? 'Error al guardar.', 'error');
    }
  }, [basicForm, contactForm, skills, experiences, education, certifications, toast]);

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
    const res = await fetch(`/api/admin/project?projectId=${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showInPortfolio: next }) });
    if (!res.ok) { setProjects(prev => prev.map(p => p.id === project.id ? { ...p, show_in_portfolio: !next } : p)); toast('No se pudo actualizar.', 'error'); }
  };

  if (loading) return <LoadingSpinner text="Cargando..." tone="light" />;

  const isCompany = basicForm.accountType === 'company';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sub-header — contextual a esta pantalla, la identidad de cuenta ya la
          pone AppShell arriba. */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 bg-white sticky top-14 z-10">
        <h1 className="font-semibold text-gray-900 text-sm">Editar mi portfolio</h1>
        <div className="flex items-center gap-3">
          {hasProfile && (
            <a href={`/portfolio/${handle}`} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
              Ver portfolio ↗
            </a>
          )}
          <Link href="/admin/proyectos" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← Mis proyectos</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-5">

        {/* ── Perfil básico ── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Banner / cover */}
          <div className="h-32 bg-gradient-to-r from-gray-100 to-gray-200 relative">
            {basicForm.bannerImage && (
              <Image src={basicForm.bannerImage} alt="Banner" fill className="object-cover" />
            )}
            <button onClick={() => setModal({ type: 'basic' })}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-white transition-all shadow-sm" aria-label="Editar perfil">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Avatar + info */}
          <div className="px-6 pb-6">
            <div className={`relative -mt-10 mb-4 ${isCompany ? 'rounded-xl' : 'rounded-full'} w-20 h-20 overflow-hidden border-4 border-white bg-gray-100 flex items-center justify-center shadow-sm`}>
              {basicForm.avatarImage ? (
                <Image src={basicForm.avatarImage} alt={basicForm.displayName} width={80} height={80} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-gray-400">{basicForm.displayName.charAt(0).toUpperCase() || '?'}</span>
              )}
            </div>
            {!hasProfile ? (
              <div className="text-center py-4">
                <p className="text-gray-500 mb-3">Todavía no creaste tu perfil público.</p>
                <Button onClick={() => setModal({ type: 'basic' })}>Crear mi portfolio</Button>
              </div>
            ) : (
              <>
                {isCompany && <span className="text-[11px] font-medium tracking-wide uppercase text-gray-400 border border-gray-200 rounded-full px-2.5 py-0.5">Estudio</span>}
                <h1 className="text-xl font-bold text-gray-900 mt-1">{basicForm.displayName}</h1>
                {basicForm.bio && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{basicForm.bio}</p>}
                {basicForm.location && <p className="text-xs text-gray-400 mt-1">📍 {basicForm.location}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {contactForm.linkedinUrl && <a href={contactForm.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">LinkedIn</a>}
                  {contactForm.instagramUrl && <a href={contactForm.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">Instagram</a>}
                  {contactForm.websiteUrl && <a href={contactForm.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">Sitio web</a>}
                  {contactForm.contactEmail && <a href={`mailto:${contactForm.contactEmail}`} className="text-xs text-brand-600 hover:underline">{contactForm.contactEmail}</a>}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => setModal({ type: 'basic' })}>Editar perfil</Button>
                  <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'contact' })}>Editar contacto</Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Aptitudes ── */}
        {hasProfile && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900">Aptitudes</h3>
              <button onClick={() => setModal({ type: 'skills' })}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" aria-label="Editar aptitudes">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
            {skills.length > 0 ? (
              <div className="px-6 pb-5 flex flex-wrap gap-2">
                {skills.map(s => (
                  <span key={s} className="px-3 py-1.5 rounded-full text-sm bg-gray-100 text-gray-700 border border-gray-200">{s}</span>
                ))}
              </div>
            ) : (
              <p className="px-6 pb-5 text-sm text-gray-400">Agregá tus habilidades y herramientas.</p>
            )}
          </div>
        )}

        {/* ── Experiencia ── */}
        {hasProfile && !isCompany && (
          <SectionCard title="Experiencia" onAdd={() => setModal({ type: 'exp', item: null, idx: null })}>
            {experiences.length === 0 && (
              <p className="px-6 py-5 text-sm text-gray-400">Agregá tu experiencia laboral o profesional.</p>
            )}
            {experiences.map((exp, i) => (
              <ItemRow key={i}
                onEdit={() => setModal({ type: 'exp', item: exp, idx: i })}
                onDelete={() => { const next = experiences.filter((_, j) => j !== i); setExperiences(next); saveProfile({ experiences: next }); }}>
                <div className="flex items-start gap-3">
                  <InitialIcon text={exp.company} />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{exp.role}</p>
                    <p className="text-sm text-gray-500">{exp.company}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {exp.startYear} – {exp.endYear || 'Presente'}
                    </p>
                    {exp.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{exp.description}</p>}
                  </div>
                </div>
              </ItemRow>
            ))}
          </SectionCard>
        )}

        {/* ── Educación ── */}
        {hasProfile && !isCompany && (
          <SectionCard title="Educación" onAdd={() => setModal({ type: 'edu', item: null, idx: null })}>
            {education.length === 0 && (
              <p className="px-6 py-5 text-sm text-gray-400">Agregá tu formación académica.</p>
            )}
            {education.map((edu, i) => (
              <ItemRow key={i}
                onEdit={() => setModal({ type: 'edu', item: edu, idx: i })}
                onDelete={() => { const next = education.filter((_, j) => j !== i); setEducation(next); saveProfile({ education: next }); }}>
                <div className="flex items-start gap-3">
                  <InitialIcon text={edu.institution} />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{edu.institution}</p>
                    {edu.career && <p className="text-sm text-gray-500">{edu.career}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {edu.startYear}{edu.startYear ? ' – ' : ''}{edu.endYear || (edu.startYear ? 'En curso' : '')}
                    </p>
                  </div>
                </div>
              </ItemRow>
            ))}
          </SectionCard>
        )}

        {/* ── Certificados ── */}
        {hasProfile && !isCompany && (
          <SectionCard title="Certificados" onAdd={() => setModal({ type: 'cert', item: null, idx: null })}>
            {certifications.length === 0 && (
              <p className="px-6 py-5 text-sm text-gray-400">Agregá certificados o cursos que hayas completado.</p>
            )}
            {certifications.map((cert, i) => (
              <ItemRow key={i}
                onEdit={() => setModal({ type: 'cert', item: cert, idx: i })}
                onDelete={() => { const next = certifications.filter((_, j) => j !== i); setCertifications(next); saveProfile({ certifications: next }); }}>
                <div className="flex items-start gap-3">
                  {cert.imageUrl ? (
                    <div className="w-11 h-11 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cert.imageUrl} alt={cert.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <InitialIcon text={cert.issuer || cert.name} />
                  )}
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{cert.name}</p>
                    <p className="text-sm text-gray-500">{cert.issuer}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{cert.year}</p>
                    {cert.url && <a href={cert.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline mt-0.5 inline-block">Ver credencial ↗</a>}
                  </div>
                </div>
              </ItemRow>
            ))}
          </SectionCard>
        )}

        {/* ── Colaboraciones pendientes ── */}
        {collaborations.some(c => c.status === 'pending') && (
          <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-amber-100">
              <h3 className="text-lg font-semibold text-gray-900">Proyectos donde te acreditaron</h3>
              <p className="text-sm text-gray-500 mt-0.5">Confirmá para que aparezca en tu portfolio.</p>
            </div>
            <div className="divide-y divide-gray-50">
              {collaborations.map(c => (
                <div key={c.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {c.project?.masterplan_image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.project.masterplan_image} alt="" className="w-full h-full object-cover" />
                      : <span className="text-lg">🏗️</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate text-sm">{c.project?.name ?? '(proyecto borrado)'}</p>
                    {c.contribution && <p className="text-xs text-gray-400 truncate">{c.contribution}</p>}
                  </div>
                  {c.status === 'pending' ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => respondToCollaboration(c.id, 'declined')} disabled={respondingId === c.id}
                        className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-2">Rechazar</button>
                      <button onClick={() => respondToCollaboration(c.id, 'accepted')} disabled={respondingId === c.id}
                        className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">Aceptar</button>
                    </div>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.status === 'accepted' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.status === 'accepted' ? 'Aceptado' : 'Rechazado'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Proyectos a mostrar ── */}
        {hasProfile && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Proyectos en mi portfolio</h3>
              <p className="text-sm text-gray-500 mt-0.5">Marcá los que querés mostrar agrupados.</p>
            </div>
            <div className="divide-y divide-gray-50">
              {projects.map(p => (
                <label key={p.id} className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors">
                  <input type="checkbox" checked={p.show_in_portfolio} onChange={() => toggleInPortfolio(p)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 shrink-0" />
                  <div className="w-11 h-11 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {p.masterplan_image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.masterplan_image} alt="" className="w-full h-full object-cover" />
                      : <span className="text-lg">🏗️</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate text-sm">{p.name}</p>
                    <p className="text-xs text-gray-400">{getProjectTypeConfig(p.project_type, p.sale_mode).label}</p>
                  </div>
                </label>
              ))}
              {projects.length === 0 && <p className="px-6 py-5 text-sm text-gray-400 text-center">Todavía no tenés proyectos creados.</p>}
            </div>
          </div>
        )}
      </div>

      {/* ═══ Modales ═══ */}
      <BasicInfoModal
        isOpen={modal?.type === 'basic'} onClose={() => setModal(null)}
        form={basicForm} setForm={setBasicForm} saving={saving}
        hasProfile={hasProfile}
        onSave={() => saveProfile({ ...basicForm })}
      />
      <ContactModal
        isOpen={modal?.type === 'contact'} onClose={() => setModal(null)}
        form={contactForm} setForm={setContactForm} saving={saving}
        onSave={() => saveProfile({ ...contactForm })}
      />
      <SkillsModal
        isOpen={modal?.type === 'skills'} onClose={() => setModal(null)}
        selected={skills} onChange={setSkills} saving={saving}
        onSave={() => saveProfile({ skills })}
      />
      <ExperienceModal
        isOpen={modal?.type === 'exp'} onClose={() => setModal(null)}
        item={modal?.type === 'exp' ? modal.item : null} saving={saving}
        onSave={v => {
          if (modal?.type !== 'exp') return;
          const next = modal.idx !== null
            ? experiences.map((e, i) => i === modal.idx ? v : e)
            : [...experiences, v];
          setExperiences(next);
          saveProfile({ experiences: next });
        }}
      />
      <EducationModal
        isOpen={modal?.type === 'edu'} onClose={() => setModal(null)}
        item={modal?.type === 'edu' ? modal.item : null} saving={saving}
        onSave={v => {
          if (modal?.type !== 'edu') return;
          const next = modal.idx !== null
            ? education.map((e, i) => i === modal.idx ? v : e)
            : [...education, v];
          setEducation(next);
          saveProfile({ education: next });
        }}
      />
      <CertificationModal
        isOpen={modal?.type === 'cert'} onClose={() => setModal(null)}
        item={modal?.type === 'cert' ? modal.item : null} saving={saving}
        onSave={v => {
          if (modal?.type !== 'cert') return;
          const next = modal.idx !== null
            ? certifications.map((c, i) => i === modal.idx ? v : c)
            : [...certifications, v];
          setCertifications(next);
          saveProfile({ certifications: next });
        }}
      />
    </div>
  );
}
