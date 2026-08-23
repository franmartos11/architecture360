'use client';

import { useState, useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { formatPrice } from '@/lib/units';

interface MortgageCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitPrice: number;
  currency?: string;
  projectSlug: string;
}

export default function MortgageCalculatorModal({ isOpen, onClose, unitPrice, currency, projectSlug }: MortgageCalculatorModalProps) {
  const [settings, setSettings] = useState({ interestRate: 5.5, maxYears: 30, minDownPayment: 20 });

  // User Inputs
  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [years, setYears] = useState(30);

  useEffect(() => {
    if (isOpen) {
      fetch(`/api/settings?projectSlug=${encodeURIComponent(projectSlug)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.interestRate) {
            setSettings(data);
            setDownPaymentPct(data.minDownPayment);
            setYears(data.maxYears);
          }
        });
    }
  }, [isOpen, projectSlug]);

  // Derived values
  const downPayment = (unitPrice * downPaymentPct) / 100;
  const loanAmount = unitPrice - downPayment;
  
  // Monthly payment calculation
  const monthlyInterestRate = (settings.interestRate / 100) / 12;
  const numberOfPayments = years * 12;
  
  const monthlyPayment = loanAmount > 0 
    ? (loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) / (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1)
    : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Calculadora Financiera</h3>
                <p className="text-xs text-gray-500">Proyección estimada de pagos</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-6 overflow-y-auto">
              {/* Unit Price Display */}
              <div className="flex justify-between items-end pb-4 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-500">Precio de la unidad</span>
                <span className="text-xl font-bold text-gray-900">{formatPrice(unitPrice, currency)}</span>
              </div>

              {/* Sliders */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-gray-700">Anticipo (Down Payment)</label>
                    <span className="text-sm font-bold text-brand-600">{downPaymentPct}%</span>
                  </div>
                  <input 
                    type="range" 
                    min={settings.minDownPayment} 
                    max="100" 
                    value={downPaymentPct}
                    onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">Min: {settings.minDownPayment}%</span>
                    <span className="text-xs font-medium text-gray-600">{formatPrice(downPayment, currency)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-gray-700">Plazo del crédito</label>
                    <span className="text-sm font-bold text-brand-600">{years} años</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max={settings.maxYears} 
                    value={years}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">Max: {settings.maxYears} años</span>
                    <span className="text-xs font-medium text-gray-600">{years * 12} meses</span>
                  </div>
                </div>
              </div>

              {/* Results */}
              <div className="bg-gray-900 rounded-xl p-5 text-white flex justify-between items-center shadow-lg">
                <div>
                  <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-semibold">Cuota Mensual Estimada</p>
                  <p className="text-3xl font-bold tracking-tight">{formatPrice(monthlyPayment, currency)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400">Tasa: {settings.interestRate}% anual</p>
                  <p className="text-[10px] text-gray-400">Monto: {formatPrice(loanAmount, currency)}</p>
                </div>
              </div>
              
              <p className="text-[10px] text-center text-gray-400 leading-tight">
                Los cálculos son aproximados y no incluyen seguros, impuestos ni gastos administrativos. 
                Sujeto a aprobación crediticia.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
