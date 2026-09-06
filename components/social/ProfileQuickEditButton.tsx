'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import type { Portfolio } from '@/data/profile-repository';

// Edición in-place de los campos centrales de identidad (nombre, bio,
// ubicación, avatar, banner) directamente sobre el propio perfil público —
// antes esto solo se podía tocar yendo a /admin/portfolio, un formulario
// de dashboard aparte. Lo demás (aptitudes, experiencia, educación,
// certificaciones, colaboraciones) sigue viviendo ahí porque es
// configuración más profunda, no algo que se retoque seguido.
//
// El PATCH de /api/admin/profile es un upsert de fila completa — si no
// mandamos skills/experiences/etc se pisan con vacío. Por eso el body
// siempre parte del `portfolio` completo ya cargado y solo pisa los
// campos que edita este modal.
interface ProfileQuickEditButtonProps {
  portfolio: Portfolio;
  /** 'cover' = el botón chico "Cambiar portada" superpuesto al banner — mismo modal, mismo estado, solo cambia qué botón lo abre. Default: el botón "Editar perfil".
   * Antes esto era un `trigger` render-prop (una función) — pasar una función desde el Server Component de la página rompe la serialización RSC
   * ("Functions cannot be passed directly to Client Components"), así que ahora es un dato plano y el botón se arma acá adentro. */
  variant?: 'default' | 'cover';
}

export default function ProfileQuickEditButton({ portfolio, variant = 'default' }: ProfileQuickEditButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    displayName: portfolio.displayName,
    bio: portfolio.bio ?? '',
    location: portfolio.location ?? '',
    avatarImage: portfolio.avatarImage ?? '',
    bannerImage: portfolio.bannerImage ?? '',
  });
  const router = useRouter();
  const toast = useToast();

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch('/api/admin/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: portfolio.handle,
        accountType: portfolio.accountType,
        headline: portfolio.headline,
        license: portfolio.license,
        availability: portfolio.availability,
        contactEmail: portfolio.contactEmail,
        whatsapp: portfolio.whatsapp,
        linkedinUrl: portfolio.linkedinUrl,
        instagramUrl: portfolio.instagramUrl,
        websiteUrl: portfolio.websiteUrl,
        specialties: portfolio.specialties ?? [],
        languages: portfolio.languages ?? [],
        skills: portfolio.skills ?? [],
        experiences: portfolio.experiences ?? [],
        education: portfolio.education ?? [],
        certifications: portfolio.certifications ?? [],
        awards: portfolio.awards ?? [],
        isPublic: portfolio.isPublic,
        showContact: portfolio.showContact,
        isIndexed: portfolio.isIndexed,
        featuredProjectId: portfolio.featuredProjectId,
        ...form,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      toast('Perfil actualizado.');
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo guardar.', 'error');
    }
  };

  return (
    <>
      {variant === 'cover' ? (
        <button
          onClick={() => setOpen(true)}
          className="h-8 px-[13px] rounded-lg bg-white/90 hover:bg-white flex items-center gap-[7px] text-[11.5px] font-medium text-trevo-dark transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 16l4-1 9-9-3-3-9 9z" /><path d="M14 3l3 3" /></svg>
          Cambiar portada
        </button>
      ) : (
        // Antes abría un modal de edición rápida acá mismo — ahora manda
        // directo al editor completo (/admin/portfolio), que es donde
        // realmente vive toda la edición del perfil.
        <Link
          href="/admin/portfolio"
          className="flex items-center gap-2 h-[38px] px-4 rounded-[10px] bg-trevo-dark text-white text-[13px] font-medium hover:bg-trevo-dark/85 transition-colors shrink-0"
        >
          <Pencil className="w-[14px] h-[14px]" />
          Editar perfil
        </Link>
      )}

      {variant === 'cover' && open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4" onClick={() => !saving && setOpen(false)}>
          <div
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-stone-900">Editar perfil</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-stone-400 hover:text-stone-700 transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <ImageUploader label="Foto de banner" value={form.bannerImage} onChange={v => setForm(f => ({ ...f, bannerImage: v }))} folder="profiles" />
              <ImageUploader label={portfolio.accountType === 'company' ? 'Logo' : 'Foto de perfil'} value={form.avatarImage} onChange={v => setForm(f => ({ ...f, avatarImage: v }))} folder="profiles" />

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">{portfolio.accountType === 'company' ? 'Nombre del estudio' : 'Nombre'}</label>
                <input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-lg border border-stone-200 focus:ring-2 focus:ring-stone-300 outline-none transition-shadow"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Ubicación</label>
                <input
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Ciudad, país"
                  className="w-full px-3.5 py-2 rounded-lg border border-stone-200 focus:ring-2 focus:ring-stone-300 outline-none transition-shadow"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Bio</label>
                <textarea
                  value={form.bio}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                  rows={3}
                  maxLength={400}
                  className="w-full px-3.5 py-2 rounded-lg border border-stone-200 focus:ring-2 focus:ring-stone-300 outline-none transition-shadow resize-none"
                />
              </div>

              <p className="text-xs text-stone-400">
                Aptitudes, experiencia, educación y certificaciones se editan desde <a href="/admin/portfolio" className="underline hover:no-underline">el editor completo</a>.
              </p>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-stone-100 sticky bottom-0 bg-white">
              <button onClick={() => setOpen(false)} disabled={saving} className="px-4 py-2 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
