'use client';

import { useCallback, useEffect, useState } from 'react';
import PersonSearchSelect, { type PersonSearchResult } from '@/components/admin/PersonSearchSelect';
import { Pill, btnPrimary, btnSecondary, fieldClass } from '@/components/admin/panel-ui';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectRole } from '@/lib/project-role-context';
import { MEMBER_ROLES, ROLE_LABELS, canManageMember, isMemberRole, type MemberRole } from '@/lib/project-roles';

interface PersonProfile {
  handle: string;
  display_name: string | null;
  avatar_image: string | null;
}

interface MemberRow {
  id: string;
  user_id: string;
  role: MemberRole;
  status: 'pending' | 'accepted' | 'declined';
  profile: PersonProfile | null;
}

// 'accepted' no lleva etiqueta: es el estado normal, solo se marcan las excepciones.
const STATUS_PILL: Partial<Record<MemberRow['status'], { label: string; tone: 'warn' | 'neutral' }>> = {
  pending: { label: 'Pendiente', tone: 'warn' },
  declined: { label: 'Rechazó', tone: 'neutral' },
};

function Avatar({ p }: { p: PersonProfile | null }) {
  return (
    <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
      {p?.avatar_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.avatar_image} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-sm text-gray-500">{(p?.display_name ?? p?.handle ?? '?').charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

// Configuración → "Acceso al proyecto": quién puede entrar al panel de este
// proyecto y con qué rol. Solo se monta para administrador o más.
export default function TeamMembersCard() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const myRole = useProjectRole();
  const activeProjectId = useActiveProjectId();
  const [owner, setOwner] = useState<(PersonProfile & { id: string }) | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<PersonSearchResult | null>(null);
  const [role, setRole] = useState<MemberRole>('editor');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  // Fila con una mutación en vuelo (cambio de rol o quitar): sin dobles envíos.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(withActiveProject('/api/admin/members', activeProjectId));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar el acceso al proyecto.');
      setOwner(data.owner ?? null);
      setMembers(data.members ?? []);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el acceso al proyecto.');
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  // Carga inicial: load() actualiza el estado recién al resolver el fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Solo se ofrecen los roles que quien invita puede asignar; la API lo vuelve a validar.
  const assignable = MEMBER_ROLES.filter(r => canManageMember(myRole, r));
  const effectiveRole = assignable.includes(role) ? role : assignable[0];

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !effectiveRole || inviting) return;
    setError('');
    setInviting(true);
    try {
      const res = await fetch(withActiveProject('/api/admin/members', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: selected.handle, role: effectiveRole }),
      });
      if (res.ok) {
        setSelected(null);
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo invitar.');
      }
    } catch {
      setError('No se pudo invitar.');
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (m: MemberRow, next: string) => {
    if (busyId || !isMemberRole(next) || next === m.role) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/members/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      });
      if (res.ok) await load();
      else {
        const data = await res.json().catch(() => ({}));
        toast(data.error ?? 'No se pudo cambiar el rol.', 'error');
      }
    } catch {
      toast('No se pudo cambiar el rol.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (m: MemberRow) => {
    if (busyId) return;
    const ok = await confirmDialog({
      message: `¿Quitar a @${m.profile?.handle ?? 'esta persona'} del equipo?`,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/members/${m.id}`, { method: 'DELETE' });
      if (res.ok) await load();
      else {
        const data = await res.json().catch(() => ({}));
        toast(data.error ?? 'No se pudo quitar.', 'error');
      }
    } catch {
      toast('No se pudo quitar.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="px-5 sm:px-6 py-5 border-b border-gray-200 flex flex-col gap-1">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Acceso al proyecto</h2>
        <p className="m-0 text-xs text-gray-600">Personas que pueden entrar al panel de este proyecto.</p>
        <p className="m-0 text-xs text-gray-500">Editor: carga y edita todo el contenido · Gestor: además ve los leads · Administrador: además gestiona el equipo</p>
      </div>

      {loading ? (
        <p className="m-0 px-5 sm:px-6 py-5 text-sm text-gray-600">Cargando…</p>
      ) : loadError ? (
        <div className="px-5 sm:px-6 py-5 flex items-center justify-between gap-3 flex-wrap">
          <p role="alert" className="m-0 text-sm text-red-700">{loadError}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }} className={btnSecondary}>Reintentar</button>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {owner && (
            <div className="px-5 sm:px-6 py-4 flex items-center gap-4">
              <Avatar p={owner} />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-medium text-gray-900 truncate">{owner.display_name ?? owner.handle}</p>
                <p className="m-0 text-xs text-gray-600 truncate">@{owner.handle}</p>
              </div>
              <Pill tone="green">{ROLE_LABELS.dueño}</Pill>
            </div>
          )}
          {members.map(m => {
            const manageable = canManageMember(myRole, m.role);
            const rowBusy = busyId === m.id;
            const pill = STATUS_PILL[m.status];
            return (
              <div key={m.id} className="px-5 sm:px-6 py-4 flex flex-wrap items-center gap-4">
                <Avatar p={m.profile} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="m-0 text-sm font-medium text-gray-900 truncate">{m.profile?.display_name ?? m.profile?.handle ?? '(perfil borrado)'}</p>
                    {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
                  </div>
                  {m.profile?.handle && <p className="m-0 text-xs text-gray-600 truncate">@{m.profile.handle}</p>}
                </div>
                {manageable ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <select
                      value={m.role}
                      disabled={rowBusy}
                      onChange={e => handleChangeRole(m, e.target.value)}
                      aria-label={`Rol de ${m.profile?.handle ?? 'miembro'}`}
                      className={`${fieldClass} !w-auto`}
                    >
                      {assignable.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <button type="button" onClick={() => handleRemove(m)} disabled={rowBusy}
                      className="min-h-[44px] px-2 text-sm font-medium text-red-700 hover:text-red-800 disabled:opacity-50">
                      {rowBusy ? 'Guardando…' : 'Quitar'}
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-gray-600 shrink-0">{ROLE_LABELS[m.role]}</span>
                )}
              </div>
            );
          })}
          {members.length === 0 && (
            <p className="m-0 px-5 sm:px-6 py-5 text-sm text-gray-600">Todavía no invitaste a nadie a este proyecto.</p>
          )}
        </div>
      )}

      <form onSubmit={handleInvite} className="px-5 sm:px-6 py-5 border-t border-gray-200 flex flex-col gap-3">
        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <PersonSearchSelect selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} placeholder="Buscar persona por nombre o handle…" />
          <select value={effectiveRole ?? ''} onChange={e => setRole(e.target.value as MemberRole)} aria-label="Rol a asignar" className={fieldClass}>
            {assignable.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {error ? <p role="alert" className="m-0 text-sm text-red-700">{error}</p> : <span className="text-xs text-gray-600">La persona recibe una invitación y tiene que aceptarla.</span>}
          <button type="submit" disabled={inviting || !selected || !effectiveRole} className={btnPrimary}>
            {inviting ? 'Invitando…' : 'Invitar'}
          </button>
        </div>
      </form>
    </section>
  );
}
