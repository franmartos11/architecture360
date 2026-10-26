import { describe, it, expect } from 'vitest';
import { classifyPanoramaAspect, panoramaTargetSize, MAX_PANORAMA_WIDTH } from './panorama';

describe('classifyPanoramaAspect', () => {
  it('2:1 es equirect', () => expect(classifyPanoramaAspect(8000, 4000)).toBe('equirect'));
  it('cuadrada es stereo', () => expect(classifyPanoramaAspect(6000, 6000)).toBe('stereo'));
  it('4:3 es other', () => expect(classifyPanoramaAspect(4000, 3000)).toBe('other'));
});

describe('panoramaTargetSize', () => {
  it('no achica si entra', () => expect(panoramaTargetSize(8000, 4000)).toBeNull());
  it('achica proporcional al máximo', () => {
    expect(MAX_PANORAMA_WIDTH).toBe(8192);
    expect(panoramaTargetSize(12000, 6000)).toEqual({ width: 8192, height: 4096 });
  });
});
