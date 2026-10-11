import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { faixaEsperaDesde, formatarEspera, minutosDesde } from "@/lib/atendimento/espera";
import type { DadosPainelTv } from "@/lib/atendimento/painel-tv-demonstracao";
import { cn } from "@/lib/utils";

type Props = { dados: DadosPainelTv | null; children: ReactNode };

const explicacoes = [
  [
    "Esperando resposta da equipe",
    "Número de pacientes que mandaram a última mensagem e ainda estão esperando uma resposta de uma pessoa da equipe.",
  ],
  [
    "Mais antiga sem resposta",
    "Mostra há quanto tempo espera o paciente que está há mais tempo sem resposta. 'Desde' mostra o horário em que essa espera começou.",
  ],
  [
    "Normal, atenção e crítica",
    "Normal: menos de 5 minutos. Atenção: de 5 a 10 minutos. Crítica: mais de 10 minutos. Cada quadrado é um paciente esperando; quando há muitos, os quadrados diminuem para todos caberem na régua.",
  ],
  [
    "Sem atendente",
    "Pacientes esperando resposta cuja conversa ainda não foi entregue a nenhuma atendente.",
  ],
  [
    "Online, pausa e offline",
    "Situação atual da atendente. Quem está offline só permanece na lista enquanto tiver conversa atribuída.",
  ],
  [
    "LAB e TR ao lado do nome",
    "LAB identifica quem está vinculado ao departamento Laboratório. TR identifica quem está vinculado à Tomografia ou à Ressonância. Quem estiver em outro departamento aparece sem sigla.",
  ],
  [
    "Conversas com a atendente (Atrib.)",
    "Todas as conversas abertas que estão sob responsabilidade da atendente, inclusive as que estão esperando o paciente responder.",
  ],
  [
    "Pacientes esperando a atendente (Pend.)",
    "Conversas daquela atendente em que o paciente falou por último e ainda aguarda uma resposta.",
  ],
  [
    "Esperando há mais de 10 min (Crít.)",
    "Número de pacientes daquela atendente esperando há mais de 10 minutos. O tempo mostrado abaixo é a maior espera entre eles.",
  ],
  [
    "Tempo médio para responder (Média)",
    "Tempo médio que a atendente levou para responder hoje. Só entram respostas em que o sistema registrou a mensagem do paciente e a resposta da atendente.",
  ],
  ["Encerrados hoje (Resolv.)", "Atendimentos finalizados hoje por aquela atendente."],
  [
    "Mensagens por hora",
    "Quantidade de mensagens recebidas de pacientes entre 01h e 22h. A coluna clara é a hora atual. O total de hoje continua considerando o dia inteiro, mesmo sem mostrar 00h e 23h no gráfico.",
  ],
  [
    "Pacientes que chamaram na última hora",
    "Número de conversas diferentes que receberam uma nova mensagem do paciente nos últimos 60 minutos. Várias mensagens do mesmo paciente contam como uma conversa.",
  ],
  [
    "Atendimentos encerrados na última hora",
    "Número de atendimentos que a equipe finalizou nos últimos 60 minutos. Se entram mais pacientes do que a equipe encerra, a fila pode aumentar.",
  ],
  [
    "Respostas em até 5 minutos",
    "De cada 100 primeiras respostas humanas analisadas hoje, mostra quantas aconteceram em até 5 minutos. Exemplo: 80% significa que 80 de cada 100 foram respondidas dentro desse tempo.",
  ],
  [
    "Esperando de 5 a 10 minutos",
    "Número de pacientes que estão esperando uma resposta da equipe há pelo menos 5 minutos, mas ainda não passaram de 10 minutos. Depois de 10 minutos, entram na faixa crítica.",
  ],
  [
    "Tempo médio para responder",
    "Soma do tempo de todas as primeiras respostas humanas analisadas hoje, dividida pelo número de respostas analisadas.",
  ],
  [
    "Metade foi respondida em até",
    "Tempo em que metade das primeiras respostas aconteceu. Exemplo: se mostra 2 min, metade dos pacientes recebeu a primeira resposta em até 2 minutos e a outra metade demorou mais.",
  ],
  [
    "9 em cada 10 foram respondidas em até",
    "Mostra até quanto tempo levou para responder 9 de cada 10 pacientes. Exemplo: se mostra 8 min, 9 de cada 10 receberam a primeira resposta em até 8 minutos; 1 de cada 10 pode ter esperado mais.",
  ],
  [
    "Respostas analisadas",
    "Quantidade de primeiras respostas humanas usadas para calcular os tempos deste painel. Só entram casos em que o sistema registrou quando o paciente chamou e quando a equipe respondeu.",
  ],
  [
    "Atendimentos reabertos hoje",
    "Atendimentos que já estavam encerrados, mas voltaram para a fila porque o paciente chamou novamente hoje.",
  ],
  [
    "Maior espera sem atendente",
    "Há quanto tempo está esperando o paciente mais antigo cuja conversa ainda não foi entregue a nenhuma atendente.",
  ],
  [
    "Dados atrasados",
    "O aviso aparece se o painel ficar mais de 2 minutos sem atualização; os números podem não refletir o momento atual.",
  ],
] as const;

