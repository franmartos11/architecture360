'use client';

import { useState, useEffect } from 'react';

export default function Calculator() {
  const [modelo, setModelo] = useState(195000);
  const [prima, setPrima] = useState(15);
  const [tasa, setTasa] = useState(6.5);
  const [plazo, setPlazo] = useState(25);
  const [monto, setMonto] = useState(0);
  const [resultado, setResultado] = useState(0);

  useEffect(() => {
    // Fórmula monto: modelo - (modelo * prima / 100)
    const m = modelo - (modelo * prima / 100);
    setMonto(m);

    // Fórmula cuota:
    const r = tasa / 12 / 100;
    const n = plazo * 12;
    
    let res = 0;
    if (r === 0) {
      res = m / n;
    } else {
      const pow = Math.pow(1 + r, n);
      res = (m * (r * pow)) / (pow - 1);
    }
    
    setResultado(res);
  }, [modelo, prima, tasa, plazo]);

  const formatUSD = (val: number) => {
    return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USD";
  };

  return (
    <div className="w-full bg-trevo-light py-20 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-12 items-center">
        {/* Formulario */}
        <div className="w-full md:w-1/2 space-y-6">
          <h2 className="text-2xl md:text-3xl font-light text-trevo-dark mb-6 md:mb-8 tracking-wide text-center md:text-left">CALCULA TU CUOTA</h2>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-trevo-dark">Modelo interesado</label>
            <select 
              value={modelo} 
              onChange={(e) => setModelo(Number(e.target.value))}
              className="p-3 border border-trevo-lightgreen/30 rounded bg-white text-trevo-dark focus:outline-none focus:border-trevo-lightgreen"
            >
              <option value="195000">Modelo A desde $195,000 USD</option>
              <option value="245000">Modelo B desde $245,000 USD</option>
              <option value="310000">Modelo C desde $310,000 USD</option>
              <option value="450000">Penthouse desde $450,000 USD</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-trevo-dark">Prima</label>
            <select 
              value={prima} 
              onChange={(e) => setPrima(Number(e.target.value))}
              className="p-3 border border-trevo-lightgreen/30 rounded bg-white text-trevo-dark focus:outline-none focus:border-trevo-lightgreen"
            >
              <option value="15">15%</option>
              <option value="20">20%</option>
              <option value="25">25%</option>
              <option value="30">30%</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-trevo-dark">Tasa de interés</label>
            <select 
              value={tasa} 
              onChange={(e) => setTasa(Number(e.target.value))}
              className="p-3 border border-trevo-lightgreen/30 rounded bg-white text-trevo-dark focus:outline-none focus:border-trevo-lightgreen"
            >
              <option value="6.5">6.5%</option>
              <option value="7">7.0%</option>
              <option value="8">8.0%</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-trevo-dark">Años plazo</label>
            <select 
              value={plazo} 
              onChange={(e) => setPlazo(Number(e.target.value))}
              className="p-3 border border-trevo-lightgreen/30 rounded bg-white text-trevo-dark focus:outline-none focus:border-trevo-lightgreen"
            >
              <option value="20">20</option>
              <option value="25">25</option>
              <option value="30">30</option>
            </select>
          </div>
          
          <div className="flex flex-col gap-2 pt-2">
            <label className="text-sm font-semibold text-trevo-dark">Monto a financiar</label>
            <input 
              readOnly 
              value={formatUSD(monto)} 
              className="p-3 border border-transparent rounded bg-white/50 text-trevo-dark font-medium cursor-default"
            />
          </div>
        </div>

        {/* Resultado */}
        <div className="w-full md:w-1/2 bg-trevo-green p-6 sm:p-8 md:p-10 rounded-xl flex flex-col items-center justify-center space-y-4 md:space-y-6 shadow-2xl">
          <div className="text-white/80 text-base md:text-lg text-center">Cuota mensual aproximada</div>
          <h2 className="text-white text-4xl sm:text-5xl font-light text-center break-all">{formatUSD(resultado)}</h2>
          <button className="btn-solid-brown w-full mt-2 md:mt-4">
            SOLICITAR INFORMACIÓN
          </button>
        </div>
      </div>
      
      <p className="max-w-6xl mx-auto text-xs text-trevo-dark/50 mt-12 text-center">
        *IMPORTANTE: Este servicio solo para uso de consulta y no representa ninguna obligación para el proyecto. El cálculo corresponde al valor de una cuota mensual. La información puede ser cambiada sin previo aviso. El cálculo solo comprende valor a capital más intereses. No incluye seguros, comisiones, ni otros recargos relacionados.
      </p>
    </div>
  );
}
