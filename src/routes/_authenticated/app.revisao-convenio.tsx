/**
 * Revisão de convênio — tela de correção assistida.
 *
 * Fecha a segunda metade da correção de 20/08/2026. A primeira metade impediu
 * que atendimento novo nascesse "Particular" indevidamente; esta tela trata o
 * que já estava gravado:
 *
 *   - aba "Atendimentos": 772 atendimentos de 321 pacientes com contrato ativo
 *     e em dia, marcados "Particular";
 *   - aba "Contratos": 245 contratos ativos sem convênio vinculado.
 *
 * Nada é corrigido sozinho. A tela lista, quem revisa escolhe, confirma, e só
 * então grava — e o servidor revalida cada linha antes de aceitar.
 *
 * Titulares com mensalidade vencida não aparecem aqui de propósito: para eles
 * "Particular" é o resultado certo da regra do cartão. Isso é cobrança, não
 * defeito de dado.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Link2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { confirmDialog } from "@/lib/confirm";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/revisao-convenio")({
  head: () => ({
    meta: [{ title: "Revisão de convênio — ClinicaOS" }],
  }),
  component: RevisaoConvenioPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <p className="text-destructive mb-3">Erro: {String(error)}</p>
      <Button onClick={() => reset()}>Tentar novamente</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

type Atendimento = {
  id: string;
  clinica_id: string;
  paciente_id: string;
  paciente_nome: string;
  inicio: string;
  procedimento: string | null;
  status: string;
  medico_nome: string | null;
  convenio_nome: string;
  contrato_numero: number | null;
  ja_pago: boolean;
};

type ContratoSemConvenio = {
  id: string;
  clinica_id: string;
  numero: number;
  paciente_id: string;
  paciente_nome: string;
  data_inicio: string;
  valor_mensal: number;
  qtd_dependentes: number;
};

type Convenio = { id: string; clinica_id: string; nome: string };

/** Teto por chamada, igual ao que a função do banco aceita. */
const LOTE_MAX = 500;

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtDataCurta = (d: string) => d.split("-").reverse().join("/");

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Data de hoje deslocada em `dias`, no formato "YYYY-MM-DD". */
function dataISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function RevisaoConvenioPage() {
  const { clinicaIds } = useClinica();
  // "Leitura" no módulo mostra as listas; só "Edição" libera gravar.
  const podeAplicar = usePodeEscrever("revisao-convenio");

  // ---------------------------------------------------------------------
  // Aba 1 — atendimentos marcados como Particular
  // ---------------------------------------------------------------------
  // O período começa nos últimos 90 dias em vez de "tudo": remarcar um
  // atendimento antigo muda o relatório de um mês que a clínica talvez já
  // tenha fechado. Quem revisa amplia o período se quiser ir mais para trás.
  const [de, setDe] = useState(dataISO(-90));
  const [ate, setAte] = useState(dataISO(0));
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [carregandoAt, setCarregandoAt] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtroNome, setFiltroNome] = useState("");
  const [aplicando, setAplicando] = useState(false);

  const carregarAtendimentos = useCallback(() => {
    if (clinicaIds.length === 0) return;
    setCarregandoAt(true);
    void supabase
      .rpc("listar_atendimentos_convenio_pendentes", {
        _clinica_ids: clinicaIds,
        _de: de || undefined,
        _ate: ate || undefined,
        _limite: 1000,
      })
      .then(({ data, error }) => {
        setCarregandoAt(false);
        if (error) {
          mostrarErro(error);
          return;
        }
        setAtendimentos((data ?? []) as unknown as Atendimento[]);
        // Seleção antiga não sobrevive a uma nova busca: manter marcações de
        // linhas que saíram da lista aplicaria mudança fora do que se vê.
        setSelecionados(new Set());
      });
  }, [clinicaIds, de, ate]);

  useEffect(() => {
    carregarAtendimentos();
  }, [carregarAtendimentos]);

  const atendimentosFiltrados = useMemo(() => {
    const q = normalizar(filtroNome);
    if (!q) return atendimentos;
    return atendimentos.filter((a) => normalizar(a.paciente_nome ?? "").includes(q));
  }, [atendimentos, filtroNome]);

  const todosVisiveisMarcados =
    atendimentosFiltrados.length > 0 && atendimentosFiltrados.every((a) => selecionados.has(a.id));

  const alternarTodos = () => {
    setSelecionados((prev) => {
      const proximo = new Set(prev);
      if (todosVisiveisMarcados) {
        for (const a of atendimentosFiltrados) proximo.delete(a.id);
      } else {
        for (const a of atendimentosFiltrados) proximo.add(a.id);
      }
      return proximo;
    });
  };

  const alternarUm = (id: string) => {
    setSelecionados((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const aplicar = async () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    if (ids.length > LOTE_MAX) {
      toast.error(`Selecione no máximo ${LOTE_MAX} atendimentos por vez.`);
      return;
    }

    const escolhidos = atendimentos.filter((a) => selecionados.has(a.id));
    const pacientes = new Set(escolhidos.map((a) => a.paciente_id)).size;
    const jaPagos = escolhidos.filter((a) => a.ja_pago).length;

    const ok = await confirmDialog({
      title: "Marcar como Convênio?",
      description: (
        <span>
          {ids.length} atendimento(s) de {pacientes} paciente(s) passarão de <b>Particular</b> para{" "}
          <b>Convênio</b>.
          <br />
          <br />O valor já cobrado <b>não muda</b> — o caixa já aplicava o desconto do cartão. O que
          muda é a classificação e, com ela, os relatórios do período.
          {jaPagos > 0 && (
            <>
              <br />
              <br />
              <b>{jaPagos}</b> deste(s) já {jaPagos === 1 ? "está pago" : "estão pagos"}. Se o mês
              já foi fechado, os números daquele fechamento mudam.
            </>
          )}
        </span>
      ),
      confirmText: "Marcar como Convênio",
      tone: "warning",
    });
    if (!ok) return;

    setAplicando(true);
    const { data, error } = await supabase.rpc("aplicar_tipo_convenio_lote", { _ids: ids });
    setAplicando(false);
    if (error) {
      mostrarErro(error);
      return;
    }

    const r = (data ?? {}) as {
      ok?: boolean;
      mensagem?: string;
      atualizados?: number;
      ignorados?: number;
      sem_acesso?: number;
    };
    if (!r.ok) {
      toast.error(r.mensagem ?? "Não foi possível aplicar.");
      return;
    }

    // O servidor revalida linha a linha, então o resultado pode ser menor que a
    // seleção. Mostrar a diferença evita a impressão de que tudo foi aplicado.
    const partes = [`${r.atualizados ?? 0} atendimento(s) marcados como Convênio`];
    if (r.ignorados) partes.push(`${r.ignorados} ignorado(s) — a regra não confirmou`);
    if (r.sem_acesso) partes.push(`${r.sem_acesso} sem permissão`);
    toast.success(partes.join(" · "));
    carregarAtendimentos();
  };

  // ---------------------------------------------------------------------
  // Aba 2 — contratos ativos sem convênio vinculado
  // ---------------------------------------------------------------------
  const [contratos, setContratos] = useState<ContratoSemConvenio[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [carregandoCt, setCarregandoCt] = useState(false);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [filtroContrato, setFiltroContrato] = useState("");

  const carregarContratos = useCallback(() => {
    if (clinicaIds.length === 0) return;
    setCarregandoCt(true);
    void Promise.all([
      supabase.rpc("listar_contratos_sem_convenio", { _clinica_ids: clinicaIds }),
      supabase
        .from("cb_convenios")
        .select("id, clinica_id, nome")
        .in("clinica_id", clinicaIds)
        .eq("ativo", true)
        .order("nome"),
    ]).then(([lista, convs]) => {
      setCarregandoCt(false);
      if (lista.error) {
        mostrarErro(lista.error);
        return;
      }
      setContratos((lista.data ?? []) as unknown as ContratoSemConvenio[]);
      setConvenios((convs.data ?? []) as Convenio[]);
    });
  }, [clinicaIds]);

  useEffect(() => {
    carregarContratos();
  }, [carregarContratos]);

  const contratosFiltrados = useMemo(() => {
    const q = normalizar(filtroContrato);
    if (!q) return contratos;
    return contratos.filter(
      (c) => normalizar(c.paciente_nome ?? "").includes(q) || String(c.numero).includes(q),
    );
  }, [contratos, filtroContrato]);

  const vincular = async (c: ContratoSemConvenio) => {
    const convenioId = escolha[c.id];
    if (!convenioId) return;
    const conv = convenios.find((v) => v.id === convenioId);

    const ok = await confirmDialog({
      title: "Vincular convênio ao contrato?",
      description: (
        <span>
          Contrato nº {c.numero} — {c.paciente_nome}
          <br />
          Convênio: <b>{conv?.nome ?? "—"}</b>
          <br />
          <br />O convênio define preço e repasse do cartão. Confirme que é o correto: para trocar
          depois, é preciso usar a tela de Contratos.
        </span>
      ),
      confirmText: "Vincular",
    });
    if (!ok) return;

    setSalvandoId(c.id);
    const { data, error } = await supabase.rpc("vincular_convenio_contrato", {
      _contrato_id: c.id,
      _convenio_id: convenioId,
    });
    setSalvandoId(null);
    if (error) {
      mostrarErro(error);
      return;
    }
    const r = (data ?? {}) as { ok?: boolean; codigo?: string; mensagem?: string };
    if (!r.ok) {
      toast.error(r.mensagem ?? `Não foi possível vincular (${r.codigo ?? "erro"}).`);
      return;
    }
    toast.success("Convênio vinculado.");
    carregarContratos();
  };

  // ---------------------------------------------------------------------

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Revisão de convênio</h1>
        <p className="text-sm text-muted-foreground">
          Corrige atendimentos antigos que ficaram marcados como Particular apesar do cartão ativo,
          e contratos que estão sem o convênio vinculado. Nada é alterado sem confirmação.
        </p>
      </header>

      <Tabs defaultValue="atendimentos">
        <TabsList>
          <TabsTrigger value="atendimentos">
            Atendimentos {atendimentos.length > 0 && `(${atendimentos.length})`}
          </TabsTrigger>
          <TabsTrigger value="contratos">
            Contratos sem convênio {contratos.length > 0 && `(${contratos.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Aba 1 ---------------- */}
        <TabsContent value="atendimentos" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Marcados como Particular, mas com cartão em dia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                O valor cobrado destes atendimentos já está correto — o caixa aplica o desconto do
                cartão mesmo quando o atendimento está marcado como Particular. O que se corrige
                aqui é a classificação, que alimenta os relatórios. Pacientes com mensalidade
                vencida além da tolerância não aparecem nesta lista.
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">De</Label>
                  <Input
                    type="date"
                    value={de}
                    onChange={(e) => setDe(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Até</Label>
                  <Input
                    type="date"
                    value={ate}
                    onChange={(e) => setAte(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1 flex-1 min-w-56">
                  <Label className="text-xs">Filtrar por paciente</Label>
                  <Input
                    placeholder="Nome do paciente…"
                    value={filtroNome}
                    onChange={(e) => setFiltroNome(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={carregarAtendimentos} disabled={carregandoAt}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${carregandoAt ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                <Checkbox
                  checked={todosVisiveisMarcados}
                  onCheckedChange={alternarTodos}
                  disabled={atendimentosFiltrados.length === 0}
                  aria-label="Selecionar todos"
                />
                <span className="text-sm">
                  {selecionados.size > 0
                    ? `${selecionados.size} selecionado(s)`
                    : "Selecionar todos os visíveis"}
                </span>
                <div className="flex-1" />
                {selecionados.size > LOTE_MAX && (
                  <span className="text-xs text-amber-700 dark:text-amber-500 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Máximo de {LOTE_MAX} por vez
                  </span>
                )}
                <Button
                  onClick={aplicar}
                  disabled={
                    !podeAplicar ||
                    aplicando ||
                    selecionados.size === 0 ||
                    selecionados.size > LOTE_MAX
                  }
                >
                  <Check className="h-4 w-4 mr-2" />
                  {aplicando ? "Aplicando…" : "Marcar como Convênio"}
                </Button>
              </div>

              {!podeAplicar && (
                <p className="text-xs text-muted-foreground">
                  Seu perfil pode consultar esta lista, mas não aplicar as correções.
                </p>
              )}

              <div className="border rounded-md divide-y">
                {carregandoAt && (
                  <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                )}
                {!carregandoAt && atendimentosFiltrados.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    Nenhum atendimento para corrigir neste período.
                  </div>
                )}
                {atendimentosFiltrados.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selecionados.has(a.id)}
                      onCheckedChange={() => alternarUm(a.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{a.paciente_nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtData(a.inicio)}
                        {a.procedimento ? ` · ${a.procedimento}` : ""}
                        {a.medico_nome ? ` · ${a.medico_nome}` : ""}
                      </div>
                      <div className="text-xs mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {a.convenio_nome}
                          {a.contrato_numero ? ` · contrato nº ${a.contrato_numero}` : ""}
                        </span>
                        <span className="text-muted-foreground">· {a.status}</span>
                        {a.ja_pago && <span className="text-muted-foreground">· já pago</span>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Aba 2 ---------------- */}
        <TabsContent value="contratos" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Contratos ativos sem convênio vinculado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Estes contratos valem normalmente — o paciente é atendido como convênio. Falta
                apenas registrar de qual convênio ele é, o que define preço e repasse do cartão.
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 flex-1 min-w-56">
                  <Label className="text-xs">Filtrar por paciente ou nº do contrato</Label>
                  <Input
                    placeholder="Nome ou número…"
                    value={filtroContrato}
                    onChange={(e) => setFiltroContrato(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={carregarContratos} disabled={carregandoCt}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${carregandoCt ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>

              <div className="border rounded-md divide-y">
                {carregandoCt && (
                  <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                )}
                {!carregandoCt && contratosFiltrados.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    Nenhum contrato pendente de vínculo.
                  </div>
                )}
                {contratosFiltrados.map((c) => {
                  // Só convênios da mesma clínica do contrato: um convênio de
                  // outra unidade produziria preço e repasse errados (o banco
                  // também recusa, mas nem deve aparecer na lista).
                  const opcoes = convenios.filter((v) => v.clinica_id === c.clinica_id);
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="flex-1 min-w-56">
                        <div className="font-medium truncate">{c.paciente_nome}</div>
                        <div className="text-xs text-muted-foreground">
                          Contrato nº {c.numero} · desde {fmtDataCurta(c.data_inicio)} ·{" "}
                          {fmtBRL(c.valor_mensal)}/mês
                          {c.qtd_dependentes > 0 && ` · ${c.qtd_dependentes} dependente(s)`}
                        </div>
                      </div>
                      <Select
                        value={escolha[c.id] ?? ""}
                        onValueChange={(v) => setEscolha((prev) => ({ ...prev, [c.id]: v }))}
                        disabled={!podeAplicar || opcoes.length === 0}
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue
                            placeholder={
                              opcoes.length === 0 ? "Sem convênio cadastrado" : "Escolher convênio…"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {opcoes.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() => vincular(c)}
                        disabled={!podeAplicar || !escolha[c.id] || salvandoId === c.id}
                      >
                        {salvandoId === c.id ? "Salvando…" : "Vincular"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