export function PainelTvComIndicadores({ dados, children }: Props) {
  const [ajuda, setAjuda] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const [alvosRegua, setAlvosRegua] = useState<HTMLElement[]>([]);
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    const raiz = document.getElementById("painel-tv-com-indicadores");
    if (!raiz) return;
    for (const elemento of raiz.querySelectorAll<HTMLElement>("[data-setor-tv]")) {
      elemento.removeAttribute("data-setor-tv");
    }
    for (const atendente of dados?.atendentes ?? []) {
      const sigla = atendente.nome.match(/\((LAB|TR)\)$/)?.[1];
      if (!sigla) continue;
      for (const elemento of raiz.querySelectorAll<HTMLElement>("[title]")) {
        if (elemento.title === atendente.nome) elemento.dataset.setorTv = sigla;
      }
    }
  }, [dados]);
  useEffect(() => {
    const raiz = document.getElementById("painel-tv-com-indicadores");
    if (!raiz) return;
    const linhaTotais = Array.from(raiz.querySelectorAll<HTMLElement>("div.grid")).find((linha) => {
      const textos = Array.from(linha.children, (filho) => filho.textContent?.trim() ?? "");
      return (
        textos.length === 3 &&
        textos[0].includes("normal") &&
        textos[1].includes("atenção") &&
        textos[2].includes("crítica")
      );
    });
    const linhaBlocos = linhaTotais?.previousElementSibling;
    const novosAlvos = linhaBlocos
      ? Array.from(linhaBlocos.children).filter(
          (elemento): elemento is HTMLElement => elemento instanceof HTMLElement,
        )
      : [];
    for (const alvo of novosAlvos) alvo.dataset.reguaBlocosAdaptativos = "true";
    setAlvosRegua(novosAlvos.slice(0, 3));
    return () => {
      for (const alvo of novosAlvos) delete alvo.dataset.reguaBlocosAdaptativos;
    };
  }, [dados]);

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
  const blocosPorFaixa = (["normal", "atencao", "critico"] as const).map(
    (faixa) =>
      (dados?.espera ?? []).filter((data) => faixaEsperaDesde(data, agora) === faixa).length,
  );
  const coresBlocos = ["bg-atd-ok", "bg-atd-warn", "bg-atd-danger"] as const;
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
    [dados?.conversasUltimaHora ?? 0, "Pacientes que chamaram na última hora"],
    [dados?.resolvidasUltimaHora ?? 0, "Atendimentos encerrados na última hora"],
    [percentual(dados?.slaAte5MinPct), "Respostas em até 5 minutos"],
    [emRisco, "Esperando de 5 a 10 minutos", emRisco ? "text-atd-warn" : ""],
    [duracao(dados?.medianaRespostaSeg), "Metade foi respondida em até"],
    [duracao(dados?.p90RespostaSeg), "9 em cada 10 foram respondidas em até"],
    [dados?.respostasMedidas ?? 0, "Respostas analisadas"],
    [dados?.reabertasHoje ?? 0, "Atendimentos reabertos hoje"],
    [
      semAtendente == null ? "—" : formatarEspera(semAtendente),
      "Maior espera sem atendente",
      semAtendente != null && semAtendente >= 10 ? "text-atd-danger" : "",
    ],
    [dados?.resolvidasHoje ?? 0, "Atendimentos encerrados hoje"],
    [duracao(dados?.tempoMedioRespostaSeg), "Tempo médio para responder"],
  ] as const;

  return (
    <div id="painel-tv-com-indicadores" onClickCapture={abrirAjudaCompleta}>
      <style>{`
        #painel-tv-com-indicadores > div:first-child > section:last-of-type {
          grid-template-columns: 60fr 40fr !important;
          gap: 5vw !important;
        }
        #painel-tv-com-indicadores > div:first-child > section:last-of-type
          > div:first-child > div:nth-of-type(1),
        #painel-tv-com-indicadores > div:first-child > section:last-of-type
          > div:first-child > div:nth-of-type(2) {
          grid-template-columns: repeat(22, minmax(0, 1fr)) !important;
        }
        #painel-tv-com-indicadores > div:first-child > section:last-of-type
          > div:first-child > div:nth-of-type(1) > :first-child,
        #painel-tv-com-indicadores > div:first-child > section:last-of-type
          > div:first-child > div:nth-of-type(1) > :last-child,
        #painel-tv-com-indicadores > div:first-child > section:last-of-type
          > div:first-child > div:nth-of-type(2) > :first-child,
        #painel-tv-com-indicadores > div:first-child > section:last-of-type
          > div:first-child > div:nth-of-type(2) > :last-child {
          display: none;
        }
        #painel-tv-com-indicadores [data-setor-tv]::after {
          content: " (" attr(data-setor-tv) ")";
          color: var(--atd-ai, currentColor);
          font-size: 0.72em;
          font-weight: 700;
        }
        #painel-tv-com-indicadores [data-regua-blocos-adaptativos="true"]
          > :not([data-grade-espera-adaptativa]) {
          display: none !important;
        }
      `}</style>
      {children}
      {alvosRegua.map((alvo, indice) => {
        const quantidade = blocosPorFaixa[indice] ?? 0;
        const espaco =
          quantidade > 160
            ? 0
            : quantidade > 80
              ? 0.02
              : quantidade > 48
                ? 0.05
                : quantidade > 30
                  ? 0.1
                  : quantidade > 18
                    ? 0.2
                    : 0.4;
        return createPortal(
          <div
            key={indice}
            data-grade-espera-adaptativa
            className="grid h-full w-full min-w-0 items-center justify-end overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${Math.max(quantidade, 1)}, minmax(0, 2.2vh))`,
              gap: `${espaco}vw`,
            }}
            title={`${quantidade} conversa${quantidade === 1 ? "" : "s"} nesta faixa`}
          >
            {Array.from({ length: quantidade }, (_, bloco) => (
              <i
                key={bloco}
                aria-hidden="true"
                className={cn(
                  "block aspect-square w-full max-w-[2.2vh] justify-self-end rounded-[clamp(1px,0.4vh,4px)]",
                  coresBlocos[indice],
                )}
              />
            ))}
          </div>,
          alvo,
          String(indice),
        );
      })}
      <section className="fixed bottom-[4.6vh] right-[3.6vw] z-[105] h-[25vh] w-[36vw] border-l border-atd-border bg-atd-bg pl-[2vw] text-atd-ink">
        <div className="flex items-center justify-between">
          <p className="text-[1.35vh] uppercase tracking-[0.22em] text-atd-ink-soft">
            Movimento e tempo de resposta
          </p>
          {atrasado && (
            <b className="rounded-full bg-atd-warn px-[0.55vw] py-[0.2vh] text-[1vh] text-atd-bg">
              Dados atrasados
            </b>
          )}
        </div>
        <div className="mt-[0.7vh] grid h-[21.5vh] grid-cols-2 gap-x-[1.2vw] border-t border-atd-border pt-[0.7vh]">
          {metricas.map(([valor, rotulo, cor = ""]) => (
            <div
              key={rotulo}
              className="flex min-w-0 items-center justify-between gap-[0.7vw] border-b border-atd-border/60 py-[0.25vh]"
            >
              <span className="text-[0.95vh] leading-tight text-atd-ink-soft">{rotulo}</span>
              <b
                className={cn(
                  "shrink-0 text-[1.75vh] font-semibold leading-none tabular-nums",
                  cor,
                )}
              >
                {valor}
              </b>
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
