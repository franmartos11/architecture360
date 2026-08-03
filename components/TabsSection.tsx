'use client';

import { useState } from 'react';
import Image from 'next/image';

const typologies = [
  {
    id: 'modelo-a',
    label: 'MODELO A',
    rooms: '1 habitación',
    area: '85 m²',
    price: 'Desde $195,000 USD',
    desc: 'Ideal para quienes inician una nueva etapa, este apartamento de 85 m² combina amplitud, diseño inteligente y una distribución práctica. Cuenta con 1 habitación, sala / comedor integrados y grandes ventanales. Un espacio moderno pensado para vivir con comodidad.',
    image: 'https://images.unsplash.com/photo-1502672260266-1c1e5240980c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'modelo-b',
    label: 'MODELO B',
    rooms: '2 habitaciones',
    area: '105 - 122 m²',
    price: 'Desde $245,000 USD',
    desc: 'Este modelo ofrece dos habitaciones y áreas de 105 a 122 m², con una distribución flexible y bien aprovechada. Las vistas panorámicas conectan directamente con la ciudad, brindando una experiencia de vida contemporánea.',
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'modelo-c',
    label: 'MODELO C',
    rooms: '3 habitaciones',
    area: '133 - 159 m²',
    price: 'Desde $310,000 USD',
    desc: 'Espacios familiares de tres habitaciones, con una distribución diseñada para separar con claridad las áreas sociales de las privadas. Mayor amplitud, organización óptima y acabados de primera calidad en cada rincón.',
    image: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'penthouse',
    label: 'PENTHOUSE',
    rooms: '3 habitaciones + Estudio',
    area: '165 - 311 m²',
    price: 'Desde $450,000 USD',
    desc: 'Las unidades más exclusivas ocupan los niveles superiores, redefiniendo el concepto de lujo y amplitud. Diseñados para quienes buscan vivir sin límites, incorporan terrazas de dimensiones excepcionales y vistas inigualables.',
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
  }
];

export function TabsSection() {
  const [activeTab, setActiveTab] = useState('modelo-a');

  const activeData = typologies.find(t => t.id === activeTab);

  return (
    <div className="w-full">
      {/* Tab headers */}
      <div className="flex overflow-x-auto no-scrollbar gap-8 border-b border-trevo-lightgreen/30 mb-12">
        {typologies.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-state={activeTab === tab.id ? 'active' : 'inactive'}
            className="tab-trigger pb-4 text-sm font-semibold tracking-widest text-trevo-lightgreen transition-colors hover:text-trevo-dark whitespace-nowrap"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeData && (
        <div className="grid md:grid-cols-2 gap-12 items-center animate-fade-in-up" key={activeData.id}>
          <div className="space-y-6">
            <div>
              <h2 className="text-4xl font-light text-trevo-dark mb-2">{activeData.label}</h2>
              <div className="text-trevo-brown tracking-wide">{activeData.rooms}</div>
            </div>
            
            <div className="space-y-1">
              <h3 className="text-xl font-medium text-trevo-dark">{activeData.area}</h3>
              <h3 className="text-xl font-medium text-trevo-dark">{activeData.price}</h3>
            </div>
            
            <p className="text-trevo-dark/70 leading-relaxed font-light">
              {activeData.desc}
            </p>
            
            <div className="pt-4">
              <button className="btn-solid-brown">
                CONOCER APARTAMENTO
              </button>
            </div>
          </div>
          
          <div className="relative h-[400px] md:h-[500px] w-full rounded-xl overflow-hidden">
            <Image
              src={activeData.image}
              alt={activeData.label}
              fill
              className="object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}
