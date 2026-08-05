import type { ReactNode } from "react";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";

/**
 * Empty state com orientação e ação (CTA). Lê a flag de clínica
 * `ux_melhorias` internamente: desligada, renderiza o `fallback` (o texto
 * seco original), então clínicas fora do piloto não mudam em nada.
 */
export function EmptyState({
  icon,
  titulo,
  descricao,
  acao,
  fallback,
}: {
  icon?: ReactNode;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  fallback: ReactNode;
}) {
  const { enabled } = useClinicFeatureFlag("ux_melhorias");
  if (!enabled) return <>{fallback}</>;
  return (
    <div className="py-10 px-4 text-center space-y-2">
      {icon && <div className="mx-auto w-fit text-muted-foreground/40">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
      {acao && <div className="pt-2">{acao}</div>}
    </div>
  );
}
