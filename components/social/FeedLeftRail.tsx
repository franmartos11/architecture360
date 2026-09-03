import { Home, Building2, Users, Bookmark, LineChart } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

interface DraftProject {
  name: string;
}

interface FeedLeftRailProps {
  handle: string;
  displayName: string;
  avatarImage: string | null;
  followerCount: number;
  projectsCount: number;
  collaborationsCount: number;
  viewsToday: number;
  draftProject: DraftProject | null;
}

const BORDER = 'border-[rgba(28,25,23,0.07)]';
const TEXT_DARK = 'text-[#1c1a17]';
const TEXT_MUTED_45 = 'text-[rgba(28,25,23,0.45)]';
const TEXT_MUTED_62 = 'text-[rgba(28,25,23,0.62)]';

// Rail izquierdo del feed, calcado del mockup Feed.dc.html: portada a
// rayas + avatar solapado (no el mismo layout que la mini-card genérica
// que tenía antes), stats de 3 columnas, menú de navegación y recordatorio
// de borrador. Colores/tipografía en valores arbitrarios (no tokens
// trevo-*) a propósito — es el look específico de ese diseño, no el
// estilo general de la app, y así queda scopeado a este componente sin
// tocar nada compartido.
export default function FeedLeftRail({
  handle, displayName, avatarImage, followerCount, projectsCount, collaborationsCount, viewsToday, draftProject,
}: FeedLeftRailProps) {
  const navItems = [
    { label: 'Inicio', icon: Home, href: '/feed' },
    { label: 'Mis proyectos', icon: Building2, href: '/admin/proyectos', count: projectsCount },
    { label: 'Colaboraciones', icon: Users, href: `/portfolio/${handle}?tab=proyectos`, count: collaborationsCount },
    { label: 'Guardados', icon: Bookmark, href: '/guardados' },
    { label: 'Panel comercial', icon: LineChart, href: '/admin' },
  ];
  const stats = [
    { value: followerCount, label: 'Seguidores' },
    { value: projectsCount, label: 'Proyectos' },
    { value: viewsToday, label: 'Vistas hoy' },
  ];

  return (
    <div className="flex flex-col gap-3.5 sticky top-20">
      <div className={`rounded-2xl bg-white ${BORDER} border overflow-hidden`}>
        <div className="h-16" style={{ background: 'repeating-linear-gradient(115deg,#2b2925 0 16px,#232120 16px 32px)' }} />
        <div className="px-4 pb-4 -mt-[30px]">
          <Link href={`/portfolio/${handle}`} className="group inline-flex">
            <div
              className="w-14 h-14 rounded-full border-[3px] border-white flex items-center justify-center text-white/90 font-semibold text-xl"
              style={{ background: 'linear-gradient(135deg,#9aa896,#5c7a58)' }}
            >
              {avatarImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarImage} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
          </Link>
          <p className={`font-semibold text-[15px] ${TEXT_DARK} mt-2.5`}>
            <Link href={`/portfolio/${handle}`} className="hover:underline">{displayName}</Link>
          </p>
          <p className={`text-xs ${TEXT_MUTED_45}`}>@{handle}</p>

          <div className={`flex gap-1.5 mt-3 pt-3 border-t ${BORDER}`}>
            {stats.map((s, i) => (
              <div key={s.label} className="flex items-center flex-1">
                {i > 0 && <div className={`w-px self-stretch bg-[rgba(28,25,23,0.07)] mr-1.5`} />}
                <div className="flex-1 text-center">
                  <p className={`font-semibold text-[15px] ${TEXT_DARK}`}>{s.value}</p>
                  <p className={`text-[10.5px] ${TEXT_MUTED_45}`}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <nav className={`rounded-2xl bg-white ${BORDER} border p-2`}>
        {navItems.map(item => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-2.5 h-9 px-2.5 rounded-[9px] text-[12.5px] font-medium ${TEXT_MUTED_62} hover:bg-[#faf9f6] hover:text-[#1c1a17] transition-colors`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {typeof item.count === 'number' && item.count > 0 && (
              <span
                className="min-w-[19px] h-[19px] px-1.5 rounded-[10px] text-[10px] font-semibold flex items-center justify-center"
                style={{ background: 'rgba(92,122,88,0.14)', color: '#4a6647' }}
              >
                {item.count}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {draftProject && (
        <div className="rounded-2xl p-[17px] text-white" style={{ background: 'linear-gradient(150deg,#2f3d2c,#1c1a17)' }}>
          <p className="text-[10px] font-medium tracking-[0.13em] text-white/50">BORRADOR</p>
          <p className="font-semibold text-[14.5px] leading-[1.35] mt-[7px]">{draftProject.name}</p>
          <p className="font-light text-[11.5px] leading-[1.5] text-white/60 mt-[5px]">
            Sin publicar todavía — te espera en modo borrador.
          </p>
          <Link
            href="/admin/proyectos"
            className="block mt-[13px] h-[34px] rounded-[9px] bg-white text-[#1c1a17] text-xs font-medium flex items-center justify-center hover:bg-white/[0.86] transition-colors"
          >
            Seguir editando
          </Link>
        </div>
      )}
    </div>
  );
}
