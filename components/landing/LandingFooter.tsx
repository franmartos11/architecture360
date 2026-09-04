import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/10 px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-brand-400 flex items-center justify-center text-brand-900 font-bold text-xs">
            A
          </div>
          <span className="text-sm text-white/50">© {new Date().getFullYear()} Atrium</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#producto" className="text-sm text-white/50 hover:text-white transition-colors">
            Producto
          </a>
          <a href="#preguntas" className="text-sm text-white/50 hover:text-white transition-colors">
            Preguntas
          </a>
          <Link href="/admin/login" className="text-sm text-white/50 hover:text-white transition-colors">
            Ingresar
          </Link>
          <Link href="/admin/signup" className="text-sm text-white/50 hover:text-white transition-colors">
            Registrarme
          </Link>
        </div>
      </div>
    </footer>
  );
}
