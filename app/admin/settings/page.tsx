'use client';

import { useState, useEffect } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';

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
      })
      .catch(() => setLoading(false));
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

  if (loading) return <LoadingSpinner text="Cargando configuración..." tone="light" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Configuración del Sistema</h2>
        <p className="text-sm text-gray-500 mt-1">Ajusta los parámetros globales de la aplicación y herramientas de venta.</p>
      </div>

      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Calculadora Financiera</h3>
          <p className="text-sm text-gray-500">Estos valores se utilizarán para proyectar las cuotas de hipoteca a los clientes.</p>
        </CardHeader>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Input
                label="Tasa de Interés Anual (%)"
                type="number"
                step="0.01"
                min="0"
                value={settings.interestRate}
                onChange={e => setSettings({ ...settings, interestRate: Number(e.target.value) })}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Ej: 5.5 para un 5.5% anual.</p>
            </div>

            <div>
              <Input
                label="Plazo Máximo (Años)"
                type="number"
                min="1"
                max="50"
                value={settings.maxYears}
                onChange={e => setSettings({ ...settings, maxYears: Number(e.target.value) })}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Máximo tiempo de financiación permitido.</p>
            </div>

            <div>
              <Input
                label="Anticipo Mínimo Obligatorio (%)"
                type="number"
                step="1"
                min="0"
                max="100"
                value={settings.minDownPayment}
                onChange={e => setSettings({ ...settings, minDownPayment: Number(e.target.value) })}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Porcentaje del valor de la unidad (ej: 20%).</p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-green-600">{message}</span>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
