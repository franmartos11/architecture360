export default function ErrorState({
  message = 'Ocurrió un error al cargar los datos.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center" role="alert">
      <p className="text-sm text-red-600 font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-xs font-medium text-red-700 hover:text-red-800 underline">
          Reintentar
        </button>
      )}
    </div>
  );
}
