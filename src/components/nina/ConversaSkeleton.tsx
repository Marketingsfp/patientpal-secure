import { Skeleton } from "@/components/ui/skeleton";

/**
 * Estado de carregamento da área central do atendimento.
 * Exibido enquanto a conversa selecionada ainda não terminou de carregar,
 * para que nunca exista tela vazia entre a saída do lead anterior e a
 * entrada do novo. Usa apenas tokens semânticos (Light/Dark).
 */
export function ConversaSkeleton() {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="conversa-skeleton"
    >
      <p className="text-center text-sm text-muted-foreground">Carregando conversa…</p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
          <div className="w-[60%] max-w-[420px] space-y-2 rounded-lg border border-atd-border bg-atd-surface p-3">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton compacto para o painel lateral de contato. */
export function ContatoSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
