'use client';

import { useState, useEffect } from 'react';

export default function AdminLeads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      // Sort newest first
      setLeads(data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsApp = (phone: string, name: string) => {
    const text = encodeURIComponent(`Hola ${name}, me comunico de Residencias del Mar...`);
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
  };

  const updateLeadStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/leads/${id}`, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }) 
      });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <div className="text-gray-500">Cargando leads...</div>;

  const columns = [
    { id: 'nuevo', label: 'Nuevos', color: 'bg-brand-100 text-brand-700' },
    { id: 'contactado', label: 'Contactados', color: 'bg-blue-100 text-blue-700' },
    { id: 'negociacion', label: 'En Negociación', color: 'bg-yellow-100 text-yellow-700' },
    { id: 'cerrado', label: 'Venta Cerrada', color: 'bg-green-100 text-green-700' }
  ];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">CRM de Contactos</h2>
          <p className="text-gray-500 mt-1">Gestión y seguimiento de leads</p>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-6 h-full min-w-max">
          {columns.map(column => {
            const columnLeads = leads.filter(l => (l.status || 'nuevo') === column.id);
            return (
              <div key={column.id} className="w-80 flex flex-col bg-gray-50 rounded-2xl border border-gray-200/60 p-4">
                <div className="flex justify-between items-center mb-4 px-2">
                  <h3 className="font-semibold text-gray-900">{column.label}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${column.color}`}>
                    {columnLeads.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                  {columnLeads.map(lead => (
                    <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col hover:border-brand-200 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-gray-900">{lead.name}</h4>
                        <div className="text-[10px] text-gray-400 font-medium">
                          {new Date(lead.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {lead.phone}
                        </div>
                        <div className="text-xs font-medium bg-gray-50 px-2 py-1 rounded text-gray-700">
                          Interés: {lead.unitName}
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-gray-50">
                        <button
                          onClick={() => handleWhatsApp(lead.phone, lead.name)}
                          className="text-[#25D366] hover:bg-[#25D366]/10 p-1.5 rounded-lg transition-colors"
                          title="Contactar por WhatsApp"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                          </svg>
                        </button>
                        <select
                          value={lead.status || 'nuevo'}
                          onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                          className="text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
