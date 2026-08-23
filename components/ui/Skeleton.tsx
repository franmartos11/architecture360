// Placeholders con la forma real del contenido — reemplaza el spinner
// genérico centrado en las zonas donde eso hoy deja la pantalla en blanco
// mientras carga (PostFeed, CommentSection). El "pulse" da la sensación de
// app viva que un spinner aislado no da.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-trevo-dark/10 rounded-md ${className}`} />;
}

export function SkeletonAvatar({ size = 'w-10 h-10' }: { size?: string }) {
  return <Skeleton className={`${size} rounded-full shrink-0`} />;
}

export function PostSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-trevo-dark/10 p-5">
      <div className="flex items-start gap-3">
        <SkeletonAvatar />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function CommentSkeleton() {
  return (
    <div className="flex gap-3">
      <SkeletonAvatar size="w-9 h-9" />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}
