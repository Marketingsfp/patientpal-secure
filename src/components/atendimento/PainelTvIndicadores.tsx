import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { faixaEsperaDesde, formatarEspera, minutosDesde } from "@/lib/atendimento/espera";
import type { DadosPainelTv } from "@/lib/atendimento/painel-tv-demonstracao";
import { cn } from "@/lib/utils";

type Props = { dados: DadosPainelTv | null; children: ReactNode };

const explicacoes = [
  [
    "Esperando resposta da equipe",
    "Quantidade de conversas em que a última mensagem foi do paciente e ainda falta uma resposta humana.",
  ],
  [
    "Mais antiga sem resposta",
    "Tempo da conversa que está esperando resposta há mais tempo. 'Desde' mostra quando essa espera começou.",
  ],
  [
    "Normal, atenção e crítica",
    "Normal: menos de 5 minutos. Atenção: de 5 a 10 minutos. Crítica: mais de 10 minutos.",
  ],
  ["Sem atendente", "Conversas esperando resposta que ainda não foram atribuídas a uma atendente."],
  [
    "Online, pausa e offline",
    "Situação atual da atendente. Quem está offline só permanece na lista enquanto tiver conversa atribuída.",
  ],
  [
    "Atrib.",
    "Total de conversas abertas atribuídas à atendente, mesmo que estejam aguardando o paciente.",
  ],
  ["Pend.", "Conversas atribuídas em que o paciente falou por último e espera resposta."],
  ["Crít.", "Quantidade acima de 10 minutos; abaixo dela aparece o tempo da crítica mais antiga."],
  [
    "Média",
    "Tempo médio de resposta da atendente hoje. O cálculo usa apenas respostas com começo e fim registrados.",
  ],
  ["Resolv.", "Conversas finalizadas hoje por aquela atendente."],
  [
    "Mensagens por hora",
    "Quantidade de mensagens recebidas de pacientes em cada hora. A coluna clara é a hora atual.",
  ],
  ["Entradas · 60 min", "Conversas diferentes em que o paciente enviou mensagem na última hora."],
  [
    "Resolvidas · 60 min",
    "Conversas encerradas pela equipe na última hora. Compare com as entradas para perceber se a fila tende a crescer.",
  ],
  [
    "No alvo de 5 min",
    "Percentual das respostas humanas medidas hoje que aconteceram em até 5 minutos.",
  ],
  ["Em risco", "Conversas esperando entre 5 e 10 minutos, antes de entrarem na faixa crítica."],
  ["Resposta média", "Soma de todos os tempos medidos dividida pela quantidade de respostas."],
  ["Resposta mediana", "Tempo típico: metade das respostas aconteceu antes e metade depois."],
  [
    "90% em até",
    "Tempo em que 90% das respostas aconteceram; ajuda a enxergar os casos mais demorados.",
  ],
  [
    "Amostra",
    "Quantidade de respostas usadas nos cálculos de tempo. Quanto maior, mais representativo é o resultado.",
  ],
  ["Reabertas hoje", "Conversas que já tinham sido finalizadas e voltaram ao atendimento hoje."],
  [
    "Sem atendente mais antiga",
    "Há quanto tempo espera a conversa mais antiga que ainda não foi atribuída a ninguém.",
  ],
  [
    "Dados atrasados",
    "O aviso aparece se o painel ficar mais de 2 minutos sem atualização; os números podem não refletir o momento atual.",
  ],
] as const;

