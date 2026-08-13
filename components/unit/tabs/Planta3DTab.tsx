'use client';

import Image from 'next/image';
import { m as motion } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Unit } from '@/types';

export default function Planta3DTab({ unit }: { unit: Unit }) {
  return (
    <motion.div
      key="planta3d"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pt-16 flex items-center justify-center p-2 sm:p-4"
    >
      <div className="relative w-full h-full">
        {unit.floorPlan3dUrl && (
          <TransformWrapper
            initialScale={1}
            minScale={1}
            maxScale={4}
            centerOnInit={true}
            wheel={{ step: 0.1 }}
            doubleClick={{ step: 1 }}
            panning={{ disabled: false }}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              <Image
                src={unit.floorPlan3dUrl}
                alt="Planta 3D"
                width={1200}
                height={1200}
                priority
                className="max-w-full max-h-[85vh] object-contain"
                draggable={false}
              />
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>
    </motion.div>
  );
}
