/**
 * Resumo interno da Nina, dentro da conversa, no ponto em que ela concluiu o atendimento.
 * Uso interno da equipe: nada aqui é enviado ao paciente. Sempre aberto e sem botão de regerar:
 * cada conclusão da Nina tem o seu resumo, que não muda depois.
 */
import { Sparkles } from "lucide-react";
import { paragrafosDoResumo } from "@/lib/atendimento/handoff-resumo";
import { rotuloDesfecho } from "@/lib/atendimento/resumo-desfecho";
import type { ResumoNaConversa as Resumo } from "@/lib/atendimento/resumo-retencao";

const fmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function ResumoNaConversa({ resumo }: { resumo: Resumo }) {
  const r = resumo.payload;
  const agendamento = r.agendamento_confirmado;
  const desfecho = rotuloDesfecho(resumo.desfecho as never);
  return (
    <div className="flex justify-center px-2" data-testid="resumo-na-conversa" data-resumo-id={resumo.id}>
      <section
        aria-label="Resumo da Nina"
        className="w-full max-w-[92%] rounded-lg border border-purple-300/70 bg-purple-50 px-3 py-2 text-purple-950 shadow-sm dark:border-purple-400/30 dark:bg-purple-950/60 dark:text-purple-100"
      >
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wide">
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Resumo da Nina</span>
          {r.protocolo && <span className="font-normal normal-case opacity-80">Protocolo {r.protocolo}</span>}
          {desfecho && (
            <span className="rounded bg-purple-200/80 px-1.5 py-0.5 text-[10px] font-medium normal-case dark:bg-purple-400/25">
              {desfecho}
            </span>
          )}
          <span className="ml-auto font-normal normal-case opacity-70" title="Resumo interno, guardado por sete dias">
            uso interno · {fmt.format(new Date(resumo.handoff_em))}
          </span>
        </header>
        <div className="mt-2 space-y-2 text-xs leading-relaxed">
          {paragrafosDoResumo(r).map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {p}
            </p>
          ))}
          {agendamento && (
            <p className="rounded bg-purple-100 px-2 py-1 dark:bg-purple-400/15">
              <strong>Agendamento confirmado:</strong>{" "}
              {[agendamento.servico, agendamento.medico, agendamento.data, agendamento.hora].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
