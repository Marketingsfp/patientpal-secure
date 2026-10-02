import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClinica } from "@/hooks/use-clinica";
import { pesquisarConversasGeral } from "@/lib/atendimento.functions";
import { pedirSelecaoConversa } from "@/lib/webmcp/selecao-conversa";
import { normalizarTermoBusca } from "@/lib/busca-texto";

type Linha = Awaited<ReturnType<typeof pesquisarConversasGeral>>[number];

function destacar(texto: string, termo: string) {
  const i = texto.toLowerCase().indexOf(termo.toLowerCase());
  if (i < 0 || !termo) return texto.slice(0, 160);
  const ini = Math.max(0, i - 60);
  const pre = (ini > 0 ? "…" : "") + texto.slice(ini, i);
  return (
    <>
      {pre}
      <mark className="bg-primary/20 text-foreground rounded px-0.5">{texto.slice(i, i + termo.length)}</mark>
      {texto.slice(i + termo.length, i + termo.length + 80)}…
    </>
  );
}

export function PesquisaConversas() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const pesquisar = useServerFn(pesquisarConversasGeral);
  const navigate = useNavigate();
  const [termo, setTermo] = useState("");
  const [buscado, setBuscado] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = async () => {
    const t = normalizarTermoBusca(termo);
    if (!clinicaId || !t) return;
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await pesquisar({ data: { clinicaId, termo: t } }));
      setBuscado(t);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível pesquisar.");
      setLinhas(null);
    } finally {
      setCarregando(false);
    }
  };

  const abrir = (id: string) => {
    // Pede a seleção ANTES de trocar de aba: com a Inbox ainda desmontada o
    // pedido fica guardado e é entregue quando ela monta.
    pedirSelecaoConversa(id);
    void navigate({ to: "/app/nina", hash: "atend-inbox" }).then(() =>
    );
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold">Pesquisar conversas</h2>
        <p className="text-sm text-muted-foreground">
          Busque por id da conversa, número (#1342), protocolo, nome, telefone ou qualquer palavra, letra ou número escrito nas mensagens.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Ex.: #1342, Maria, 21999998888, ultrassom…"
            className="pl-9 h-10"
            aria-label="Termo da pesquisa"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={carregando || !termo.trim()}>
          {carregando ? "Buscando…" : "Buscar"}
        </Button>
      </form>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {linhas && (
        <p className="text-xs text-muted-foreground">
          {linhas.length === 0 ? `Nenhuma conversa encontrada para "${buscado}".` : `${linhas.length} conversa(s) encontrada(s).`}
        </p>
      )}
      <div className="space-y-2">
        {linhas?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => abrir(c.id)}
            className="w-full text-left rounded-lg border bg-card p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex flex-wrap items-center gap-2">
              {c.numero_conversa && <Badge variant="outline">#{c.numero_conversa}</Badge>}
              <span className="font-medium">{c.contato_nome || c.whatsapp_profile_name || "Sem nome"}</span>
              <span className="text-xs text-muted-foreground">{c.contato_telefone}</span>
              <Badge variant="secondary" className="ml-auto">{c.status}</Badge>
              {c.owner_type === "AI" && <Badge variant="secondary">Nina</Badge>}
            </div>
            {c.trecho && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{destacar(c.trecho.replace(/\*/g, ""), buscado)}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {(c.protocolo_atendimento || c.protocol_number) && <>Protocolo {c.protocolo_atendimento || c.protocol_number} · </>}
              {c.ultima_msg_em ? `Última mensagem ${new Date(c.ultima_msg_em).toLocaleString("pt-BR")}` : ""}
              {" · "}id {c.id}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
