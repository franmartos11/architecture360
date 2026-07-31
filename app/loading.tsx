export default function Loading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-[9999]">
      <div className="flex flex-col items-center gap-4">
        {/* Simple spinning loader */}
        <div className="w-10 h-10 border-4 border-gray-200 border-t-emerald-700 rounded-full animate-spin" />
        <p className="text-sm font-medium text-gray-500 uppercase tracking-widest animate-pulse">
          Cargando
        </p>
      </div>
    </div>
  );
}
