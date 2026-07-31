'use client';

import dynamic from 'next/dynamic';
import type { Project } from '@/types';

const AerialView = dynamic(() => import('./AerialView'), { ssr: false });

export default function AerialViewWrapper({ project }: { project: Project }) {
  return <AerialView project={project} />;
}
