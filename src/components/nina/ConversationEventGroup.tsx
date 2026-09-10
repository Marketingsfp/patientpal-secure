/**
 * Blocos compactos de eventos internos da conversa (FASE 3).
 *
 * Substituem a sequência de banners soltos de um mesmo processo por um card
 * discreto, com todas as informações visíveis — sem accordion, tooltip, modal
 * ou clique. Só apresentação: nenhum dado é criado, alterado ou apagado aqui.
 */

import { formatarDataHoraMensagem } from "@/lib/atendimento/data-hora";
import type { GrupoAtribuicao, GrupoHandoff } from "@/lib/atendimento/timeline-grupos";

function Card({
  titulo,
  hora,
  linhas,
}: {
  titulo: string;
  hora: string | null;
  linhas: Array<Array<{ rotulo?: string; valor: string }>>;
}) {
  return (
    <div className="my-1.5 flex justify-center px-2">
      <div className="w-full max-w-[62%] min-w-[240px] rounded-lg border border-border/60 bg-muted/50 px-3 py-2 text-[11px] leading-tight text-muted-foreground sm:text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-foreground">{titulo}</span>
          {hora ? <span className="whitespace-nowrap opacity-60">{hora}</span> : null}
        </div>
        <div className="mt-1 space-y-0.5">
          {linhas
            .filter((linha) => linha.length > 0)
            .map((linha, i) => (
              <div key={i} className="flex flex-wrap gap-x-3 gap-y-0.5">
                {linha.map((campo, j) => (
                  <span key={j}>
                    {campo.rotulo ? <span className="opacity-70">{campo.rotulo}: </span> : null}
                    <span className="font-medium text-foreground/90">{campo.valor}</span>
                  </span>
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

const ORIGEM: Record<string, string> = {
  IA: "Nina",
  SISTEMA: "Sistema",
  HUMANO: "Atendente",
};

const STATUS_HANDOFF: Record<GrupoHandoff["status"], string> = {
  SOLICITADO: "Solicitado",
  NA_FILA: "Na fila",
  PROTOCOLO_GERADO: "Protocolo gerado",
  PROTOCOLO_INFORMADO: "Handoff concluído",
};

export function HandoffGroupCard({ grupo }: { grupo: GrupoHandoff }) {
  const auditoria = !grupo.auditoria.registrada
    ? null
    : grupo.auditoria.completa === false
      ? `incompleta (${grupo.auditoria.faltando.join(", ")})`
      : "OK";

  const linha2: Array<{ rotulo?: string; valor: string }> = [];
  if (grupo.protocolo) linha2.push({ rotulo: "Protocolo", valor: grupo.protocolo });
  if (grupo.filaNome || grupo.filaInicial != null)
    linha2.push({
      rotulo: "Fila inicial",
      valor:
        grupo.filaNome && grupo.filaInicial != null
          ? `${grupo.filaNome} (posição ${grupo.filaInicial})`
          : (grupo.filaNome ?? `posição ${grupo.filaInicial}`),
    });
  if (grupo.urgencia) linha2.push({ rotulo: "Urgência", valor: grupo.urgencia });

  const linha3: Array<{ rotulo?: string; valor: string }> = [];
  if (grupo.origem) linha3.push({ rotulo: "Origem", valor: ORIGEM[grupo.origem] ?? grupo.origem });
  linha3.push({ rotulo: "Status", valor: STATUS_HANDOFF[grupo.status] });
  if (auditoria) linha3.push({ rotulo: "Auditoria", valor: auditoria });

  return (
    <Card
      titulo="🤝 Handoff para atendimento humano"
      hora={formatarDataHoraMensagem(grupo.criadoEm)}
      linhas={[grupo.motivo ? [{ rotulo: "Motivo", valor: grupo.motivo }] : [], linha2, linha3]}
    />
  );
}

export function EsperaAtendenteCard({ protocolo }: { protocolo: string | null }) {
  return (
    <Card
      titulo={protocolo ? `⏳ Aguardando atendente · ${protocolo}` : "⏳ Aguardando atendente"}
      hora={null}
      linhas={[[{ valor: "Nenhum atendente disponível no momento." }]]}
    />
  );
}

export function AtribuicaoGroupCard({ grupo }: { grupo: GrupoAtribuicao }) {
  const manual = grupo.transferencia || !grupo.automatica;
  const hora = formatarDataHoraMensagem(grupo.criadoEm);

  if (manual) {
    const linha1: Array<{ rotulo?: string; valor: string }> = [];
    if (grupo.origemNome) linha1.push({ rotulo: "De", valor: grupo.origemNome });
    if (grupo.atendenteNome) linha1.push({ rotulo: "Para", valor: grupo.atendenteNome });
    if (grupo.setorNome) linha1.push({ rotulo: "Setor", valor: grupo.setorNome });
    return (
      <Card
        titulo="👤 Transferência manual"
        hora={hora}
        linhas={[
          linha1,
          grupo.realizadaPorNome
            ? [{ rotulo: "Realizada por", valor: grupo.realizadaPorNome }]
            : [],
        ]}
      />
    );
  }

  const linha1: Array<{ rotulo?: string; valor: string }> = [];
  if (grupo.atendenteNome) linha1.push({ rotulo: "Atendente", valor: grupo.atendenteNome });
  if (grupo.statusAtendente) linha1.push({ rotulo: "Status", valor: grupo.statusAtendente });

  return (
    <Card
      titulo="👤 Atribuição automática"
      hora={hora}
      linhas={[linha1, grupo.criterio ? [{ rotulo: "Critério", valor: grupo.criterio }] : []]}
    />
  );
}
