import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Search, RefreshCw, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClinica } from "@/hooks/use-clinica";
import { listarCentralConversas, pesquisarConversasGeral } from "@/lib/atendimento.functions";
import { normalizarTermoBusca } from "@/lib/busca-texto";
import { AtendInbox } from "./AtendimentoExtraTabs";

type Linha = Awaited<ReturnType<typeof pesquisarConversasGeral>>[number];
type Situacao = "todas" | "abertas" | "encerradas";
const nomesStatus: Record<string, string> = {
  closed: "Encerrada",
  finished: "Encerrada",
  active: "Ativa",
  waiting: "Aguardando",
  bot_attending: "Nina",
};
const rotuloStatus = (status: string) => nomesStatus[status] ?? status;

export function PesquisaConversas() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarCentralConversas);
  const pesquisar = useServerFn(pesquisarConversasGeral);
  const [termo, setTermo] = useState("");
  const [buscado, setBuscado] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const seq = useRef(0);
  const chave = `${clinicaId ?? ""}:${situacao}:${buscado}`;
  const chaveRef = useRef(chave);
  chaveRef.current = chave;

  const carregar = useCallback(
    async (offset = 0) => {
      if (!clinicaId) return;
      const pedido = ++seq.current;
      const contexto = chave;
      setCarregando(true);
      setErro(null);
      try {
        let rows: Linha[];
        let mais = false;
        if (buscado) {
          const resultado = await pesquisar({ data: { clinicaId, termo: buscado } });
          rows = resultado.filter(
            (c) =>
              situacao === "todas" ||
              ["closed", "finished"].includes(c.status ?? "") === (situacao === "encerradas"),
          );
        } else {
          const pagina = await listar({ data: { clinicaId, situacao, offset, limit: 50 } });
          rows = pagina.conversas;
          mais = pagina.temMais;
        }
        if (pedido !== seq.current || contexto !== chaveRef.current) return;
        setLinhas((prev) =>
          offset ? [...prev, ...rows.filter((c) => !prev.some((p) => p.id === c.id))] : rows,
        );
        setTemMais(mais);
      } catch (e) {
        if (pedido !== seq.current || contexto !== chaveRef.current) return;
        setErro(e instanceof Error ? e.message : "Não foi possível carregar as conversas.");
      } finally {
        if (pedido === seq.current) setCarregando(false);
      }
    },
    [clinicaId, situacao, buscado, chave, listar, pesquisar],
  );

  useEffect(() => {
    setLinhas([]);
    setTemMais(false);
    void carregar();
    return () => {
      seq.current++;
    };
  }, [carregar]);
  useEffect(() => {
    setSelecionada(null);
    setTermo("");
    setBuscado("");
  }, [clinicaId]);

  return (
    <div className="oszap-central flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-card px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Central de conversas</h2>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Atualizar lista de conversas"
            disabled={carregando}
            onClick={() => void carregar()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = normalizarTermoBusca(termo);
            if (t === buscado) void carregar();
            else setBuscado(t);
          }}
        >
          <div className="relative min-w-0 flex-1 basis-48">
            <Search
              className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome, telefone, número, protocolo ou mensagem…"
              aria-label="Pesquisar na central de conversas"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <select
            aria-label="Situação das conversas"
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as Situacao)}
          >
            <option value="todas">Todas</option>
            <option value="abertas">Ativas / abertas</option>
            <option value="encerradas">Encerradas</option>
          </select>
          <Button type="submit" size="sm" disabled={carregando}>
            Buscar
          </Button>
          {buscado && (
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setTermo("");
                setBuscado("");
              }}
            >
              Limpar busca
            </Button>
          )}
        </form>
      </div>
      <div
        className="oszap-central-body flex min-h-0 flex-1 overflow-hidden"
        data-selected={!!selecionada}
      >
        <aside
          className="oszap-central-list flex w-80 shrink-0 flex-col overflow-hidden border-r bg-card"
          aria-label="Todas as conversas"
        >
          <div className="min-h-0 flex-1 overflow-auto">
            {erro && (
              <p role="alert" className="p-3 text-sm text-destructive">
                {erro}
              </p>
            )}
            {!carregando && !erro && !linhas.length && (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
            )}
            {linhas.map((c) => (
              <button
                key={c.id}
                data-conversa-id={c.id}
                type="button"
                aria-current={selecionada === c.id ? "true" : undefined}
                onClick={() => setSelecionada(c.id)}
                className={`block w-full border-b px-3 py-2 text-left hover:bg-muted ${selecionada === c.id ? "bg-atd-blue-soft" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {c.contato_nome || c.whatsapp_profile_name || c.contato_telefone || "Sem nome"}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {rotuloStatus(c.status)}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {c.numero_conversa ? `#${c.numero_conversa} · ` : ""}
                  {c.contato_telefone}
                  {c.protocolo_atendimento ? ` · ${c.protocolo_atendimento}` : ""}
                </p>
                {c.trecho && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {c.trecho.replace(/\*/g, "")}
                  </p>
                )}
                {c.ultima_msg_em && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(c.ultima_msg_em).toLocaleString("pt-BR")}
                  </p>
                )}
              </button>
            ))}
            {carregando && (
              <p role="status" className="p-3 text-xs text-muted-foreground">
                Carregando conversas…
              </p>
            )}
            {temMais && (
              <Button
                variant="ghost"
                className="w-full"
                disabled={carregando}
                onClick={() => void carregar(linhas.length)}
              >
                Carregar mais conversas
              </Button>
            )}
            {buscado && linhas.length >= 150 && (
              <p className="p-3 text-xs text-muted-foreground">
                A busca mostra até 150 resultados. Refine o termo para localizar outras conversas.
              </p>
            )}
          </div>
        </aside>
        <section
          className="oszap-central-chat flex min-w-0 flex-1 flex-col overflow-hidden"
          aria-label="Conversa selecionada"
        >
          {selecionada ? (
            <>
              <button
                className="oszap-central-back items-center gap-2 border-b px-3 py-2 text-xs font-medium"
                onClick={() => setSelecionada(null)}
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar à lista
              </button>
              <div className="min-h-0 flex-1">
                <AtendInbox
                  modoCentral
                  conversaIdExterna={selecionada}
                  onSelecionarConversa={setSelecionada}
                />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <MessageSquare className="h-8 w-8" aria-hidden />
              <p>Selecione uma conversa para abrir aqui.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
