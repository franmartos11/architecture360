'use client';

import { Card, CardHeader } from '@/components/ui/Card';
import CalculatorEditor from '@/components/admin/section-editors/CalculatorEditor';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Configuración</h2>
        <p className="text-sm text-gray-500 mt-1">Ajusta los parámetros de este proyecto y sus herramientas de venta.</p>
      </div>

      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Calculadora Financiera</h3>
          <p className="text-sm text-gray-500">Estos valores se utilizarán para proyectar las cuotas de hipoteca a los clientes.</p>
        </CardHeader>
        <CalculatorEditor />
      </Card>
    </div>
  );
}
