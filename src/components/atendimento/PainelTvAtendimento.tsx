import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Coffee, DoorOpen, Expand } from "lucide-react";
import { useRelogioPausa } from "@/hooks/use-relogio-pausa";
import {
  faixaEsperaDesde,
  LIMITES_ESPERA_ATD,
  type FaixaEsperaAtd,
} from "@/lib/atendimento/espera";
import { formatarTempoPausa } from "@/lib/atendimento/cronometro-pausa";
import { atendenteVisivelNaTv } from "@/lib/atendimento/painel-tv-presenca";
import type { AtendenteTv } from "@/lib/atendimento/painel-tv.server";
import {
  criarDemonstracaoPainelTv,
  type DadosPainelTv,
} from "@/lib/atendimento/painel-tv-demonstracao";
import { cn } from "@/lib/utils";

const COR_FAIXA: Record<FaixaEsperaAtd, string> = {
  normal: "text-atd-ok",
  atencao: "text-atd-warn",
  critico: "text-atd-danger",
};
const FUNDO_FAIXA: Record<FaixaEsperaAtd, string> = {
  normal: "bg-atd-ok",
  atencao: "bg-atd-warn",
  critico: "bg-atd-danger",
};

type Props = {
  dados: DadosPainelTv | null;
  erro?: string | null;
  conectado: boolean;
  clinicaNome: string;
  demonstracao?: boolean;
  onAlternarDemonstracao?: () => void;
};

export function PainelTvDemonstracao({
  onAlternarDemonstracao,
}: Pick<Props, "onAlternarDemonstracao">) {
  const [dados] = useState(() => criarDemonstracaoPainelTv(Date.now()));
  return (
    <PainelTvAtendimentoVisual
      dados={dados}
      conectado={false}
      clinicaNome="Clínica de demonstração"
      demonstracao
      onAlternarDemonstracao={onAlternarDemonstracao}
    />
  );
}

