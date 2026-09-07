/**
 * FASE 5 — Biblioteca de cenários automatizados da homologação.
 *
 * A execução em lote distribui os cenários entre os 10 Leads de Teste e roda
 * cada um no mesmo pipeline real da Nina (paciente simulado pelo Terra).
 * Nada aqui fala com o WhatsApp real.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Play, Plus, Square, Trash2, ListChecks, RefreshCw } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  CATEGORIAS,
  ROTULO_CATEGORIA,
  TIPOS_CRITERIO,
  type CategoriaCenario,
  type Criterio,
  type TipoCriterio,
} from "@/lib/nina/cenarios";
import {
  listarCenarios,
  salvarCenario,
  arquivarCenario,
  semearCenariosModelo,
  criarExecucaoCenarios,
  iniciarItemExecucao,
  finalizarItemExecucao,
  pararExecucaoCenarios,
  listarExecucoesCenarios,
  detalheExecucaoCenarios,
} from "@/lib/nina/cenarios.functions";
import {
  proximaMensagemTerra,
  controlarSimulacaoTerra,
} from "@/lib/nina/simulador-terra.functions";
import { enviarMensagemTeste } from "@/lib/nina/teste-console.functions";
import { ROTULO_DESFECHO, type DesfechoCenario } from "@/lib/nina/cenario-desfecho";

type CenarioRow = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: CategoriaCenario;
  objetivo: string;
  precondicoes: string | null;
  criterios: Criterio[];
  max_turnos: number;
  tags: string[];
  status: string;
  versao: number;
  handoff_esperado?: boolean | null;
};

const VAZIO = {
  id: null as string | null,
  nome: "",
  descricao: "",
  categoria: "informacao" as CategoriaCenario,
  objetivo: "",
  precondicoes: "",
  maxTurnos: 6,
  criterios: [] as Criterio[],
  handoffEsperado: null as boolean | null,
};

function corResultado(resultado: string) {
  if (resultado === "aprovado") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (resultado === "reprovado") return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}

export function CenariosTeste() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;

  const listar = useServerFn(listarCenarios);
  const salvar = useServerFn(salvarCenario);
  const arquivar = useServerFn(arquivarCenario);
  const semear = useServerFn(semearCenariosModelo);
  const criarRun = useServerFn(criarExecucaoCenarios);
  const iniciarItem = useServerFn(iniciarItemExecucao);
  const finalizarItem = useServerFn(finalizarItemExecucao);
  const pararRun = useServerFn(pararExecucaoCenarios);
  const listarRuns = useServerFn(listarExecucoesCenarios);
  const detalheRun = useServerFn(detalheExecucaoCenarios);
  const proximaSim = useServerFn(proximaMensagemTerra);
  const controlarSim = useServerFn(controlarSimulacaoTerra);
  const enviar = useServerFn(enviarMensagemTeste);

  const [cenarios, setCenarios] = useState<CenarioRow[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });
  const [editorAberto, setEditorAberto] = useState(false);
  const [execucoes, setExecucoes] = useState<any[]>([]);
  const [runAtual, setRunAtual] = useState<any | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [rodando, setRodando] = useState(false);
  const pararRef = useRef(false);

  const recarregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const [a, b]: any[] = await Promise.all([
        listar({ data: { clinicaId } }),
        listarRuns({ data: { clinicaId } }),
      ]);
      setCenarios((a.cenarios ?? []).filter((c: CenarioRow) => c.status !== "arquivado"));
      setExecucoes(b.execucoes ?? []);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, listar, listarRuns]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const abrirNovo = () => {
    setForm({ ...VAZIO });
    setEditorAberto(true);
  };

  const abrirEdicao = (c: CenarioRow) => {
    setForm({
      id: c.id,
      nome: c.nome,
      descricao: c.descricao ?? "",
      categoria: c.categoria,
      objetivo: c.objetivo,
      precondicoes: c.precondicoes ?? "",
      maxTurnos: c.max_turnos,
      criterios: c.criterios ?? [],
      handoffEsperado: c.handoff_esperado ?? null,
    });
    setEditorAberto(true);
  };

  const salvarForm = async () => {
    if (!clinicaId) return;
    try {
      await salvar({
        data: {
          clinicaId,
          id: form.id,
          nome: form.nome,
          descricao: form.descricao || null,
          categoria: form.categoria,
          objetivo: form.objetivo,
          precondicoes: form.precondicoes || null,
          dadosSinteticos: {},
          persona: {},
          criterios: form.criterios,
          maxTurnos: form.maxTurnos,
          handoffEsperado: form.handoffEsperado,
          tags: [],
          status: "ativo",
        },
      });
      toast.success("Cenário salvo.");
      setEditorAberto(false);
      await recarregar();
    } catch (e) {
      mostrarErro(e);
    }
  };

  /** Roda uma fila de itens de um lead, em série. */
  const rodarFila = useCallback(
    async (fila: any[]) => {
      for (const item of fila) {
        if (pararRef.current) return;
        let erro: string | null = null;
        let houveHandoff = false;
        let turnosUsados = 0;
        try {
          const inicio: any = await iniciarItem({ data: { clinicaId: clinicaId!, itemId: item.id } });
          const maxTurnos = inicio.maxTurnos ?? 6;
          for (let turno = 0; turno < maxTurnos; turno++) {
            if (pararRef.current) break;
            const passo: any = await proximaSim({
              data: { clinicaId: clinicaId!, simulacaoId: inicio.simulacaoId },
            });
            if (passo.encerrada || !passo.mensagem) break;
            const envio: any = await enviar({
              data: {
                clinicaId: clinicaId!,
                leadId: inicio.leadId,
                tipo: "text",
                texto: passo.mensagem,
                chave: `run-${item.id}-${turno}-${Date.now()}`,
              },
            });
            turnosUsados = turno + 1;
            // Handoff encerra o cenário automatizado: não esperamos atendente humana.
            if (envio?.transferida) {
              houveHandoff = true;
              break;
            }
          }
          await controlarSim({
            data: {
              clinicaId: clinicaId!,
              simulacaoId: inicio.simulacaoId,
              acao: "concluir",
              motivo: houveHandoff ? "handoff" : "limite_turnos",
            },
          }).catch(() => {});
        } catch (e: any) {
          erro = String(e?.message ?? e).slice(0, 300);
        }
        try {
          await finalizarItem({
            data: {
              clinicaId: clinicaId!,
              itemId: item.id,
              erroCliente: erro,
              handoffCliente: houveHandoff,
              interrompido: pararRef.current,
              turnosUsados,
            },
          });
        } catch (e) {
          mostrarErro(e);
        }
        await atualizarItens(item.execucao_id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clinicaId],
  );

  const atualizarItens = useCallback(
    async (execucaoId: string) => {
      if (!clinicaId) return;
      try {
        const r: any = await detalheRun({ data: { clinicaId, execucaoId } });
        setRunAtual(r.execucao);
        setItens(r.itens ?? []);
      } catch {
        /* leitura de progresso é best-effort */
      }
    },
    [clinicaId, detalheRun],
  );

  const executar = async () => {
    if (!clinicaId || !selecionados.length) return;
    setRodando(true);
    pararRef.current = false;
    try {
      const r: any = await criarRun({ data: { clinicaId, cenarioIds: selecionados, nome: null } });
      setRunAtual(r.execucao);
      setItens(r.itens ?? []);
      const porLead = new Map<string, any[]>();
      for (const item of r.itens as any[]) {
        const fila = porLead.get(item.lead_id) ?? [];
        fila.push(item);
        porLead.set(item.lead_id, fila);
      }
      // Cada lead roda a sua fila em paralelo com os outros leads.
      await Promise.all([...porLead.values()].map((fila) => rodarFila(fila)));
      await atualizarItens(r.execucao.id);
      await recarregar();
      toast.success("Execução concluída.");
    } catch (e) {
      mostrarErro(e);
    } finally {
      setRodando(false);
    }
  };

  const parar = async () => {
    pararRef.current = true;
    if (clinicaId && runAtual) {
      await pararRun({ data: { clinicaId, execucaoId: runAtual.id } }).catch(() => {});
      await atualizarItens(runAtual.id);
    }
    toast.message("Execução interrompida.");
  };

  const addCriterio = () =>
    setForm((f) => ({ ...f, criterios: [...f.criterios, { tipo: "sem_erro" as TipoCriterio }] }));

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" /> Cenários automatizados
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Testes reutilizáveis distribuídos automaticamente entre os leads de teste.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void recarregar()} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!clinicaId) return;
              try {
                const r: any = await semear({ data: { clinicaId } });
                toast.success(`${r.criados} cenário(s) modelo adicionado(s).`);
                await recarregar();
              } catch (e) {
                mostrarErro(e);
              }
            }}
          >
            Cenários modelo
          </Button>
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="mr-1 h-4 w-4" /> Novo cenário
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border divide-y">
          {cenarios.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum cenário cadastrado ainda. Use “Cenários modelo” para começar.
            </p>
          )}
          {cenarios.map((c) => (
            <div key={c.id} className="flex items-start gap-3 p-3">
              <Checkbox
                checked={selecionados.includes(c.id)}
                onCheckedChange={(v) =>
                  setSelecionados((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))
                }
              />
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => abrirEdicao(c)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{c.nome}</span>
                  <Badge variant="secondary">{ROTULO_CATEGORIA[c.categoria]}</Badge>
                  <span className="text-xs text-muted-foreground">v{c.versao}</span>
                </div>
                <p className="text-xs text-muted-foreground">{c.objetivo}</p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (!clinicaId) return;
                  await arquivar({ data: { clinicaId, id: c.id } });
                  await recarregar();
                }}
                title="Arquivar cenário"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void executar()} disabled={rodando || !selecionados.length}>
            {rodando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
            Executar {selecionados.length || ""} cenário(s)
          </Button>
          {rodando && (
            <Button variant="outline" onClick={() => void parar()}>
              <Square className="mr-1 h-4 w-4" /> Parar
            </Button>
          )}
        </div>

        {runAtual && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{runAtual.nome}</span>
              <span className="text-xs text-muted-foreground">
                {runAtual.aprovados} aprovado(s) · {runAtual.reprovados} reprovado(s) ·{" "}
                {runAtual.inconclusivos} inconclusivo(s)
              </span>
            </div>
            <div className="space-y-1">
              {itens.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">Lead {String(i.lead_indice).padStart(2, "0")}</Badge>
                  <span className="flex-1">{i.cenario_snapshot?.nome ?? "Cenário"}</span>
                  <span className="text-muted-foreground">{i.mensagens} msg</span>
                  {i.ferramentas?.length > 0 && (
                    <span className="text-muted-foreground">{i.ferramentas.join(", ")}</span>
                  )}
                  {i.desfecho && (
                    <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                      {ROTULO_DESFECHO[i.desfecho as DesfechoCenario] ?? i.desfecho}
                    </span>
                  )}
                  <span className={`rounded px-2 py-0.5 ${corResultado(i.resultado)}`}>
                    {i.status === "executando" ? "executando" : i.resultado}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {execucoes.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Execuções recentes</Label>
            {execucoes.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => void atualizarItens(e.id)}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs hover:bg-muted/50"
              >
                <span>{e.nome}</span>
                <span className="text-muted-foreground">
                  {new Date(e.iniciado_em).toLocaleString("pt-BR")} · {e.status} · {e.aprovados}/
                  {e.total}
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={editorAberto} onOpenChange={setEditorAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar cenário" : "Novo cenário"}</DialogTitle>
            <DialogDescription>
              Use apenas dados fictícios. Salvar um cenário existente cria uma nova versão dele.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select
                  value={form.categoria}
                  onValueChange={(v) => setForm({ ...form, categoria: v as CategoriaCenario })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c.valor} value={c.valor}>
                        {c.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Máximo de turnos</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={form.maxTurnos}
                  onChange={(e) => setForm({ ...form, maxTurnos: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Objetivo do paciente</Label>
              <Textarea
                rows={2}
                value={form.objetivo}
                onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Critérios esperados</Label>
                <Button variant="outline" size="sm" onClick={addCriterio}>
                  <Plus className="mr-1 h-3 w-3" /> Critério
                </Button>
              </div>
              {form.criterios.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={c.tipo}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        criterios: f.criterios.map((x, i) =>
                          i === idx ? { ...x, tipo: v as TipoCriterio } : x,
                        ),
                      }))
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_CRITERIO.map((t) => (
                        <SelectItem key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {TIPOS_CRITERIO.find((t) => t.valor === c.tipo)?.precisaValor && (
                    <Input
                      value={c.valor ?? ""}
                      placeholder="texto ou ferramenta"
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          criterios: f.criterios.map((x, i) =>
                            i === idx ? { ...x, valor: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        criterios: f.criterios.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarForm()} disabled={!form.nome || !form.objetivo}>
              Salvar cenário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