export function PainelTvComIndicadores({ dados, children }: Props) {
  const [ajuda, setAjuda] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const abrirAjudaCompleta = (evento: MouseEvent<HTMLDivElement>) => {
    const botao = (evento.target as HTMLElement).closest("button");
    if (botao?.textContent?.trim() !== "Como ler") return;
    evento.preventDefault();
    evento.stopPropagation();
    setAjuda(true);
  };

  const emRisco = (dados?.espera ?? []).filter(
    (data) => faixaEsperaDesde(data, agora) === "atencao",
  ).length;
  const semAtendente = dados?.maisAntigaSemAtendente
    ? minutosDesde(dados.maisAntigaSemAtendente, agora)
    : null;
  const atrasado = dados ? agora - Date.parse(dados.atualizadoEm) > 2 * 60_000 : false;
  const duracao = (segundos: number | null | undefined) => {
    if (segundos == null) return "—";
    return formatarEspera(segundos / 60);
  };
  const percentual = (valor: number | null | undefined) =>
    valor == null ? "—" : `${Math.round(valor * 100)}%`;

  const metricas = [
    [dados?.conversasUltimaHora ?? 0, "Entradas · 60 min"],
    [dados?.resolvidasUltimaHora ?? 0, "Resolvidas · 60 min"],
    [percentual(dados?.slaAte5MinPct), "No alvo de 5 min"],
    [emRisco, "Em risco · 5–10 min", emRisco ? "text-atd-warn" : ""],
    [duracao(dados?.medianaRespostaSeg), "Resposta mediana"],
    [duracao(dados?.p90RespostaSeg), "90% em até"],
    [dados?.respostasMedidas ?? 0, "Amostra"],
    [dados?.reabertasHoje ?? 0, "Reabertas hoje"],
    [
      semAtendente == null ? "—" : formatarEspera(semAtendente),
      "Sem atendente mais antiga",
      semAtendente != null && semAtendente >= 10 ? "text-atd-danger" : "",
    ],
    [dados?.resolvidasHoje ?? 0, "Resolvidas hoje"],
    [duracao(dados?.tempoMedioRespostaSeg), "Resposta média"],
  ] as const;

  return (
    <div onClickCapture={abrirAjudaCompleta}>
      {children}
      <section className="fixed bottom-[4.6vh] right-[3.6vw] z-[105] h-[25vh] w-[38vw] bg-atd-bg text-atd-ink">
        <div className="flex items-center justify-between">
          <p className="text-[1.35vh] uppercase tracking-[0.22em] text-atd-ink-soft">
            Ritmo e qualidade
          </p>
          {atrasado && (
            <b className="rounded-full bg-atd-warn px-[0.55vw] py-[0.2vh] text-[1vh] text-atd-bg">
              Dados atrasados
            </b>
          )}
        </div>
        <div className="mt-[1vh] grid h-[21vh] grid-cols-3 gap-x-[1vw] gap-y-[0.7vh] border-t border-atd-border pt-[1.1vh]">
          {metricas.map(([valor, rotulo, cor = ""]) => (
            <div key={rotulo} className="min-w-0">
              <b className={cn("block text-[2.35vh] font-semibold leading-none tabular-nums", cor)}>
                {valor}
              </b>
              <span className="mt-[0.4vh] block truncate text-[0.88vh] uppercase tracking-[0.1em] text-atd-ink-soft">
                {rotulo}
              </span>
            </div>
          ))}
        </div>
      </section>

      {ajuda && (
        <aside className="fixed inset-[3vh_3vw] z-[150] overflow-auto rounded-2xl border border-atd-border bg-atd-surface p-[2.5vh_2vw] text-atd-ink shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[2.4vh] font-semibold">Como ler o painel</h2>
              <p className="mt-[0.5vh] text-[1.3vh] text-atd-ink-soft">
                Explicação simples de cada informação, válida para dados reais e para a
                demonstração.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAjuda(false)}
              className="grid size-[4vh] place-items-center rounded-lg border border-atd-border"
              aria-label="Fechar explicação"
            >
              <X className="size-[2vh]" />
            </button>
          </div>
          <dl className="mt-[2vh] grid gap-x-[2vw] xl:grid-cols-2">
            {explicacoes.map(([termo, definicao]) => (
              <div
                key={termo}
                className="grid border-t border-atd-border py-[1vh] 2xl:grid-cols-[11vw_1fr]"
              >
                <dt className="text-[1.25vh] font-semibold">{termo}</dt>
                <dd className="text-[1.2vh] leading-relaxed text-atd-ink-soft">{definicao}</dd>
              </div>
            ))}
          </dl>
        </aside>
      )}
    </div>
  );
}
