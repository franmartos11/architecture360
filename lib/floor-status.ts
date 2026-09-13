import type { FloorKind } from '@/types/database';

export type FloorStatus = 'complete' | 'partial' | 'empty';

export interface FloorStatusInput {
  floorKind: FloorKind;
  hasPlan: boolean;
  totalUnits: number;
  missingPhoto: number;
  missingPrice: number;
}

export function floorStatus(input: FloorStatusInput): FloorStatus {
  if (input.floorKind !== 'units') {
    return input.hasPlan ? 'complete' : 'empty';
  }
  if (input.totalUnits === 0) {
    return input.hasPlan ? 'partial' : 'empty';
  }
  const complete = input.hasPlan && input.missingPhoto === 0 && input.missingPrice === 0;
  return complete ? 'complete' : 'partial';
}

export function floorStatusLabel(input: FloorStatusInput): string {
  if (input.floorKind !== 'units') {
    return input.hasPlan ? 'Completo' : 'Falta el plano';
  }
  if (input.totalUnits === 0) {
    return input.hasPlan ? 'Sin unidades' : 'Sin unidades ni plano';
  }
  const parts: string[] = [];
  if (!input.hasPlan) parts.push('falta el plano');
  if (input.missingPhoto > 0) parts.push(`${input.missingPhoto} sin foto`);
  if (input.missingPrice > 0) parts.push(`${input.missingPrice} sin precio`);
  return parts.length === 0 ? 'Completo' : parts.join(' · ');
}
