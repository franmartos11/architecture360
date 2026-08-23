'use client';

import { useState, useEffect } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PersonSearchSelect, { type PersonSearchResult } from '@/components/admin/PersonSearchSelect';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface CollaboratorRow {
  id: string;
  contribution: string;
  status: 'pending' | 'accepted' | 'declined';
  profile: { handle: string; display_name: string; avatar_image: string | null } | null;
}

const STATUS_LABEL: Record<CollaboratorRow['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  declined: 'Rechazado',
};
const STATUS_CLASS: Record<CollaboratorRow['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  accepted: 'bg-green-50 text-green-700',
  declined: 'bg-gray-100 text-gray-500',
};

export default function TeamEditor({ onSaved }: { onSaved: () => void }) {
  const [collaborators, setCollaborators] = useState<CollaboratorRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PersonSearchResult | null>(null);
  const [contribution, setContribution] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContribution, setEditingContribution] = useState('');
  const toast = useToast();
  const confirmDialog = useConfirm();

  const load = () => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => { setCollaborators(data.collaborators ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setAdding(true);
    const res = await fetch('/api/admin/collaborators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: selected.handle, contribution }),
    });
    setAdding(false);
    if (res.ok) {
      setSelected(null);
      setContribution('');
      load();
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo agregar.');
    }
  };

  const handleRemove = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Quitar a esta persona de los créditos del proyecto?', confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/collaborators/${id}`, { method: 'DELETE' });
    if (res.ok) { load(); onSaved(); } else toast('No se pudo quitar.', 'error');
  };

  const startEdit = (c: CollaboratorRow) => {
    setEditingId(c.id);
    setEditingContribution(c.contribution);
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/admin/collaborators/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contribution: editingContribution }),
    });
    if (res.ok) { setEditingId(null); load(); onSaved(); } else toast('No se pudo guardar.', 'error');
  };

  if (loading || !collaborators) return <LoadingSpinner text="Cargando..." tone="light" />;

  return (
    <div>
      <div className="divide-y divide-gray-100">
        {collaborators.map(c => (
          <div key={c.id} className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
              {c.profile?.avatar_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.profile.avatar_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm text-gray-400">{(c.profile?.display_name ?? '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900 truncate">{c.profile?.display_name ?? c.profile?.handle ?? '(perfil borrado)'}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_CLASS[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              {editingId === c.id ? (
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    value={editingContribution}
                    onChange={e => setEditingContribution(e.target.value)}
                    className="flex-1 px-2.5 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    autoFocus
                  />
                  <button onClick={() => saveEdit(c.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0">Guardar</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">Cancelar</button>
                </div>
              ) : (
                c.contribution && <p className="text-sm text-gray-500 truncate">{c.contribution}</p>
              )}
            </div>
            {editingId !== c.id && (
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => startEdit(c)} className="text-sm text-gray-500 hover:text-gray-700">Editar</button>
                <button onClick={() => handleRemove(c.id)} className="text-sm text-red-500 hover:text-red-700">Quitar</button>
              </div>
            )}
          </div>
        ))}
        {collaborators.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">Todavía no acreditaste a nadie en este proyecto.</p>
        )}
      </div>
      <form onSubmit={handleAdd} className="p-6 bg-gray-50/50 space-y-3">
        <PersonSearchSelect selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} placeholder="Buscar por nombre o handle..." />
        <Input
          value={contribution}
          onChange={e => setContribution(e.target.value)}
          placeholder="Qué hizo (ej: Renders y maqueta)"
          aria-label="Qué hizo en el proyecto"
        />
        <div className="flex items-center justify-between gap-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={adding || !selected} className="ml-auto">
            {adding ? 'Agregando...' : '+ Acreditar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
