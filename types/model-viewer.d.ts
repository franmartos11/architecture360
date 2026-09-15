// Declaraciones de tipo para el web component <model-viewer> de Google.
// Se necesitan para que TypeScript acepte el tag en JSX sin quejarse.
// Ref: https://modelviewer.dev/docs/index.html

declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        'camera-controls'?: boolean | string;
        'touch-action'?: string;
        'auto-rotate'?: boolean | string;
        'shadow-intensity'?: string;
        'environment-image'?: string;
        ar?: boolean | string;
        loading?: 'auto' | 'lazy' | 'eager';
        reveal?: 'auto' | 'manual';
        'camera-orbit'?: string;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        'field-of-view'?: string;
        'interaction-prompt'?: 'auto' | 'none';
      },
      HTMLElement
    >;
  }
}
