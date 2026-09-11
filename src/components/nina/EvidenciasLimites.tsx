/**
 * FASE 5 — contagens e limites das evidências, no painel "Detalhes técnicos
 * da resposta". Só apresentação: nenhuma evidência é reescrita, deduplicada
 * ou preenchida por suposição.
 */
import {
  limitesDaCaptura,
  resumirEntradasDoModelo,
  resumirFerramentas,
} from "@/lib/nina/evidencias-resumo";

type EtapaBruta = { tipo?: string | null; dados?: Record<string, unknown> | null };

export function EvidenciasLimites({ etapas }: { etapas: readonly EtapaBruta[] }) {
  const contexto = etapas.find((e) => e?.tipo === "contexto_modelo") ?? null;
  const resposta = etapas.find((e) => e?.tipo === "resposta_original") ?? null;

  const entradas = resumirEntradasDoModelo(contexto);
  const ferramentas = resumirFerramentas(contexto, resposta);
  const limites = limitesDaCaptura(
    etapas.map((e) => ({ tipo: (e?.tipo ?? "") as never, dados: (e?.dados ?? {}) as never })),
  );

  return (
    <div className="space-y-1">
      <p>
        <span className="text-muted-foreground">Entradas enviadas ao modelo: </span>
        {entradas.texto}
      </p>
      {entradas.duplicados.length > 0 && (
        <p className="text-muted-foreground">
          Duplicação mantida como está na requisição registrada. A correção da montagem do contexto
          não faz parte desta fase e está registrada como defeito à parte.
        </p>
      )}
      <p>
        <span className="text-muted-foreground">Ferramentas: </span>
        {ferramentas.texto}
      </p>
      <p className="text-muted-foreground">{limites.descricao}</p>
    </div>
  );
}
