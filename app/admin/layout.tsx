import ConfirmProvider from '@/components/ui/ConfirmProvider';

// Capa más externa del admin — solo provee el modal de confirmación
// (lo necesitan login/signup/proyectos y todo lo de adentro del grupo
// (project)). La sesión ya la garantiza proxy.ts antes de llegar acá;
// el chrome específico de cada área (el shell con sidebar de un
// proyecto, o el header liviano de cuenta) lo pone cada una la suya.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
