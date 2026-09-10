/**
 * FASE 4 — bloco do resumo da Nina dentro da timeline.
 *
 * Substitui a linha "Resumo interno da Nina gerado para o atendimento" pelo
 * CONTEÚDO real do resumo vigente: visível sem clique, compacto e uma única
 * vez por handoff. Só apresentação — nada é gerado nem gravado aqui.
 */
import { formatarDataHoraMensagem } from "@/lib/atendimento/data-hora";
import { blocosVisiveis } from "@/lib/atendimento/handoff-resumo";
import { useResumoHandoff } from "@/components/nina/use-resumo-handoff";

export function ResumoNinaTimelineCard({
  clinicaId,
  conversaId,
  criadoEm,
}: {
  clinicaId: string;
  conversaId: string;
  criadoEm: string;
}) {
  const { linha } = useResumoHandoff(clinicaId, conversaId, { assinarRealtime: false });
  const r = linha?.payload ?? null;
  if (!linha || (!r && linha.status !== "gerando")) return null;

  return (
    <div className="my-1.5 flex justify-center px-2">
      <div className="w-full max-w-[70%] min-w-[240px] rounded-lg border border-purple-300/60 bg-purple-50/70 px-3 py-2 text-[11px] leading-tight text-purple-950 sm:text-xs dark:border-purple-400/25 dark:bg-purple-950/40 dark:text-purple-100">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">📝 Resumo da Nina</span>
          <span className="whitespace-nowrap opacity-60">
            {formatarDataHoraMensagem(criadoEm)}
          </span>
        </div>
        {!r && linha.status === "gerando" ? (
          <p className="mt-1 opacity-80">Gerando resumo da conversa…</p>
        ) : null}
        {r ? (
          <div className="mt-1 space-y-1">
            {r.agendamento_confirmado && (
              <p>
                <span className="opacity-70">Agendamento confirmado: </span>
                {[
                  r.agendamento_confirmado.servico,
                  r.agendamento_confirmado.medico,
                  r.agendamento_confirmado.data,
                  r.agendamento_confirmado.hora,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {blocosVisiveis(r).map((b) => (
              <div key={b.titulo}>
                <span className="opacity-70">{b.titulo}: </span>
                <span>{b.itens.join(" · ")}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
