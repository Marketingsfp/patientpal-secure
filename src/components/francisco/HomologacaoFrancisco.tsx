import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SemCaixaAlta } from "@/components/ui/caixa-alta";
import { NinaMessage } from "@/components/nina/NinaMessage";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { formatarDataHoraMensagem } from "@/lib/atendimento/data-hora";
import { bloquearLinksRecebidos } from "@/lib/atendimento/links-entrada";
import type { FranciscoConfig } from "@/lib/francisco/config";
import {
  aplicarAcaoTesteFrancisco,
  iniciarTesteFrancisco,
  type SessaoTesteFrancisco,
  type AcaoTesteFrancisco,
} from "@/lib/francisco/homologacao";
import {
  listarConversasTesteFrancisco,
  carregarConversaTesteFrancisco,
  iniciarConversaTesteFrancisco,
  responderConversaTesteFrancisco,
} from "@/lib/francisco/homologacao.functions";
import type { CursorFrancisco } from "@/lib/francisco/service.server";

type Resumo = { id: string; em: string; etapa: "d1" | "d4" };
const ESTADOS = {
  aguardando: "Aguardando paciente",
  humano: "Equipe humana",
  recusado: "Contato bloqueado",
  pago: "Pagamento simulado",
};

export function HomologacaoFrancisco({
  clinicaId,
  clinicaNome,
  config,
  podeEditar,
  preview,
}: {
  clinicaId: string;
  clinicaNome: string;
  config: FranciscoConfig;
  podeEditar: boolean;
  preview: boolean;
}) {
  const listar = useServerFn(listarConversasTesteFrancisco);
  const carregar = useServerFn(carregarConversaTesteFrancisco);
  const iniciar = useServerFn(iniciarConversaTesteFrancisco);
  const responder = useServerFn(responderConversaTesteFrancisco);
  const [conversas, setConversas] = useState<Resumo[]>([]);
  const [cursor, setCursor] = useState<CursorFrancisco | null>(null);
  const [sessao, setSessao] = useState<SessaoTesteFrancisco | null>(null);
  const [etapa, setEtapa] = useState<"d1" | "d4">("d1");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState<{ id: string; acao: AcaoTesteFrancisco } | null>(null);
  const trava = useRef(false);
  const sessoesPreview = useRef(new Map<string, SessaoTesteFrancisco>());
  const scroll = useChatScroll({
    conversaId: sessao?.id,
    total: sessao?.mensagens.length ?? 0,
    ultimoId: sessao?.mensagens.at(-1)?.id ?? null,
  });

  async function lista(proximo?: CursorFrancisco) {
    if (preview) return;
    const lote = await listar({ data: { clinicaId, cursor: proximo } });
    setConversas((c) =>
      proximo ? [...c, ...lote.itens.filter((v) => !c.some((r) => r.id === v.id))] : lote.itens,
    );
    setCursor(lote.proximo);
  }
  useEffect(() => {
    let cancelado = false;
    setSessao(null);
    setTexto("");
    setPendente(null);
    setConversas([]);
    setCursor(null);
    setErro("");
    sessoesPreview.current.clear();
    if (preview) return;
    setOcupado(true);
    void listar({ data: { clinicaId } })
      .then(async (lote) => {
        if (cancelado) return;
        setConversas(lote.itens);
        setCursor(lote.proximo);
        if (lote.itens[0]) {
          const conversa = await carregar({ data: { clinicaId, sessaoId: lote.itens[0].id } });
          if (!cancelado) setSessao(conversa);
        }
      })
      .catch((e: unknown) => {
        if (!cancelado)
          setErro(e instanceof Error ? e.message : "Não foi possível carregar os testes.");
      })
      .finally(() => {
        if (!cancelado) setOcupado(false);
      });
    return () => {
      cancelado = true;
    };
  }, [clinicaId, preview, listar, carregar]);

  async function executar(f: () => Promise<void>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await f();
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Não foi possível concluir o teste.";
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function guardar(s: SessaoTesteFrancisco) {
    setSessao(s);
    if (preview) sessoesPreview.current.set(s.id, s);
  }
  async function novo() {
    const id = crypto.randomUUID();
    await executar(async () => {
      const s = preview
        ? iniciarTesteFrancisco(id, new Date().toISOString(), { config, clinicaNome, etapa })
        : await iniciar({ data: { clinicaId, id, config, etapa } });
      guardar(s);
      setTexto("");
      setPendente(null);
      setConversas((c) => [{ id: s.id, em: s.em, etapa }, ...c]);
    });
  }
  async function abrir(id: string) {
    await executar(async () => {
      const s = preview
        ? sessoesPreview.current.get(id)!
        : await carregar({ data: { clinicaId, sessaoId: id } });
      guardar(s);
      setTexto("");
      setPendente(null);
    });
  }
  async function enviar(acao: AcaoTesteFrancisco, id: string = crypto.randomUUID()) {
    if (!sessao) return;
    setPendente({ id, acao });
    await executar(async () => {
      const s = preview
        ? aplicarAcaoTesteFrancisco(sessao, id, new Date().toISOString(), acao)
        : await responder({ data: { clinicaId, sessaoId: sessao.id, id, acao } });
      guardar(s);
      setPendente(null);
      if (acao.tipo === "paciente") setTexto("");
      scroll.irParaFim(true);
    });
  }
  return (
    <section className="space-y-3" aria-label="Conversa de homologação do Francisco">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
        <strong>Conversa de homologação.</strong> O Francisco inicia pelo template. Nenhuma mensagem
        sai para o WhatsApp e nenhum orçamento ou pagamento real é alterado.
        {preview && (
          <p>Prévia local: o histórico permanece apenas enquanto esta aba estiver aberta.</p>
        )}
      </div>
      <div className="grid overflow-hidden rounded-xl border bg-card lg:grid-cols-[260px_1fr]">
        <aside className="space-y-3 border-b p-4 lg:border-r lg:border-b-0">
          <label className="space-y-1 block text-sm">
            <span>Template inicial</span>
            <select
              aria-label="Template inicial"
              value={etapa}
              onChange={(e) => setEtapa(e.target.value as "d1" | "d4")}
              disabled={ocupado}
              className="h-10 w-full rounded-md border bg-background px-3"
            >
              <option value="d1" disabled={!config.d1}>
                D1 · primeiro contato
              </option>
              <option value="d4" disabled={!config.d4}>
                D4 · acompanhamento
              </option>
            </select>
          </label>
          <Button
            className="w-full"
            disabled={ocupado || !podeEditar || !config[etapa]}
            onClick={() => void novo()}
          >
            <Plus className="size-4" />
            Iniciar com template
          </Button>
          <p className="text-xs text-muted-foreground">
            Cada novo teste usa os templates e o destino humano do rascunho atual. Testes anteriores
            preservam sua configuração.
          </p>
          <div
            className="max-h-72 space-y-2 overflow-y-auto lg:max-h-[410px]"
            aria-label="Conversas de teste"
          >
            {conversas.map((c) => (
              <button
                key={c.id}
                onClick={() => void abrir(c.id)}
                disabled={ocupado || !!pendente}
                aria-pressed={sessao?.id === c.id}
                className={`w-full rounded-lg border p-3 text-left text-sm ${sessao?.id === c.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
              >
                <span className="font-medium">Paciente Teste · {c.etapa.toUpperCase()}</span>
                <span className="block text-xs text-muted-foreground">
                  Teste {c.id.slice(0, 8)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatarDataHoraMensagem(c.em)}
                </span>
              </button>
            ))}
            {!conversas.length && (
              <p className="text-sm text-muted-foreground">Inicie uma conversa para testar.</p>
            )}
            {cursor && (
              <Button
                variant="outline"
                disabled={ocupado}
                onClick={() => void executar(() => lista(cursor))}
              >
                Carregar mais 20
              </Button>
            )}
          </div>
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <strong>Paciente Teste</strong>
              <p className="text-xs text-muted-foreground">Número virtual · teste isolado</p>
            </div>
            <Badge variant="secondary">
              {sessao ? ESTADOS[sessao.estado] : "Aguardando template"}
            </Badge>
          </header>
          <div
            ref={scroll.containerRef}
            role="log"
            aria-label="Mensagens do teste"
            aria-live="polite"
            className="h-[440px] space-y-4 overflow-y-auto bg-muted/20 p-4"
          >
            {!sessao && (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                {ocupado ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  "Escolha D1 ou D4 e clique em Iniciar com template. Depois responda como paciente."
                )}
              </div>
            )}
            {sessao?.mensagens.map((m) =>
              m.autor === "sistema" ? (
                <div
                  key={m.id}
                  className="mx-auto max-w-xl rounded-xl border bg-muted px-4 py-2 text-center text-xs text-muted-foreground"
                >
                  {m.texto}
                </div>
              ) : (
                <div
                  key={m.id}
                  className={`flex ${m.autor === "francisco" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl border px-4 py-3 sm:max-w-[80%] ${m.autor === "francisco" ? "border-primary/20 bg-primary/15" : "bg-card"}`}
                  >
                    <NinaMessage
                      content={m.texto}
                      variant={m.autor === "paciente" ? "user" : "assistant"}
                    />
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {m.autor === "francisco"
                        ? "Francisco · template simulado"
                        : "Paciente (teste)"}{" "}
                      · {formatarDataHoraMensagem(m.em)}
                    </p>
                  </div>
                </div>
              ),
            )}
            <div ref={scroll.ancoraRef} />
          </div>
          {!!scroll.novas && (
            <Button variant="ghost" onClick={() => scroll.irParaFim(true)}>
              Ver novas mensagens ({scroll.novas})
            </Button>
          )}
          <div className="space-y-3 border-t p-4">
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
            {pendente && !ocupado && (
              <Button variant="outline" onClick={() => void enviar(pendente.acao, pendente.id)}>
                <RefreshCw className="size-4" />
                Tentar novamente a mesma ação
              </Button>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={
                  ocupado ||
                  !!pendente ||
                  !podeEditar ||
                  !sessao ||
                  sessao.estado !== "aguardando" ||
                  sessao.d4Enviado ||
                  !sessao.inicio.config.d4
                }
                onClick={() => void enviar({ tipo: "d4" })}
              >
                Avançar para D4
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  ocupado || !!pendente || !podeEditar || !sessao || sessao.estado === "pago"
                }
                onClick={() => void enviar({ tipo: "pagamento" })}
              >
                Simular pagamento
              </Button>
            </div>
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (texto.trim() && !ocupado && !pendente && podeEditar && sessao)
                  void enviar({ tipo: "paciente", texto: bloquearLinksRecebidos(texto.trim()) });
              }}
            >
              <SemCaixaAlta>
                <Textarea
                  aria-label="Mensagem do paciente de teste"
                  placeholder="Digite como paciente…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={4000}
                  disabled={!sessao || ocupado || !!pendente || !podeEditar}
                  className="min-h-20 min-w-0 flex-1 resize-none"
                />
              </SemCaixaAlta>
              <Button
                type="submit"
                disabled={!sessao || !texto.trim() || ocupado || !!pendente || !podeEditar}
              >
                {ocupado ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Enviar como paciente
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Qualquer resposta interrompe a sequência e segue para a equipe humana. Teste também
              “SAIR”. O Francisco não responde automaticamente após o encaminhamento.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