export function PainelTvAtendimentoVisual({
  dados,
  erro,
  conectado,
  clinicaNome,
  demonstracao = false,
  onAlternarDemonstracao,
}: Props) {
  const agora = useRelogioPausa();
  const relogio = agora || Date.now();
  const espera = dados?.espera ?? [];
  const porFaixa = { normal: 0, atencao: 0, critico: 0 } as Record<FaixaEsperaAtd, number>;
  for (const d of espera) porFaixa[faixaEsperaDesde(d, relogio)]++;
  // Mensagem mais antiga ainda sem resposta (só conversas abertas com atendente).
  const maisAntiga = espera.length
    ? espera.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b))
    : null;
  const minAntiga = maisAntiga
    ? Math.max(0, Math.floor((relogio - Date.parse(maisAntiga)) / 60000))
    : null;
  const piorFaixa: FaixaEsperaAtd | null = porFaixa.critico
    ? "critico"
    : porFaixa.atencao
      ? "atencao"
      : espera.length
        ? "normal"
        : null;

  const telaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-atd-bg px-[3.6vw] py-[3.4vh] text-atd-ink">
      <header className="flex h-[6vh] shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-[1.2vw]">
          <Link
            to="/app/nina"
            className="grid h-[4.6vh] w-[4.6vh] shrink-0 place-items-center rounded-xl border border-atd-border text-atd-ink-soft"
            aria-label="Voltar ao OS ZAP"
          >
            <ArrowLeft className="h-[2.4vh] w-[2.4vh]" />
          </Link>
          <span
            className={cn(
              "inline-block h-[1.1vh] w-[1.1vh] shrink-0 rounded-full",
              demonstracao ? "bg-atd-ai" : conectado ? "bg-atd-ok" : "bg-atd-warn",
            )}
          />
          <span className="shrink-0 text-[1.7vh] font-bold tracking-[0.26em]">OS ZAP</span>
          <span className="truncate text-[1.5vh] uppercase tracking-[0.24em] text-atd-ink-soft">
            {clinicaNome} · WhatsApp
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-[1.6vw]">
          <span className="text-[1.5vh] font-bold uppercase tracking-[0.24em] text-atd-ink-soft">
            {demonstracao
              ? "Demonstração · dados fictícios"
              : conectado
                ? "Ao vivo"
                : "Reconectando…"}
          </span>
          {onAlternarDemonstracao && (
            <button
              type="button"
              onClick={onAlternarDemonstracao}
              className="rounded-xl border border-atd-border px-[1vw] py-[0.8vh] text-[1.4vh] font-semibold text-atd-ink-soft"
            >
              {demonstracao ? "Voltar aos dados reais" : "Demonstração"}
            </button>
          )}
          <span className="text-[4.6vh] font-semibold tabular-nums leading-none">
            {new Date(relogio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            type="button"
            onClick={telaCheia}
            className="grid h-[4.6vh] w-[4.6vh] place-items-center rounded-xl border border-atd-border text-atd-ink-soft"
            aria-label="Tela cheia"
          >
            <Expand className="h-[2.2vh] w-[2.2vh]" />
          </button>
        </div>
      </header>
      <div className="mt-[2.4vh] h-px shrink-0 bg-atd-border" />

      {erro && !dados ? (
        <div className="grid flex-1 place-items-center text-center text-[3vh] text-atd-danger-ink">
          {erro}
        </div>
      ) : (
        <>
          <section className="mt-[3.6vh] grid h-[44vh] shrink-0 grid-cols-[62fr_38fr] gap-[4.2vw]">
            {/* 1. FILA AGORA */}
            <div className="flex min-h-0 min-w-0 flex-col">
              <Rotulo>Esperando resposta da equipe</Rotulo>
              <div className="flex min-h-0 flex-1 items-start gap-[3vw]">
                <span
                  className={cn(
                    "shrink-0 text-[29vh] font-black leading-[0.82] tabular-nums tracking-tight",
                    piorFaixa ? COR_FAIXA[piorFaixa] : "text-atd-ink-soft",
                  )}
                >
                  {espera.length}
                </span>
                <div className="min-w-0 pt-[3.4vh]">
                  <Rotulo>Mais antiga sem resposta</Rotulo>
                  <p
                    className={cn(
                      "mt-[1.6vh] truncate text-[14vh] font-black leading-[0.9] tabular-nums tracking-tight",
                      minAntiga == null
                        ? "text-atd-ink-soft"
                        : COR_FAIXA[faixaEsperaDesde(maisAntiga, relogio)],
                    )}
                  >
                    {minAntiga == null ? "—" : duracao(minAntiga)}
                  </p>
                  {maisAntiga && (
                    <p className="mt-[1.8vh] text-[1.8vh] tabular-nums text-atd-ink-soft">
                      desde {quando(maisAntiga, relogio)}
                    </p>
                  )}
                </div>
              </div>
              <ReguaEspera
                esperas={espera}
                agora={relogio}
                porFaixa={porFaixa}
                semAtendente={dados?.naoAtribuidas ?? 0}
              />
            </div>

            {/* 2. EQUIPE */}
            <Equipe atendentes={dados?.atendentes ?? []} agora={relogio} />
          </section>

          <div className="mt-[3.4vh] h-px shrink-0 bg-atd-border" />

          {/* 3. RITMO DO DIA */}
          <section className="mt-[3.4vh] grid min-h-0 flex-1 grid-cols-[62fr_38fr] gap-[4.2vw]">
            <VolumePorHora
              valores={dados?.volumePorHora ?? []}
              horaAtual={Number(
                new Date(relogio).toLocaleString("en-GB", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  hourCycle: "h23",
                }),
              )}
            />
            <Respostas dados={dados} />
          </section>

          <footer className="mt-[2.2vh] flex shrink-0 justify-between text-[1.3vh] tabular-nums tracking-[0.06em] text-atd-ink-soft">
            <span>
              normal &lt; {LIMITES_ESPERA_ATD.atencao} min · atenção {LIMITES_ESPERA_ATD.atencao}–
              {LIMITES_ESPERA_ATD.critico} min · crítica &gt; {LIMITES_ESPERA_ATD.critico} min
            </span>
            {dados && (
              <span>
                {demonstracao
                  ? "Cenário fictício · sem alterações no atendimento"
                  : `atualizado ${new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR")}`}
              </span>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "shrink-0 text-[1.45vh] uppercase tracking-[0.24em] text-atd-ink-soft",
        className,
      )}
    >
      {children}
    </p>
  );
}

function duracao(min: number): string {
  if (min < 1) return "<1 min";
  const t = Math.round(min);
  if (t < 60) return `${t} min`;
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, "0")}`;
}

/** "14:02" hoje; "sex 02/10 · 16:04" em outro dia. */
function quando(iso: string, agora: number): string {
  const d = new Date(iso);
  const opcoes = { timeZone: "America/Sao_Paulo" } as const;
  const hora = d.toLocaleTimeString("pt-BR", { ...opcoes, hour: "2-digit", minute: "2-digit" });
  const dia = (t: Date) => t.toLocaleDateString("pt-BR", opcoes);
  if (dia(d) === dia(new Date(agora))) return hora;
  const semana = d.toLocaleDateString("pt-BR", { ...opcoes, weekday: "short" }).replace(".", "");
  const data = d.toLocaleDateString("pt-BR", { ...opcoes, day: "2-digit", month: "2-digit" });
  return `${semana} ${data} · ${hora}`;
}

/** Três faixas (5 : 5 : 8) com um quadrado por conversa esperando. */
function ReguaEspera({
  esperas,
  agora,
  porFaixa,
  semAtendente,
}: {
  esperas: string[];
  agora: number;
  porFaixa: Record<FaixaEsperaAtd, number>;
  semAtendente: number;
}) {
  const MAX = 24;
  const faixas: Array<{ id: FaixaEsperaAtd; rotulo: string; peso: number }> = [
    { id: "normal", rotulo: "normal", peso: 5 },
    { id: "atencao", rotulo: "atenção", peso: 5 },
    { id: "critico", rotulo: "crítica", peso: 8 },
  ];
  const lista = (id: FaixaEsperaAtd) => esperas.filter((d) => faixaEsperaDesde(d, agora) === id);
  return (
    <div className="shrink-0">
      <div className="grid gap-[0.4vw]" style={{ gridTemplateColumns: "5fr 5fr 8fr" }}>
        {faixas.map((f, i) => (
          <span key={f.id} className="text-[1.3vh] tabular-nums text-atd-ink-soft">
            {i === 0
              ? "0"
              : i === 1
                ? `${LIMITES_ESPERA_ATD.atencao} min`
                : `${LIMITES_ESPERA_ATD.critico} min`}
          </span>
        ))}
      </div>
      <div className="mt-[0.9vh] grid gap-[0.4vw]" style={{ gridTemplateColumns: "5fr 5fr 8fr" }}>
        {faixas.map((f) => (
          <i
            key={f.id}
            className={cn(
              "block h-[0.45vh] rounded-full",
              FUNDO_FAIXA[f.id],
              porFaixa[f.id] ? "" : "opacity-30",
            )}
          />
        ))}
      </div>
      <div
        className="mt-[1.4vh] grid h-[2.4vh] gap-[0.4vw]"
        style={{ gridTemplateColumns: "5fr 5fr 8fr" }}
      >
        {faixas.map((f) => {
          const n = lista(f.id).length;
          return (
            <div
              key={f.id}
              className="flex min-w-0 items-center justify-end gap-[0.4vw] overflow-hidden"
            >
              {Array.from({ length: Math.min(n, MAX) }, (_, k) => (
                <i
                  key={k}
                  className={cn(
                    "block h-[2.2vh] w-[2.2vh] shrink-0 rounded-[0.4vh]",
                    FUNDO_FAIXA[f.id],
                  )}
                />
              ))}
              {n > MAX && <span className="text-[1.6vh] font-bold tabular-nums">+{n - MAX}</span>}
            </div>
          );
        })}
      </div>
      <div
        className="mt-[1.8vh] grid gap-[0.4vw] text-[1.9vh] tabular-nums text-atd-ink-soft"
        style={{ gridTemplateColumns: "5fr 5fr 8fr" }}
      >
        {faixas.map((f) => (
          <span key={f.id}>
            <b className={cn("mr-[0.6vw] font-bold", porFaixa[f.id] ? COR_FAIXA[f.id] : "")}>
              {porFaixa[f.id]}
            </b>
            {f.rotulo}
            {f.id === "critico" && (
              <>
                {" · "}
                <b className={cn("font-bold", semAtendente ? "text-atd-warn" : "")}>
                  {semAtendente}
                </b>{" "}
                sem atendente
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function Equipe({ atendentes, agora }: { atendentes: AtendenteTv[]; agora: number }) {
  const ordem = (a: AtendenteTv) => (a.estado === "ONLINE" ? 0 : 1);
  const lista = atendentes
    .filter((a) => atendenteVisivelNaTv(a.estado))
    .sort(
      (a, b) =>
        ordem(a) - ordem(b) ||
        b.esperas.length - a.esperas.length ||
        b.atribuidas - a.atribuidas ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  const online = lista.filter((a) => a.estado === "ONLINE").length;
  const pausa = lista.filter((a) => a.estado === "PAUSA" || a.estado === "PAUSA_SAIDA").length;
  // Até 7 linhas no tamanho cheio; acima disso a lista encolhe para caber sem rolagem.
  const denso = lista.length > 7;
  const colunas = "minmax(0,1fr) repeat(4, 5.2vw)";
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-baseline justify-between">
        <Rotulo>Equipe</Rotulo>
        <span
          className="text-[1.8vh] tabular-nums text-atd-ink-soft"
          style={{ wordSpacing: "0.25em" }}
        >
          <b className="font-bold text-atd-ok">{online}</b> online ·{" "}
          <b className={cn("font-bold", pausa ? "text-atd-warn" : "")}>{pausa}</b> em pausa
        </span>
      </div>
      <div
        className="mt-[2.6vh] grid shrink-0 border-b border-atd-border pb-[1.2vh]"
        style={{ gridTemplateColumns: colunas }}
      >
        <span />
        {["Atrib.", "Pend.", "Crít.", "Resolv."].map((t) => (
          <span
            key={t}
            className="text-right text-[1.15vh] uppercase tracking-[0.2em] text-atd-ink-soft"
          >
            {t}
          </span>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="grid flex-1 place-items-center text-[2.2vh] text-atd-ink-soft">
          Ninguém online agora
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {lista.map((a) => {
            const emPausa = a.estado === "PAUSA" || a.estado === "PAUSA_SAIDA";
            const pend = a.esperas.length;
            const crit = a.esperas.filter((d) => faixaEsperaDesde(d, agora) === "critico").length;
            return (
              <li
                key={a.id}
                className="grid min-h-0 flex-1 items-center border-b border-atd-border"
                style={{ gridTemplateColumns: colunas, maxHeight: denso ? undefined : "7.2vh" }}
              >
                <div className="flex min-w-0 items-center gap-[0.9vw]">
                  <i
                    className={cn(
                      "block h-[0.9vh] w-[0.9vh] shrink-0 rounded-full",
                      a.estado === "ONLINE" ? "bg-atd-ok" : "bg-atd-warn",
                    )}
                  />
                  <span
                    className={cn("truncate", denso ? "text-[2vh]" : "text-[2.5vh]")}
                    title={a.nome}
                  >
                    {nomeCurto(a.nome)}
                  </span>
                  {emPausa && (
                    <span
                      className="flex shrink-0 items-center gap-[0.3vw] text-[1.6vh] tabular-nums text-atd-warn-ink"
                      title={a.estado === "PAUSA_SAIDA" ? "Almoço" : "Pausa"}
                    >
                      {a.estado === "PAUSA_SAIDA" ? (
                        <DoorOpen className="h-[1.7vh] w-[1.7vh]" />
                      ) : (
                        <Coffee className="h-[1.7vh] w-[1.7vh]" />
                      )}
                      {a.inicioPausa ? formatarTempoPausa(a.inicioPausa, agora) : ""}
                    </span>
                  )}
                </div>
                <Contador valor={a.atribuidas} denso={denso} />
                <Contador valor={pend} denso={denso} cor={pend ? "text-atd-ink" : undefined} />
                <Contador
                  valor={crit}
                  denso={denso}
                  cor={crit ? "text-atd-danger font-bold" : undefined}
                />
                <Contador
                  valor={a.resolvidasHoje ?? 0}
                  denso={denso}
                  cor={a.resolvidasHoje ? "text-atd-ok" : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "JOAO PEDRO NEVES CANTARELA" → "Joao Pedro"; nomes de duas palavras ficam inteiros. */
function nomeCurto(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .map((p) => p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR"));
  return partes.slice(0, 2).join(" ");
}

function Contador({ valor, denso, cor }: { valor: number; denso: boolean; cor?: string }) {
  return (
    <span
      className={cn(
        "text-right tabular-nums",
        denso ? "text-[2.4vh]" : "text-[3vh]",
        valor ? (cor ?? "text-atd-ink") : "text-atd-ink-soft opacity-40",
      )}
    >
      {valor}
    </span>
  );
}

function VolumePorHora({ valores, horaAtual }: { valores: number[]; horaAtual: number }) {
  const horas = Array.from({ length: 24 }, (_, h) => h);
  const total = horas.reduce((s, h) => s + (valores[h] ?? 0), 0);
  const max = Math.max(1, ...horas.map((h) => valores[h] ?? 0));
  const pico = horas.reduce((m, h) => ((valores[h] ?? 0) > (valores[m] ?? 0) ? h : m), 0);
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <Rotulo>
        Mensagens de pacientes por hora · <b className="font-bold text-atd-ink">hoje</b> · {total}
        {(valores[pico] ?? 0) > 0 && <> · pico às {pico}h</>}
      </Rotulo>
      <div
        className="mt-[2vh] grid min-h-0 flex-1 items-end gap-[0.5vw]"
        style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
      >
        {horas.map((h) => {
          const v = valores[h] ?? 0;
          return (
            <div
              key={h}
              className="flex h-full min-h-0 flex-col justify-end"
              title={`${h}h · ${v}`}
            >
              {v > 0 ? (
                <div
                  className={cn(
                    "w-full rounded-[0.3vh]",
                    h === horaAtual ? "bg-atd-ink" : "bg-atd-ink-soft",
                  )}
                  style={{
                    height: `${(v / max) * 100}%`,
                    minHeight: "1.1vh",
                    // Blocos empilhados: a altura lê como uma pilha de mensagens.
                    WebkitMaskImage:
                      "repeating-linear-gradient(to top, #000 0 1.1vh, transparent 1.1vh 1.4vh)",
                    maskImage:
                      "repeating-linear-gradient(to top, #000 0 1.1vh, transparent 1.1vh 1.4vh)",
                    opacity: h === horaAtual ? 1 : 0.7,
                  }}
                />
              ) : (
                <div className="h-[0.25vh] w-full rounded-full bg-atd-border" />
              )}
            </div>
          );
        })}
      </div>
      <div
        className="mt-[1vh] grid shrink-0 gap-[0.5vw]"
        style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
      >
        {horas.map((h) => (
          <span
            key={h}
            className={cn(
              "text-center text-[1.3vh] tabular-nums",
              h === horaAtual ? "font-bold text-atd-ink" : "text-atd-ink-soft",
            )}
          >
            {String(h).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Distribui 40 marcas entre Nina, automáticas e equipe na proporção real. */
function marcas(valores: number[], total = 40): number[] {
  const soma = valores.reduce((s, v) => s + v, 0);
  if (!soma) return valores.map(() => 0);
  const brutas = valores.map((v) => (v / soma) * total);
  const inteiras = brutas.map((b, i) => (valores[i]! > 0 ? Math.max(1, Math.floor(b)) : 0));
  let falta = total - inteiras.reduce((s, v) => s + v, 0);
  const ordem = brutas.map((b, i) => [b - Math.floor(b), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; falta > 0 && k < ordem.length * 2; k++) {
    const i = ordem[k % ordem.length]![1];
    if (valores[i]! > 0) {
      inteiras[i]!++;
      falta--;
    }
  }
  while (falta < 0) {
    const i = inteiras.indexOf(Math.max(...inteiras));
    inteiras[i]!--;
    falta++;
  }
  return inteiras;
}

function Respostas({ dados }: { dados: DadosPainelTv | null }) {
  const r = dados?.respostas ?? { equipe: 0, nina: 0, automaticas: 0 };
  const total = r.nina + r.automaticas + r.equipe;
  const [mNina, mAuto, mEquipe] = marcas([r.nina, r.automaticas, r.equipe]);
  const cores = [
    ...Array<string>(mNina).fill("bg-atd-ai"),
    ...Array<string>(mAuto).fill("bg-atd-ink-soft opacity-50"),
    ...Array<string>(mEquipe).fill("bg-atd-ok"),
  ];
  const tempo = dados?.tempoMedioRespostaSeg;
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <Rotulo>
        Quem respondeu · <b className="font-bold text-atd-ink">hoje</b> · {total}
      </Rotulo>
      <div
        className="mt-[2.4vh] grid h-[3.6vh] shrink-0 gap-[0.2vw]"
        style={{ gridTemplateColumns: "repeat(40, minmax(0, 1fr))" }}
      >
        {total === 0
          ? Array.from({ length: 40 }, (_, k) => (
              <i key={k} className="block rounded-[0.3vh] bg-atd-border" />
            ))
          : cores.map((c, k) => <i key={k} className={cn("block rounded-[0.3vh]", c)} />)}
      </div>
      <div className="mt-[1.8vh] grid shrink-0 grid-cols-3">
        <Legenda valor={r.nina} rotulo="Nina" cor="text-atd-ai-ink" />
        <Legenda valor={r.automaticas} rotulo="Automático" cor="text-atd-ink-soft" />
        <Legenda valor={r.equipe} rotulo="Equipe" cor="text-atd-ok" />
      </div>
      <div className="mt-auto grid shrink-0 grid-cols-3 border-t border-atd-border pt-[2.2vh]">
        <Grande valor={String(dados?.encaminhadasHoje ?? 0)} rotulo="Passadas à equipe" />
        <Grande valor={String(dados?.resolvidasHoje ?? 0)} rotulo="Resolvidas" />
        <Grande valor={tempo == null ? "—" : duracao(tempo / 60)} rotulo="Resposta da equipe" />
      </div>
    </div>
  );
}

function Legenda({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-[0.7vw]">
      <b className={cn("text-[3vh] font-normal tabular-nums", cor)}>{valor}</b>
      <span className="truncate text-[1.2vh] uppercase tracking-[0.2em] text-atd-ink-soft">
        {rotulo}
      </span>
    </div>
  );
}

function Grande({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="min-w-0">
      <b className="block text-[4.6vh] font-normal leading-none tabular-nums">{valor}</b>
      <span className="mt-[1.2vh] block truncate text-[1.2vh] uppercase tracking-[0.2em] text-atd-ink-soft">
        {rotulo}
      </span>
    </div>
  );
}
