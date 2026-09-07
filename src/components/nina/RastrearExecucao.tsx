/**
 * FASE 8 — Rastrear uma mensagem real.
 *
 * Busca paginada e carregamento sob demanda: a tela abre sem nenhum trace
 * carregado; a lista traz só o resumo; o detalhe de uma execução é lido apenas
 * quando alguém escolhe a execução.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  listarExecucoes,
  lerExecucao,
  type ResumoExecucao,
} from "@/lib/nina/arquitetura/execucoes.functions";
import { estadosPorNode } from "@/lib/nina/arquitetura/timeline";
import type { EventoTrace } from "@/lib/nina/arquitetura/tracing";
import { ArquiteturaCanvas } from "./ArquiteturaCanvas";
import { ExecucaoDiagnostico } from "./ExecucaoDiagnostico";
import type { NivelAcesso } from "@/lib/nina/arquitetura/detalhes-ia";

type Props = {
  clinicaId: string | null;
  nivelAcesso: NivelAcesso;
  chavePosicoes: string;
};

const TAMANHO = 20;

export function RastrearExecucao({ clinicaId, nivelAcesso, chavePosicoes }: Props) {
  const buscar = useServerFn(listarExecucoes);
  const ler = useServerFn(lerExecucao);

  const [termo, setTermo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [somenteErros, setSomenteErros] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [itens, setItens] = useState<ResumoExecucao[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [semPermissao, setSemPermissao] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [eventos, setEventos] = useState<EventoTrace[]>([]);

  const busca = useMutation({
    mutationFn: async (p: number) => {
      if (!clinicaId) return null;
      return buscar({
        data: {
          clinicaId,
          pagina: p,
          tamanho: TAMANHO,
          ...(termo.trim() ? { termo: termo.trim() } : {}),
          ...(de ? { de: new Date(de).toISOString() } : {}),
          ...(ate ? { ate: new Date(ate).toISOString() } : {}),
          ...(somenteErros ? { somenteErros: true } : {}),
        },
      });
    },
    onSuccess: (r, p) => {
      if (!r) return;
      if (!r.permitido) {
        setSemPermissao(true);
        setItens([]);
        return;
      }
      setSemPermissao(false);
      setItens(r.itens);
      setTemMais(r.temMais);
      setPagina(p);
    },
  });

  const detalhe = useMutation({
    mutationFn: async (traceId: string) => {
      if (!clinicaId) return null;
      return ler({ data: { clinicaId, traceId } });
    },
    onSuccess: (r, traceId) => {
      if (!r || !r.permitido) return;
      setSelecionada(traceId);
      setEventos(r.eventos as unknown as EventoTrace[]);
    },
  });

  const estados = eventos.length ? estadosPorNode(eventos) : {};

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="rastreio-termo">Conversa, mensagem, trace ou execução</Label>
          <Input
            id="rastreio-termo"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Cole o código da conversa, mensagem ou execução"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rastreio-de">De</Label>
          <Input id="rastreio-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rastreio-ate">Até</Label>
          <Input id="rastreio-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch id="rastreio-erros" checked={somenteErros} onCheckedChange={setSomenteErros} />
          <Label htmlFor="rastreio-erros">Somente execuções com falha</Label>
        </div>
        <Button onClick={() => busca.mutate(0)} disabled={!clinicaId || busca.isPending}>
          {busca.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Buscar execuções
        </Button>
      </div>

      {semPermissao && (
        <p className="text-sm text-muted-foreground">
          Seu perfil não tem acesso ao rastreamento de mensagens.
        </p>
      )}

      {itens.length > 0 && (
        <div className="space-y-2">
          <ul className="divide-y rounded-md border">
            {itens.map((item) => (
              <li key={item.traceId}>
                <button
                  type="button"
                  onClick={() => detalhe.mutate(item.traceId)}
                  className={`flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted ${
                    selecionada === item.traceId ? "bg-muted" : ""
                  }`}
                >
                  <span className="font-mono text-xs">{item.traceId}</span>
                  <span className="text-muted-foreground">
                    {new Date(item.inicio).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </span>
                  <span className="text-muted-foreground">{item.eventos} etapas</span>
                  {item.comErro && <Badge variant="destructive">com falha</Badge>}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina === 0 || busca.isPending}
              onClick={() => busca.mutate(pagina - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!temMais || busca.isPending}
              onClick={() => busca.mutate(pagina + 1)}
            >
              Próxima
            </Button>
            <span className="text-xs text-muted-foreground">Página {pagina + 1}</span>
          </div>
        </div>
      )}

      {detalhe.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando a execução…
        </p>
      )}

      {eventos.length > 0 && (
        <div className="space-y-5">
          <ArquiteturaCanvas
            chavePosicoes={chavePosicoes}
            execucao={estados}
            modoExecucao
            clinicaId={clinicaId}
            nivelAcesso={nivelAcesso}
          />
          <ExecucaoDiagnostico eventos={eventos} />
        </div>
      )}

      {!busca.isPending && !semPermissao && itens.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma execução carregada. Use a busca acima — a tela não carrega traces sozinha.
        </p>
      )}
    </div>
  );
}
