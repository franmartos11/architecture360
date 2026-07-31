'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    interestRate: 5.5,
    maxYears: 30,
    minDownPayment: 20
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && data.interestRate) {
          setSettings(data);
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setMessage('Configuración guardada exitosamente.');
      } else {
        setMessage('Error al guardar.');
      }
    } catch (err) {
      setMessage('Error de conexión.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading) return <div>Cargando configuración...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Configuración del Sistema</h2>
        <p className="text-sm text-gray-500 mt-1">Ajusta los parámetros globales de la aplicación y herramientas de venta.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Calculadora Financiera</h3>
          <p className="text-sm text-gray-500">Estos valores se utilizarán para proyectar las cuotas de hipoteca a los clientes.</p>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tasa de Interés Anual (%)
              </label>
              <input 
                type="number" 
                step="0.01" 
                min="0"
                value={settings.interestRate}
                onChange={e => setSettings({ ...settings, interestRate: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Ej: 5.5 para un 5.5% anual.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Plazo Máximo (Años)
              </label>
              <input 
                type="number" 
                min="1"
                max="50"
                value={settings.maxYears}
                onChange={e => setSettings({ ...settings, maxYears: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Máximo tiempo de financiación permitido.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Anticipo Mínimo Obligatorio (%)
              </label>
              <input 
                type="number" 
                step="1" 
                min="0"
                max="100"
                value={settings.minDownPayment}
                onChange={e => setSettings({ ...settings, minDownPayment: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Porcentaje del valor de la unidad (ej: 20%).</p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-green-600">{message}</span>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
