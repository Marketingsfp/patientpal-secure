/**
 * Nina → Revisão de Aprendizados (FASE 2).
 *
 * Central administrativa para revisar os erros reportados pelas atendentes.
 * Aprovar/rejeitar aqui NÃO altera o catálogo, a Base de Conhecimentos,
 * embeddings, prompt, modelo, regras ou ferramentas — apenas registra a
 * decisão. A aplicação real virá em fase posterior.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Eye,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  CATEGORIAS_FEEDBACK_NINA,
  rotuloCategoriaFeedback,
} from "@/lib/nina/feedback-erros";
import { ehReporteRapido, rotuloConversaReporte } from "@/lib/nina/erro-rapido";
import { supabase } from "@/integrations/supabase/client";

import {
  editarSugestaoFeedbackNina,
  listarAutoresFeedbackNina,
  listarRevisaoFeedbackNina,
  podeRevisarFeedbackNina,
  revisarFeedbackErroNina,
} from "@/lib/nina/feedback-revisao.functions";
import { lerConversaFeedbackNina } from "@/lib/nina/feedback-conversa.functions";
import {
  CAUSAS_RAIZ_NINA,
  PRIORIDADES_NINA,
  rotuloCausaRaiz,
  rotuloPrioridade,
} from "@/lib/nina/feedback-diagnostico";
import {
  consultarBaseFeedbackNina,
  salvarDiagnosticoFeedbackNina,
} from "@/lib/nina/feedback-diagnostico.functions";
import {
  ROTULO_ACAO,
  ROTULO_CAMADA,
  type PlanoCorrecao,
} from "@/lib/nina/feedback-aplicacao";
import {
  aplicarFeedbackNina,
  concluirAcaoFeedbackNina,
  listarAcoesFeedbackNina,
  prepararAplicacaoFeedbackNina,
} from "@/lib/nina/feedback-aplicacao.functions";
import {
  homologarAcaoAprendizadoNina,
  listarVersoesAprendizadoNina,
  reverterVersaoAprendizadoNina,
  testarCorrecaoAprendizadoNina,
} from "@/lib/nina/feedback-versoes.functions";

export const Route = createFileRoute("/_authenticated/app/nina-aprendizado")({
  head: () => ({
    meta: [
      { title: "Nina — Revisão de Aprendizados" },
      {
        name: "description",
        content:
          "Central interna para revisar, aprovar ou rejeitar correções reportadas sobre as respostas da Nina.",
      },
      { property: "og:title", content: "Nina — Revisão de Aprendizados" },
      {
        property: "og:description",
        content: "Revisão interna dos erros reportados nas respostas da Nina.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

type Item = {
  id: string;
  conversa_id: string | null;
  mensagem_id: string | null;
  mensagem_texto: string | null;
  pergunta_texto: string | null;
  categoria: string;
  origem: string | null;
  correcao: string | null;

  correcao_original: string | null;
  observacao: string | null;
  motivo_rejeicao: string | null;
  status: string;
  reportado_por: string;
  revisado_por: string | null;
  revisado_em: string | null;
  created_at: string;
  root_cause: string | null;
  prioridade: string | null;
  knowledge_status: string | null;
  grupo_chave: string | null;
  grupo_titulo: string | null;
};

type Comparacao = {
  knowledge_status: "found" | "not_found" | "conflict";
  base_version: number | null;
  catalogo_atual: string | null;
  correcao_sugerida: string | null;
  causa_sugerida: string;
  prioridade_sugerida: string;
  assunto_sugerido: string;
  snapshot: Record<string, unknown>;
};

const ROTULO_KB: Record<string, string> = {
  found: "Encontrada no catálogo",
  not_found: "Não encontrada no catálogo",
  conflict: "Conflito no catálogo",
};

const ABAS = [
  { valor: "pending", rotulo: "Pendentes" },
  { valor: "under_review", rotulo: "Em revisão" },
  { valor: "approved", rotulo: "Aprovados" },
  { valor: "rejected", rotulo: "Rejeitados" },
  { valor: "applied", rotulo: "Aplicados" },
  { valor: "reverted", rotulo: "Revertidos" },
] as const;

type Preparo = {
  plano: PlanoCorrecao;
  atual: string | null;
  novo: string;
  knowledge_status: string;
  base_version: number | null;
  ja_na_base: boolean;
  status: string;
  acoes: {
    id: string;
    tipo: string;
    camada: string;
    titulo: string;
    instrucao: string;
    status: string;
    created_at: string;
    concluido_em: string | null;
  }[];
};

type AcaoTecnica = {
  id: string;
  feedback_id: string;
  camada: string;
  tipo: string;
  titulo: string;
  instrucao: string;
  valor_atual: string | null;
  valor_novo: string | null;
  status: string;
  homologado?: boolean;
  created_at: string;
};

type VersaoAprendizado = {
  id: string;
  feedback_id: string;
  versao: number;
  item: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  motivo: string | null;
  camada: string;
  tipo: string;
  reportado_por: string | null;
  aprovado_por: string | null;
  aplicado_por: string;
  kb_versao_anterior: number | null;
  kb_versao_nova: number | null;
  teste_status: string;
  teste_em: string | null;
  teste_resposta: string | null;
  status: string;
  revertido_em: string | null;
  motivo_reversao: string | null;
  created_at: string;
};

function fmtData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Pagina() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;

  const [aba, setAba] = useState<string>("pending");
  const [categoria, setCategoria] = useState("todas");
  const [autor, setAutor] = useState("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [pessoas, setPessoas] = useState<Record<string, string>>({});
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [conversas, setConversas] = useState<Record<string, number>>({});

  const [autores, setAutores] = useState<{ id: string; nome: string }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [podeRevisar, setPodeRevisar] = useState(false);

  const [rejeitando, setRejeitando] = useState<Item | null>(null);
  const [motivo, setMotivo] = useState("");
  const [editando, setEditando] = useState<Item | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [conversa, setConversa] = useState<{ item: Item; msgs: any[] } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ocorrencias, setOcorrencias] = useState<Record<string, number>>({});
  const [fPrioridade, setFPrioridade] = useState("todas");
  const [fCausa, setFCausa] = useState("todas");
  const [diagnosticando, setDiagnosticando] = useState<Item | null>(null);
  const [comparacao, setComparacao] = useState<Comparacao | null>(null);
  const [consultandoBase, setConsultandoBase] = useState(false);
  const [causaEscolhida, setCausaEscolhida] = useState("");
  const [prioridadeEscolhida, setPrioridadeEscolhida] = useState("");
  const [assunto, setAssunto] = useState("");
  const [aplicando, setAplicando] = useState<Item | null>(null);
  const [preparo, setPreparo] = useState<Preparo | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [reindexar, setReindexar] = useState(false);
  const [obsAplicacao, setObsAplicacao] = useState("");
  const [acoesAbertas, setAcoesAbertas] = useState<AcaoTecnica[]>([]);
  const [historico, setHistorico] = useState<{ item: Item; versoes: VersaoAprendizado[] } | null>(
    null,
  );
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [revertendo, setRevertendo] = useState<VersaoAprendizado | null>(null);
  const [motivoReversao, setMotivoReversao] = useState("");

  const listar = useServerFn(listarRevisaoFeedbackNina);
  const listarAutores = useServerFn(listarAutoresFeedbackNina);
  const checarPermissao = useServerFn(podeRevisarFeedbackNina);
  const revisar = useServerFn(revisarFeedbackErroNina);
  const editar = useServerFn(editarSugestaoFeedbackNina);
  const lerConversa = useServerFn(lerConversaFeedbackNina);
  const consultarBase = useServerFn(consultarBaseFeedbackNina);
  const salvarDiagnostico = useServerFn(salvarDiagnosticoFeedbackNina);
  const prepararAplicacao = useServerFn(prepararAplicacaoFeedbackNina);
  const aplicarCorrecao = useServerFn(aplicarFeedbackNina);
  const concluirAcao = useServerFn(concluirAcaoFeedbackNina);
  const listarAcoes = useServerFn(listarAcoesFeedbackNina);
  const listarVersoes = useServerFn(listarVersoesAprendizadoNina);
  const testarCorrecao = useServerFn(testarCorrecaoAprendizadoNina);
  const reverterVersao = useServerFn(reverterVersaoAprendizadoNina);
  const homologarAcao = useServerFn(homologarAcaoAprendizadoNina);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = await listar({
        data: {
          clinicaId,
          status: aba as any,
          categoria: categoria === "todas" ? null : (categoria as any),
          reportadoPor: autor === "todos" ? null : autor,
          de: de || null,
          ate: ate || null,
          limite: 200,
        },
      });
      setItens((r.itens ?? []) as Item[]);
      setPessoas(r.pessoas ?? {});
      setContagens(r.contagens ?? {});
      setConversas((r as { conversas?: Record<string, number> }).conversas ?? {});
      setOcorrencias((r as { ocorrencias?: Record<string, number> }).ocorrencias ?? {});
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, aba, categoria, autor, de, ate, listar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Tempo real: novos reportes (inclusive o do X vermelho) entram na lista e
  // atualizam os contadores sem recarregar a página. A recarga usa a mesma
  // consulta, então o item nunca aparece duplicado.
  useEffect(() => {
    if (!clinicaId) return;
    const canal = supabase
      .channel(`nina-feedback-erros-${clinicaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nina_feedback_erros",
          filter: `clinica_id=eq.${clinicaId}`,
        },
        () => {
          void carregar();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [clinicaId, carregar]);


  useEffect(() => {
    if (!clinicaId) return;
    void (async () => {
      try {
        const [p, a] = await Promise.all([
          checarPermissao({ data: { clinicaId } }),
          listarAutores({ data: { clinicaId } }),
        ]);
        setPodeRevisar(p.podeRevisar);
        setAutores(a);
      } catch (e) {
        mostrarErro(e);
      }
    })();
  }, [clinicaId, checarPermissao, listarAutores]);

  const acao = async (item: Item, novo: "under_review" | "approved" | "pending") => {
    setSalvando(true);
    try {
      await revisar({ data: { id: item.id, clinicaId: clinicaId!, acao: novo, motivo: null } });
      toast.success(
        novo === "approved"
          ? "Correção validada. Nada foi alterado na Base ainda."
          : "Situação atualizada.",
      );
      await carregar();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarRejeicao = async () => {
    if (!rejeitando) return;
    setSalvando(true);
    try {
      await revisar({
        data: {
          id: rejeitando.id,
          clinicaId: clinicaId!,
          acao: "rejected",
          motivo: motivo.trim() || null,
        },
      });
      toast.success("Registro rejeitado. Nada foi alterado na Base.");
      setRejeitando(null);
      setMotivo("");
      await carregar();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    if (textoEdicao.trim().length < 3) {
      toast.error("Escreva a correção sugerida.");
      return;
    }
    setSalvando(true);
    try {
      await editar({
        data: {
          id: editando.id,
          clinicaId: clinicaId!,
          correcao: textoEdicao.trim(),
          observacao: editando.observacao,
        },
      });
      toast.success("Sugestão atualizada.");
      setEditando(null);
      await carregar();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const abrirConversa = async (item: Item) => {
    if (!item.conversa_id || !clinicaId) {
      toast.error("Este registro não tem conversa vinculada.");
      return;
    }
    try {
      const msgs = await lerConversa({
        data: { clinicaId, conversaId: item.conversa_id },
      });
      setConversa({ item, msgs });
    } catch (e) {
      mostrarErro(e);
    }
  };

  const abrirDiagnostico = async (item: Item) => {
    if (!clinicaId) return;
    setDiagnosticando(item);
    setComparacao(null);
    setCausaEscolhida(item.root_cause ?? "");
    setPrioridadeEscolhida(item.prioridade ?? "");
    setAssunto(item.grupo_titulo ?? "");
    setConsultandoBase(true);
    try {
      const r = (await consultarBase({
        data: { id: item.id, clinicaId },
      })) as unknown as Comparacao;
      setComparacao(r);
      if (!item.root_cause) setCausaEscolhida(r.causa_sugerida);
      if (!item.prioridade) setPrioridadeEscolhida(r.prioridade_sugerida);
      if (!item.grupo_titulo) setAssunto(r.assunto_sugerido);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setConsultandoBase(false);
    }
  };

  const confirmarDiagnostico = async () => {
    if (!diagnosticando || !clinicaId) return;
    if (!causaEscolhida) {
      toast.error("Escolha a causa do erro.");
      return;
    }
    if (assunto.trim().length < 2) {
      toast.error("Informe o assunto para agrupar as ocorrências.");
      return;
    }
    setSalvando(true);
    try {
      const r = await salvarDiagnostico({
        data: {
          id: diagnosticando.id,
          clinicaId,
          rootCause: causaEscolhida as never,
          prioridade: (prioridadeEscolhida || null) as never,
          assunto: assunto.trim(),
          knowledgeStatus: (comparacao?.knowledge_status ?? null) as never,
          snapshot: (comparacao?.snapshot ?? null) as never,
        },
      });
      toast.success(
        `Diagnóstico salvo (${r.ocorrencias} ocorrência${r.ocorrencias > 1 ? "s" : ""}). Nada foi alterado no catálogo.`,
      );
      setDiagnosticando(null);
      await carregar();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const carregarAcoes = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const r = await listarAcoes({ data: { clinicaId, status: "open" } });
      setAcoesAbertas(r as unknown as AcaoTecnica[]);
    } catch {
      /* silencioso: painel auxiliar */
    }
  }, [clinicaId, listarAcoes]);

  useEffect(() => {
    void carregarAcoes();
  }, [carregarAcoes]);

  const abrirAplicacao = async (item: Item) => {
    if (!clinicaId) return;
    setAplicando(item);
    setPreparo(null);
    setConfirmado(false);
    setReindexar(false);
    setObsAplicacao("");
    setPreparando(true);
    try {
      const r = await prepararAplicacao({ data: { id: item.id, clinicaId } });
      setPreparo(r as unknown as Preparo);
    } catch (e) {
      mostrarErro(e);
      setAplicando(null);
    } finally {
      setPreparando(false);
    }
  };

  const confirmarAplicacao = async () => {
    if (!aplicando || !clinicaId || !confirmado) return;
    setSalvando(true);
    try {
      const r = await aplicarCorrecao({
        data: {
          id: aplicando.id,
          clinicaId,
          confirmado: true,
          observacao: obsAplicacao.trim() || null,
          reindexar,
        },
      });
      if (r.aplicado) toast.success("Correção aplicada e verificada na Base.");
      else toast.info(r.pendencia ?? "Ação registrada.");
      setAplicando(null);
      await Promise.all([carregar(), carregarAcoes()]);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const finalizarAcao = async (acaoId: string, resultado: "done" | "canceled") => {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await concluirAcao({ data: { acaoId, clinicaId, resultado, observacao: null } });
      toast.success(
        resultado === "done" ? "Ação concluída. Feedback marcado como aplicado." : "Ação cancelada.",
      );
      await Promise.all([carregar(), carregarAcoes()]);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const abrirHistorico = async (item: Item) => {
    if (!clinicaId) return;
    setHistorico({ item, versoes: [] });
    setCarregandoHistorico(true);
    try {
      const r = await listarVersoes({ data: { clinicaId, feedbackId: item.id } });
      setHistorico({ item, versoes: r as unknown as VersaoAprendizado[] });
    } catch (e) {
      mostrarErro(e);
      setHistorico(null);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const rodarTeste = async (v: VersaoAprendizado) => {
    if (!clinicaId || !historico) return;
    setSalvando(true);
    try {
      const r = await testarCorrecao({ data: { versaoId: v.id, clinicaId } });
      if (r.status === "validado") toast.success(r.mensagem);
      else if (r.status === "falhou") toast.warning(r.mensagem);
      else toast.info(r.mensagem);
      await abrirHistorico(historico.item);
      await carregar();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarReversao = async () => {
    if (!clinicaId || !revertendo || motivoReversao.trim().length < 3) return;
    setSalvando(true);
    try {
      const r = await reverterVersao({
        data: {
          versaoId: revertendo.id,
          clinicaId,
          motivo: motivoReversao.trim(),
          confirmado: true,
        },
      });
      toast.success(r.detalheBase ?? "Alteração revertida.");
      setRevertendo(null);
      setMotivoReversao("");
      if (historico) await abrirHistorico(historico.item);
      await Promise.all([carregar(), carregarAcoes()]);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const homologar = async (acaoId: string) => {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await homologarAcao({ data: { acaoId, clinicaId, observacao: null } });
      toast.success("Mudança marcada como homologada.");
      await carregarAcoes();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  const itensFiltrados = useMemo(
    () =>
      itens.filter(
        (i) =>
          (fPrioridade === "todas" || i.prioridade === fPrioridade) &&
          (fCausa === "todas" || i.root_cause === fCausa),
      ),
    [itens, fPrioridade, fCausa],
  );

  const cabecalho = useMemo(
    () => ABAS.map((a) => ({ ...a, total: contagens[a.valor] ?? 0 })),
    [contagens],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Nina — Revisão de Aprendizados</h1>
          <p className="text-sm text-muted-foreground">
            Revisão dos erros reportados pela equipe. Aprovar ou rejeitar aqui{" "}
            <strong>não altera</strong> a Base de Conhecimentos — a aplicação real virá depois.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeRevisar ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Pode revisar
            </Badge>
          ) : (
            <Badge variant="outline">Somente leitura</Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => void carregar()}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" /> Atualizar
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label htmlFor="f-cat">Tipo de erro</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger id="f-cat" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos</SelectItem>
                {CATEGORIAS_FEEDBACK_NINA.map((c) => (
                  <SelectItem key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-autor">Reportado por</Label>
            <Select value={autor} onValueChange={setAutor}>
              <SelectTrigger id="f-autor" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {autores.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-prio">Prioridade</Label>
            <Select value={fPrioridade} onValueChange={setFPrioridade}>
              <SelectTrigger id="f-prio" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {PRIORIDADES_NINA.map((p) => (
                  <SelectItem key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-causa">Causa</Label>
            <Select value={fCausa} onValueChange={setFCausa}>
              <SelectTrigger id="f-causa" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {CAUSAS_RAIZ_NINA.map((c) => (
                  <SelectItem key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-de">De</Label>
            <Input
              id="f-de"
              type="date"
              className="mt-1"
              value={de}
              onChange={(e) => setDe(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="f-ate">Até</Label>
            <Input
              id="f-ate"
              type="date"
              className="mt-1"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          {cabecalho.map((a) => (
            <TabsTrigger key={a.valor} value={a.valor}>
              {a.rotulo} ({a.total})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {carregando ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…
        </div>
      ) : itensFiltrados.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">Nenhum registro nesta aba.</p>
      ) : (
        <ul className="space-y-3">
          {itensFiltrados.map((it) => (
            <li key={it.id}>
              <Card>
                <CardContent className="space-y-3 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      {rotuloCategoriaFeedback(it.categoria)}
                    </Badge>
                    {it.prioridade && (
                      <Badge
                        variant={it.prioridade === "critico" ? "destructive" : "secondary"}
                        className={it.prioridade === "alto" ? "border-amber-500 text-amber-700 dark:text-amber-400" : ""}
                      >
                        Prioridade: {rotuloPrioridade(it.prioridade)}
                      </Badge>
                    )}
                    {it.root_cause && (
                      <Badge variant="outline">Causa: {rotuloCausaRaiz(it.root_cause)}</Badge>
                    )}
                    {it.knowledge_status && (
                      <Badge variant="outline">
                        Base: {ROTULO_KB[it.knowledge_status] ?? it.knowledge_status}
                      </Badge>
                    )}
                    {it.grupo_chave && (ocorrencias[it.grupo_chave] ?? 1) > 1 && (
                      <Badge variant="secondary">
                        {it.grupo_titulo ?? "Problema"} — {ocorrencias[it.grupo_chave]} ocorrências
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {fmtData(it.created_at)} · reportado por{" "}
                      {pessoas[it.reportado_por] ?? "—"}
                      {it.revisado_por
                        ? ` · revisado por ${pessoas[it.revisado_por] ?? "—"}`
                        : ""}
                    </span>
                  </div>

                  {ehReporteRapido(it.origem) && (
                    <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                        Erro reportado da Nina
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Conversa: {rotuloConversaReporte(it.conversa_id, conversas[it.conversa_id ?? ""])}
                      </p>
                      <div>
                        <Label className="text-xs text-muted-foreground">Mensagem reportada</Label>
                        <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-xs">
                          {it.mensagem_texto ?? "—"}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Reportado por: {pessoas[it.reportado_por] ?? "—"} · Data do reporte:{" "}
                        {fmtData(it.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Status: {it.status === "pending" ? "Pendente de revisão" : it.status}
                      </p>
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Pergunta do paciente
                      </Label>
                      <div className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
                        {it.pergunta_texto?.trim() || "—"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Resposta da Nina</Label>
                      <div className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
                        {it.mensagem_texto?.trim() || "—"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Correção sugerida</Label>
                    <div className="mt-1 whitespace-pre-wrap rounded-md border border-border p-2 text-xs">
                      {it.correcao?.trim() || "— (a preencher na revisão)"}
                    </div>
                  </div>

                  {it.observacao && (
                    <p className="text-xs text-muted-foreground">
                      Observação interna: {it.observacao}
                    </p>
                  )}
                  {it.motivo_rejeicao && (
                    <p className="text-xs text-muted-foreground">
                      Motivo da rejeição: {it.motivo_rejeicao}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void abrirConversa(it)}
                      disabled={!it.conversa_id}
                    >
                      <Eye className="mr-1 h-4 w-4" aria-hidden="true" /> Ver conversa
                    </Button>
                    {podeRevisar && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void abrirDiagnostico(it)}
                        >
                          <Stethoscope className="mr-1 h-4 w-4" aria-hidden="true" />{" "}
                          {it.root_cause ? "Rever diagnóstico" : "Diagnosticar causa"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditando(it);
                            setTextoEdicao(it.correcao ?? "");
                          }}
                        >
                          <Pencil className="mr-1 h-4 w-4" aria-hidden="true" /> Editar sugestão
                        </Button>
                        {it.status !== "under_review" && it.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={salvando}
                            onClick={() => void acao(it, "under_review")}
                          >
                            Colocar em revisão
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={salvando || it.status === "approved"}
                          onClick={() => void acao(it, "approved")}
                        >
                          <Check className="mr-1 h-4 w-4" aria-hidden="true" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={salvando || it.status === "rejected"}
                          onClick={() => {
                            setRejeitando(it);
                            setMotivo("");
                          }}
                        >
                          <X className="mr-1 h-4 w-4" aria-hidden="true" /> Rejeitar
                        </Button>
                        {it.status === "approved" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={salvando || !it.root_cause}
                            title={
                              it.root_cause
                                ? "Aplicar na camada responsável"
                                : "Diagnostique a causa antes de aplicar"
                            }
                            onClick={() => void abrirAplicacao(it)}
                          >
                            <Wrench className="mr-1 h-4 w-4" aria-hidden="true" /> Aplicar correção
                          </Button>
                        )}
                        {(it.status === "applied" || it.status === "reverted") && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={salvando}
                            onClick={() => void abrirHistorico(it)}
                          >
                            Histórico e reversão
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Ações técnicas em aberto */}
      {podeRevisar && acoesAbertas.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">
              Ações de correção em aberto ({acoesAbertas.length})
            </h2>
            <ul className="space-y-2">
              {acoesAbertas.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {ROTULO_CAMADA[a.camada as keyof typeof ROTULO_CAMADA] ?? a.camada}
                      </Badge>
                      <Badge variant="secondary">
                        {ROTULO_ACAO[a.tipo as keyof typeof ROTULO_ACAO] ?? a.tipo}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{fmtData(a.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{a.titulo}</p>
                    <p className="text-xs text-muted-foreground">{a.instrucao}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.camada !== "catalogo" && !a.homologado && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={salvando}
                        onClick={() => void homologar(a.id)}
                      >
                        Homologar
                      </Button>
                    )}
                    {a.camada !== "catalogo" && a.homologado && (
                      <Badge variant="secondary" className="self-center">
                        Homologada
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      disabled={salvando || (a.camada !== "catalogo" && !a.homologado)}
                      title={
                        a.camada !== "catalogo" && !a.homologado
                          ? "Passe pela homologação antes de concluir"
                          : "Concluir a ação"
                      }
                      onClick={() => void finalizarAcao(a.id, "done")}
                    >
                      Concluir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={salvando}
                      onClick={() => void finalizarAcao(a.id, "canceled")}
                    >
                      Cancelar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Histórico de versões e reversão */}
      <Dialog open={!!historico} onOpenChange={(o) => !o && setHistorico(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico da correção</DialogTitle>
            <DialogDescription>
              Cada alteração guarda valor anterior, valor novo, motivo, quem reportou, quem aprovou,
              quem aplicou e a data. Conhecimento corrigido não garante comportamento corrigido:
              use o teste para conferir.
            </DialogDescription>
          </DialogHeader>
          {carregandoHistorico ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !historico?.versoes.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma versão registrada para este item.</p>
          ) : (
            <ul className="space-y-3">
              {historico.versoes.map((v) => (
                <li key={v.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">v{v.versao}</Badge>
                    <Badge variant="outline">
                      {ROTULO_CAMADA[v.camada as keyof typeof ROTULO_CAMADA] ?? v.camada}
                    </Badge>
                    <Badge variant="secondary">
                      {ROTULO_ACAO[v.tipo as keyof typeof ROTULO_ACAO] ?? v.tipo}
                    </Badge>
                    {v.status === "reverted" ? (
                      <Badge variant="destructive">Revertida</Badge>
                    ) : v.teste_status === "validado" ? (
                      <Badge>✓ Correção validada</Badge>
                    ) : v.teste_status === "falhou" ? (
                      <Badge variant="destructive">⚠ Nina continua respondendo incorretamente</Badge>
                    ) : (
                      <Badge variant="outline">Teste pendente</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{fmtData(v.created_at)}</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs font-medium text-muted-foreground">Valor anterior</p>
                      <p className="whitespace-pre-wrap text-sm">{v.valor_anterior ?? "—"}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs font-medium text-muted-foreground">Valor novo</p>
                      <p className="whitespace-pre-wrap text-sm">{v.valor_novo ?? "—"}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Motivo: {v.motivo ?? "—"} · Reportou: {pessoas[v.reportado_por ?? ""] ?? "—"} ·
                    Aprovou: {pessoas[v.aprovado_por ?? ""] ?? "—"} · Aplicou:{" "}
                    {pessoas[v.aplicado_por] ?? "—"}
                    {v.kb_versao_anterior || v.kb_versao_nova
                      ? ` · Catálogo (registro publicado)`
                      : ""}
                  </p>
                  {v.teste_resposta && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      Resposta encontrada no teste: {v.teste_resposta}
                    </p>
                  )}
                  {v.status === "reverted" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Revertida em {v.revertido_em ? fmtData(v.revertido_em) : "—"} · Motivo:{" "}
                      {v.motivo_reversao ?? "—"}
                    </p>
                  )}
                  {podeRevisar && v.status !== "reverted" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={salvando} onClick={() => void rodarTeste(v)}>
                        Testar novamente
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={salvando}
                        onClick={() => {
                          setRevertendo(v);
                          setMotivoReversao("");
                        }}
                      >
                        Reverter alteração
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Reverter alteração */}
      <Dialog open={!!revertendo} onOpenChange={(o) => !o && setRevertendo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverter alteração</DialogTitle>
            <DialogDescription>
              A versão anterior volta a valer. Quando a correção era de conteúdo oficial, a versão anterior
              do arquivo oficial é reativada e a busca é atualizada (blocos, embeddings, índices e
              cache). O item volta para investigação.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoReversao}
            onChange={(e) => setMotivoReversao(e.target.value)}
            placeholder="Motivo da reversão (obrigatório)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertendo(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={salvando || motivoReversao.trim().length < 3}
              onClick={() => void confirmarReversao()}
            >
              Reverter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aplicar correção */}
      <Dialog open={!!aplicando} onOpenChange={(o) => !o && setAplicando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aplicar a correção aprovada</DialogTitle>
            <DialogDescription>
              A correção é direcionada para a camada responsável pelo erro. Confira{" "}
              <strong>Atual</strong> e <strong>Novo</strong> antes de confirmar.
            </DialogDescription>
          </DialogHeader>

          {preparando || !preparo ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Consultando a Base…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{ROTULO_CAMADA[preparo.plano.camada]}</Badge>
                <Badge variant="secondary">{ROTULO_ACAO[preparo.plano.tipo]}</Badge>
                {preparo.base_version ? (
                  <Badge variant="outline">Base versão {preparo.base_version}</Badge>
                ) : null}
              </div>

              <div>
                <p className="text-sm font-medium">{preparo.plano.titulo}</p>
                <p className="text-xs text-muted-foreground">{preparo.plano.instrucao}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Atual (na Base hoje)</Label>
                  <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
                    {preparo.atual ?? "Nada encontrado na Base para esta pergunta."}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Novo (correção aprovada)</Label>
                  <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
                    {preparo.novo}
                  </div>
                </div>
              </div>

              <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                {preparo.plano.avisos.map((av) => (
                  <li key={av} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{av}</span>
                  </li>
                ))}
                {preparo.plano.exigeEdicaoCatalogo && !preparo.ja_na_base && (
                  <li className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>
                      O catálogo publicado ainda não contém esta informação. Ao confirmar, fica
                      registrada a pendência de corrigir e publicar o registro na Base de
                      Conhecimentos — só depois disso a correção é marcada como aplicada.
                    </span>
                  </li>
                )}
              </ul>

              {preparo.plano.permiteReindexar && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={reindexar}
                    onChange={(e) => setReindexar(e.target.checked)}
                  />
                  Reprocessar a versão ativa (chunks, embeddings, índices e cache) a partir do
                  arquivo oficial.
                </label>
              )}

              <div>
                <Label htmlFor="obs-aplicacao">Observação interna (opcional)</Label>
                <Textarea
                  id="obs-aplicacao"
                  className="mt-1"
                  rows={2}
                  value={obsAplicacao}
                  onChange={(e) => setObsAplicacao(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />
                Confirmo a mudança de <strong>Atual</strong> para <strong>Novo</strong> na camada
                indicada.
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAplicando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={salvando || preparando || !preparo || !confirmado}
              onClick={() => void confirmarAplicacao()}
            >
              Confirmar aplicação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diagnosticar causa */}
      <Dialog open={!!diagnosticando} onOpenChange={(o) => !o && setDiagnosticando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Diagnosticar a causa do erro</DialogTitle>
            <DialogDescription>
              Comparação somente leitura com o catálogo oficial. Salvar o diagnóstico{" "}
              <strong>não altera</strong> o catálogo nem a Base de Conhecimentos.
            </DialogDescription>
          </DialogHeader>

          {consultandoBase ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Consultando a
              catálogo…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Catálogo atual
                    {comparacao?.base_version ? ` (versão ${comparacao.base_version})` : ""}
                  </Label>
                  <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
                    {comparacao?.catalogo_atual ?? "Nada encontrado no catálogo para esta pergunta."}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Correção sugerida</Label>
                  <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border p-2 text-xs">
                    {comparacao?.correcao_sugerida ?? diagnosticando?.correcao ?? "—"}
                  </div>
                </div>
              </div>

              {comparacao && (
                <Badge variant="outline">
                  Situação na Base: {ROTULO_KB[comparacao.knowledge_status] ?? comparacao.knowledge_status}
                </Badge>
              )}

              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                Erro da Nina não é sinônimo de catálogo errado. Se o catálogo já traz a informação
                correta, a causa está na busca, na interpretação, na ferramenta ou no fluxo.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="d-causa">Causa raiz</Label>
                  <Select value={causaEscolhida} onValueChange={setCausaEscolhida}>
                    <SelectTrigger id="d-causa" className="mt-1">
                      <SelectValue placeholder="Escolha a causa" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAUSAS_RAIZ_NINA.map((c) => (
                        <SelectItem key={c.valor} value={c.valor}>
                          {c.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {CAUSAS_RAIZ_NINA.find((c) => c.valor === causaEscolhida)?.descricao ?? ""}
                  </p>
                </div>
                <div>
                  <Label htmlFor="d-prio">Prioridade</Label>
                  <Select value={prioridadeEscolhida} onValueChange={setPrioridadeEscolhida}>
                    <SelectTrigger id="d-prio" className="mt-1">
                      <SelectValue placeholder="Sugerida automaticamente" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES_NINA.map((pr) => (
                        <SelectItem key={pr.valor} value={pr.valor}>
                          {pr.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="d-assunto">Assunto (agrupa ocorrências iguais)</Label>
                <Input
                  id="d-assunto"
                  className="mt-1"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  placeholder="Ex.: Valor da consulta de Cardiologia"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Registros com o mesmo tipo de erro e o mesmo assunto são contados juntos. Nenhum
                  registro individual é apagado.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDiagnosticando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarDiagnostico()} disabled={salvando || consultandoBase}>
              Salvar diagnóstico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejeitar */}
      <Dialog open={!!rejeitando} onOpenChange={(o) => !o && setRejeitando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar correção</DialogTitle>
            <DialogDescription>
              O registro fica marcado como rejeitado. Nada é alterado na Base de Conhecimentos.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="motivo">Motivo (opcional)</Label>
          <Textarea
            id="motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: a informação da Nina estava correta."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejeitando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmarRejeicao()} disabled={salvando}>
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar sugestão */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar correção sugerida</DialogTitle>
            <DialogDescription>
              A sugestão original de quem reportou continua guardada no registro.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={5}
            value={textoEdicao}
            onChange={(e) => setTextoEdicao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarEdicao()} disabled={salvando}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ver conversa */}
      <Dialog open={!!conversa} onOpenChange={(o) => !o && setConversa(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Conversa de origem</DialogTitle>
            <DialogDescription>Somente leitura.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {(conversa?.msgs ?? []).map((m: any) => (
              <div
                key={m.id}
                className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-xs ${
                    m.id === conversa?.item.mensagem_id
                      ? "border-2 border-destructive bg-muted"
                      : m.direction === "out"
                        ? "bg-primary/10"
                        : "bg-muted"
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {m.body || m.transcricao || `[${m.tipo}]`}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {fmtData(m.recebida_em)} {m.enviada_por === "nina" ? "· Nina" : ""}
                  </div>
                </div>
              </div>
            ))}
            {conversa && conversa.msgs.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem mensagens vinculadas.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConversa(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
