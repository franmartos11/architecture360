export default function LoadingSpinner({ text = 'Cargando...', tone = 'dark' }: { text?: string; tone?: 'dark' | 'light' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-brand-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-500 animate-spin" />
      </div>
      <p className={`text-sm font-medium ${tone === 'light' ? 'text-gray-500' : 'text-white/50'}`}>{text}</p>
    </div>
  );
}
