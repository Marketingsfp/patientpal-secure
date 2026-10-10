import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MessageSquare,
  Pause,
  Pin,
  PinOff,
  Play,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FiltrosAtendente } from "./FiltrosAtendente";
import { InboxConversationCard } from "./InboxConversationCard";
import { BadgeEspera, RelogioEsperaProvider } from "./BadgeEspera";
import { SeletorStatusPresenca } from "./SeletorStatusPresenca";
import type { FiltroAtendente } from "@/lib/atendimento/filtros-atendente";
import { tituloConversa } from "@/lib/atendimento/rotulo-conversa";
import { useHoverTolerante } from "@/hooks/use-hover-tolerante";
import {
  abrirConversaSimulada,
  avancarSimulacao,
  conversasDaSimulacao,
  criarSimulacao,
  responderSimulacao,
  resolverSimulacao,
  USUARIO_SIMULADO,
} from "@/lib/atendimento/simulacao-atendimento";

/** Montada no lugar da Inbox: não importa cliente, servidor ou integrações. */
export function SimulacaoAtendimento({
  onEncerrar,
  iniciarAutomaticamente = true,
}: {
  onEncerrar: () => void;
  iniciarAutomaticamente?: boolean;
}) {
  const [estado, setEstado] = useState(() => ({
    ...criarSimulacao(),
    executando: iniciarAutomaticamente,
  }));
  const [quantidade, setQuantidade] = useState(6);
  const [intervalo, setIntervalo] = useState(3000);
  const [filtro, setFiltro] = useState<FiltroAtendente>("ativas");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [fixado, setFixado] = useState(true);
  const { ref: painelRef, dentro: hover } = useHoverTolerante<HTMLDivElement>({ ativo: !fixado });
  const [listaMobile, setListaMobile] = useState(true);
  const fimChat = useRef<HTMLDivElement>(null);
  const sel = estado.conversas.find((c) => c.id === selecionada);
  const linhas = conversasDaSimulacao(estado, filtro);
  const aberto = fixado || hover;
  const totalCards = estado.conversas.length + estado.chegadas.filter((c) => c.nova).length;

  useEffect(() => {
    if (!estado.executando) return;
    const timer = setInterval(() => setEstado((e) => avancarSimulacao(e, 250, Date.now())), 250);
    return () => clearInterval(timer);
  }, [estado.executando]);
  useEffect(() => {
    fimChat.current?.scrollIntoView({ block: "nearest" });
  }, [selecionada, sel?.mensagens.length]);
  useEffect(() => {
    if (sel?.nao_lidas && !listaMobile && document.visibilityState === "visible")
      setEstado((e) => abrirConversaSimulada(e, sel.id));
  }, [sel?.id, sel?.nao_lidas, listaMobile]);

  const iniciar = () => {
    setEstado(criarSimulacao(quantidade, intervalo));
    setSelecionada(null);
    setRascunhos({});
    setFiltro("ativas");
    setListaMobile(true);
  };
  const responder = () => {
    if (!sel) return;
    setEstado((e) => responderSimulacao(e, sel.id, rascunhos[sel.id] ?? "", Date.now()));
    setRascunhos((r) => ({ ...r, [sel.id]: "" }));
  };

  return (
    <RelogioEsperaProvider>
      <section className="flex h-full min-h-0 flex-col" data-testid="simulacao-atendimento">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-atd-warn-bg p-2 text-atd-warn-ink">
          <div className="min-w-0 flex-1 text-xs">
            <strong>SIMULAÇÃO · DADOS FICTÍCIOS</strong>
            <p>Cards e respostas ficam só nesta tela. Encerrar descarta tudo.</p>
          </div>
          <Button size="sm" variant="outline" onClick={onEncerrar}>
            <X className="mr-1 h-4 w-4" />
            Encerrar simulação
          </Button>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-2 text-xs">
          <label>
            Conversas{" "}
            <select
              aria-label="Quantidade de conversas fictícias"
              className="rounded border bg-background p-1"
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
            >
              {[6, 12, 24].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Intervalo{" "}
            <select
              aria-label="Intervalo das chegadas"
              className="rounded border bg-background p-1"
              value={intervalo}
              onChange={(e) => setIntervalo(Number(e.target.value))}
            >
              <option value={1000}>1 segundo</option>
              <option value={3000}>3 segundos</option>
              <option value={5000}>5 segundos</option>
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={iniciar}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Reiniciar simulação
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!estado.chegadas.length}
            onClick={() => setEstado((e) => ({ ...e, executando: !e.executando }))}
          >
            {estado.executando ? (
              <Pause className="mr-1 h-3 w-3" />
            ) : (
              <Play className="mr-1 h-3 w-3" />
            )}
            {estado.executando ? "Pausar chegadas" : "Continuar chegadas"}
          </Button>
          <span role="status">
            {estado.conversas.length}/{totalCards} cards ·{" "}
            {estado.chegadas.length ? "chegadas simuladas" : "ciclo concluído"}
          </span>
        </div>
        <div
          className="oszap-inbox min-h-0 flex-1 overflow-hidden"
          data-mobile-view={listaMobile || !sel ? "lista" : "conversa"}
        >
          <div className="oszap-columns flex h-full min-h-0 gap-2">
            <Card
              className={`oszap-queue flex shrink-0 flex-col overflow-hidden ${aberto ? "w-[300px]" : "w-[52px]"}`}
              ref={painelRef}
            >
              {!aberto && (
                <Button
                  className="oszap-queue-rail h-full"
                  variant="ghost"
                  aria-label="Abrir lista de conversas"
                  onClick={() => setFixado(true)}
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
              )}
              <div
                className={`oszap-queue-content ${aberto ? "flex" : "hidden"} h-full min-h-0 flex-col`}
              >
                <div className="space-y-3 border-b p-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <SeletorStatusPresenca
                        selecionado={estado.presenca}
                        salvando={null}
                        desabilitado={false}
                        carregando={false}
                        inicioPausa={null}
                        onEscolher={(alvo) =>
                          setEstado((e) => ({
                            ...e,
                            presenca:
                              alvo === "online"
                                ? "ONLINE"
                                : alvo === "offline"
                                  ? "OFFLINE"
                                  : alvo === "pausa_saida"
                                    ? "PAUSA_SAIDA"
                                    : "PAUSA",
                          }))
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={
                        fixado ? "Desafixar lista de conversas" : "Fixar lista de conversas"
                      }
                      onClick={() => setFixado(!fixado)}
                    >
                      {fixado ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Status fictício. Só Online recebe novos cards.
                  </p>
                  <FiltrosAtendente
                    valor={filtro}
                    onChange={setFiltro}
                    contagens={{
                      ativas: conversasDaSimulacao(estado, "ativas").length,
                      pendentes: conversasDaSimulacao(estado, "pendentes").length,
                      fechadas: conversasDaSimulacao(estado, "fechadas").length,
                    }}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="lista-simulada">
                  {!linhas.length && (
                    <p className="p-4 text-sm text-muted-foreground">
                      {estado.conversas.length
                        ? "Nenhuma conversa neste filtro."
                        : "Aguardando cards fictícios…"}
                    </p>
                  )}
                  {linhas.map((c) => (
                    <InboxConversationCard
                      key={c.id}
                      conversa={c}
                      selecionada={sel?.id === c.id}
                      meuId={USUARIO_SIMULADO}
                      simulada
                      nomeUsuario={() => "Você"}
                      esperaDesde={c.esperaDesde}
                      previa={c.mensagens.at(-1)?.body}
                      onClick={() => {
                        setSelecionada(c.id);
                        setListaMobile(false);
                        setEstado((e) => abrirConversaSimulada(e, c.id));
                      }}
                    />
                  ))}
                </div>
              </div>
            </Card>
            <Card className="oszap-chat flex min-w-0 flex-1 flex-col overflow-hidden">
              {!sel ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                  <MessageSquare className="h-8 w-8 text-atd-blue" />
                  <h2 className="text-xl font-semibold">Vamos simular?</h2>
                  <p className="max-w-xs text-sm">
                    Selecione um card para responder, acompanhar as mensagens e resolver o
                    atendimento fictício.
                  </p>
                </div>
              ) : (
                <>
                  <div className="border-b p-3">
                    <Button
                      className="oszap-back"
                      variant="ghost"
                      size="sm"
                      onClick={() => setListaMobile(true)}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Voltar às conversas
                    </Button>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h2
                          className="truncate text-sm font-semibold"
                          data-testid="titulo-conversa"
                        >
                          {tituloConversa(sel)}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {sel.status === "closed" ? "Resolvida" : "Ativa"} · Atendimento fictício
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sel.status === "closed" || estado.presenca === "OFFLINE"}
                        onClick={() => setEstado((e) => resolverSimulacao(e, sel.id, Date.now()))}
                      >
                        Resolver simulação
                      </Button>
                    </div>
                    <BadgeEspera desde={sel.esperaDesde} prefixo="Aguardando resposta há" />
                  </div>
                  <div
                    className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-atd-bg p-4"
                    data-testid="mensagens-simuladas"
                  >
                    {sel.mensagens.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`oszap-bubble max-w-[85%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm ${m.direction === "out" ? "bg-[var(--oszap-out)] text-[var(--oszap-out-ink)]" : "bg-card"}`}
                        >
                          {m.body}
                          <div className="mt-1 text-right text-[10px] text-muted-foreground">
                            {new Date(m.recebida_em).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={fimChat} />
                  </div>
                  <form
                    className="flex shrink-0 items-end gap-2 border-t p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      responder();
                    }}
                  >
                    <Textarea
                      aria-label="Resposta fictícia"
                      placeholder="Digite uma resposta para o paciente fictício…"
                      className="min-h-12 resize-none"
                      disabled={sel.status === "closed" || estado.presenca === "OFFLINE"}
                      value={rascunhos[sel.id] ?? ""}
                      onChange={(e) => setRascunhos((r) => ({ ...r, [sel.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          responder();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      aria-label="Responder na simulação"
                      disabled={
                        sel.status === "closed" ||
                        estado.presenca === "OFFLINE" ||
                        !rascunhos[sel.id]?.trim()
                      }
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </>
              )}
            </Card>
          </div>
        </div>
      </section>
    </RelogioEsperaProvider>
  );
}
