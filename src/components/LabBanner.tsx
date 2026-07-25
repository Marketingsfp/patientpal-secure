import { isLab } from "@/lib/env";

/**
 * Banner permanente exibido no topo da aplicação quando `VITE_APP_ENV=lab`.
 * Em produção o componente retorna `null` — zero impacto visual.
 */
export function LabBanner() {
  if (!isLab()) return null;
  return (
    <div
      role="status"
      aria-label="Ambiente de laboratório"
      className="sticky top-0 z-[100] w-full bg-red-600 text-white text-center text-xs sm:text-sm font-semibold py-1 px-2 shadow-md"
    >
      AMBIENTE DE LABORATÓRIO — dados fictícios. Nenhum envio real de WhatsApp,
      NFS-e ou e-mail será realizado.
    </div>
  );
}