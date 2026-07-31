declare module 'marzipano' {
  interface ViewerOpts {
    controls?: {
      mouseViewMode?: 'drag' | 'qtvr';
      scrollZoom?: boolean;
    };
    stage?: Record<string, unknown>;
  }

  interface ViewParams {
    yaw: number;
    pitch: number;
    fov: number;
  }

  interface ViewLimiter {
    // opaque limiter
  }

  interface AutorotateOpts {
    yawSpeed: number;
    targetPitch: number;
    targetFov: number;
  }

  class Viewer {
    constructor(domElement: HTMLElement, opts?: ViewerOpts);
    createScene(opts: {
      source: ImageUrlSource;
      geometry: EquirectGeometry;
      view: RectilinearView;
      pinFirstLevel?: boolean;
    }): Scene;
    switchScene(scene: Scene, opts?: Record<string, unknown>): void;
    setIdleMovement(timeout: number, movement: Autorotate): void;
    startMovement(movement: Autorotate): void;
    stopMovement(): void;
    destroy(): void;
    scene(): Scene | null;
    view(): RectilinearView | null;
  }

  class EquirectGeometry {
    constructor(levels: Array<{ width: number }>);
  }

  class RectilinearView {
    constructor(params?: Partial<ViewParams>, limiter?: ViewLimiter);
    static limit: {
      traditional(maxResolution: number, maxFov: number): ViewLimiter;
    };
    yaw(): number;
    pitch(): number;
    fov(): number;
    setYaw(yaw: number): void;
    setPitch(pitch: number): void;
    setFov(fov: number): void;
  }

  class ImageUrlSource {
    static fromString(url: string, opts?: Record<string, unknown>): ImageUrlSource;
  }

  class Scene {
    switchTo(opts?: { transitionDuration?: number }): void;
    hotspotContainer(): HotspotContainer;
    view(): RectilinearView;
  }

  function autorotate(opts: AutorotateOpts): any;

  class HotspotContainer {
    createHotspot(
      domElement: HTMLElement,
      position: { yaw: number; pitch: number },
      opts?: Record<string, unknown>
    ): Hotspot;
    destroyHotspot(hotspot: Hotspot): void;
  }

  class Hotspot {
    domElement(): HTMLElement;
    destroy(): void;
  }

  const _default: {
    Viewer: typeof Viewer;
    EquirectGeometry: typeof EquirectGeometry;
    RectilinearView: typeof RectilinearView;
    ImageUrlSource: typeof ImageUrlSource;
    autorotate: typeof autorotate;
    Scene: typeof Scene;
  };

  export default _default;
}
