import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RefreshCw, Loader2, Plus, X, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Mode = "extensao" | "troca_plano";

interface Convenio {
  id: string;
  nome: string;
  valor_mensal: number;
  num_parcelas: number;
  taxa_adesao: number;
  taxa_inclusao_dependente: number;
  max_dependentes: number;
}

interface Faixa {
  id: string;
  convenio_id: string;
  vidas_de: number;
  vidas_ate: number | null;
  valor_mensal: number;
}

interface DepExistente {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string | null;
}

/**
 * Linha da lista de dependentes na renovação. Cobre três casos:
 * - id != null e manter=true  → dependente existente mantido (com edições).
 * - id != null e manter=false → dependente existente removido nesta renovação.
 * - id == null                → dependente novo (paciente + parentesco).
 */
interface DepRow {
  key: string;
  id: string | null;
  paciente_id: string | null;
  paciente_nome: string;
  parentesco: string;
  tipo: string;
  manter: boolean;
  cobrar_taxa_inclusao: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratoId: string;
  clinicaId: string;
  convenioAtualId: string | null;
  convenioAtualNome?: string | null;
  valorAtual: number;
  onRenovado: (result: { tipo: Mode; contratoNovoId?: string | null }) => void;
}

type RenovacaoError = {
  codigo: string;
  titulo: string;
  orientacao: string;
  detalheTecnico: string;
  identificador: string;
};

const normalizarErro = (erro: unknown): RenovacaoError => {
  const mensagem =
    typeof erro === "object" && erro !== null && "message" in erro
      ? String((erro as { message?: unknown }).message ?? "")
      : String(erro ?? "");
  const lower = mensagem.toLowerCase();

  let codigo = "RENOVACAO_ERRO_GERAL";
  let titulo = "Não foi possível concluir a renovação";
  let orientacao = "Revise os dados do convênio, dependentes e valores. Se persistir, informe a identificação abaixo para localizar o erro.";

  if (lower.includes('column "clinica_id"') && lower.includes("contrato_dependentes")) {
    codigo = "RENOVACAO_DEPENDENTE_COLUNA";
    titulo = "Erro ao gravar dependente";
    orientacao = "O sistema tentou salvar um campo que não faz parte do cadastro de dependentes. A renovação não foi concluída para evitar dados parciais.";
  } else if (lower.includes('column "descricao"') && lower.includes("contrato_mensalidades")) {
    codigo = "RENOVACAO_TAXA_DESCRICAO";
    titulo = "Erro ao lançar taxa da renovação";
    orientacao = "A taxa não conseguiu ser registrada na aba de mensalidades. A renovação foi interrompida antes de gerar dados incompletos.";
  } else if (lower.includes("mensalidades") && lower.includes("pagas")) {
    codigo = "RENOVACAO_MENSALIDADES_ABERTAS";
    titulo = "Ainda existem mensalidades em aberto";
    orientacao = "A renovação só é permitida quando todas as parcelas anteriores do contrato estiverem pagas.";
  } else if (lower.includes("sem permissao") || lower.includes("permission") || lower.includes("rls")) {
    codigo = "RENOVACAO_PERMISSAO";
    titulo = "Usuário sem permissão para renovar";
    orientacao = "O usuário atual não tem autorização para renovar contratos desta clínica.";
  } else if (lower.includes("convenio") && lower.includes("invalido")) {
    codigo = "RENOVACAO_CONVENIO_INVALIDO";
    titulo = "Convênio da renovação inválido";
    orientacao = "Selecione novamente o convênio da renovação e confirme se ele está ativo para esta clínica.";
  } else if (lower.includes("contrato nao encontrado")) {
    codigo = "RENOVACAO_CONTRATO_NAO_ENCONTRADO";
    titulo = "Contrato não encontrado";
    orientacao = "Atualize a tela e tente novamente. O contrato pode ter sido alterado por outro usuário.";
  } else if (lower.includes("contrato nao esta ativo") || lower.includes("contrato não está ativo")) {
    codigo = "RENOVACAO_CONTRATO_INATIVO";
    titulo = "Este contrato não pode ser renovado novamente";
    orientacao = "Este contrato já foi renovado, cancelado ou não está ativo. Use o contrato vigente do paciente para novas movimentações.";
  }

  return {
    codigo,
    titulo,
    orientacao,
    detalheTecnico: mensagem || "Sem detalhe técnico retornado pelo backend.",
    identificador: `${codigo}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
  };
};

export function RenovarContratoDialog({
  open,
  onOpenChange,
  contratoId,
  clinicaId,
  convenioAtualId,
  convenioAtualNome,
  valorAtual,
  onRenovado,
}: Props) {
  const [observacao, setObservacao] = useState("");
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [novoConvenioId, setNovoConvenioId] = useState<string>("");
  const [deps, setDeps] = useState<DepRow[]>([]);
  const [cobrarTaxa, setCobrarTaxa] = useState(true);
  const [saving, setSaving] = useState(false);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [faixaId, setFaixaId] = useState<string>("");
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [erroRenovacao, setErroRenovacao] = useState<RenovacaoError | null>(null);

  useEffect(() => {
    if (!open) return;
    setObservacao("");
    setNovoConvenioId(convenioAtualId ?? "");
    setCobrarTaxa(true);
    setConfirmacaoAberta(false);
    setErroRenovacao(null);

    (async () => {
      const [{ data: conv }, { data: depsData }, { data: faixasData }] = await Promise.all([
        supabase
          .from("cb_convenios")
          .select("id, nome, valor_mensal, num_parcelas, taxa_adesao, taxa_inclusao_dependente, max_dependentes")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("contrato_dependentes")
          .select("id, paciente_id, paciente_nome, parentesco, tipo")
          .eq("contrato_id", contratoId)
          .eq("ativo", true)
          .order("paciente_nome"),
        supabase
          .from("cb_convenio_faixas")
          .select("id, convenio_id, vidas_de, vidas_ate, valor_mensal")
          .order("vidas_de"),
      ]);
      setConvenios((conv ?? []) as Convenio[]);
      setFaixas((faixasData ?? []) as Faixa[]);
      const lista = (depsData ?? []) as DepExistente[];
      const rows: DepRow[] = lista.map((d, i) => ({
        key: `exist-${d.id}-${i}`,
        id: d.id,
        paciente_id: d.paciente_id,
        paciente_nome: d.paciente_nome,
        parentesco: d.parentesco ?? "",
        tipo: d.tipo ?? "dependente",
        manter: true,
        cobrar_taxa_inclusao: false,
      }));
      setDeps(rows);
      setFaixaTocada(false);
    })();
  }, [open, clinicaId, convenioAtualId, contratoId]);

  const novoConvenio = convenios.find((c) => c.id === novoConvenioId);
  const mode: Mode =
    novoConvenioId && convenioAtualId && novoConvenioId === convenioAtualId ? "extensao" : "troca_plano";
  const parcelasRenovacao = novoConvenio ? Number(novoConvenio.num_parcelas ?? 12) : 12;
  const taxaAdesaoConvenio = novoConvenio ? Number(novoConvenio.taxa_adesao ?? 0) : 0;
  const taxaInclusaoConvenio = novoConvenio ? Number(novoConvenio.taxa_inclusao_dependente ?? 0) : 0;
  const taxaAdesaoCobrada = mode === "troca_plano" && cobrarTaxa ? taxaAdesaoConvenio : 0;
  const maxDep = novoConvenio ? Number(novoConvenio.max_dependentes ?? 0) : 0;

  const depsAtivos = deps.filter((d) => d.manter && (d.id !== null || d.paciente_id));
  const depsPreenchidosCount = depsAtivos.length;
  const depsIncompletos = deps.some(
    (d) => d.manter && (!d.paciente_id || !d.parentesco),
  );
  const totalPessoas = 1 + depsPreenchidosCount;

  const faixasDoConvenio = useMemo(
    () =>
      faixas
        .filter((f) => f.convenio_id === novoConvenioId)
        .sort((a, b) => a.vidas_de - b.vidas_de),
    [faixas, novoConvenioId],
  );

  const faixaSelecionada = faixasDoConvenio.find((f) => f.id === faixaId) ?? null;
  const valorRenovacao = faixaSelecionada
    ? Number(faixaSelecionada.valor_mensal)
    : novoConvenio
      ? Number(novoConvenio.valor_mensal)
      : 0;

  const labelFaixa = (f: Faixa) => {
    const range =
      f.vidas_ate == null
        ? `${f.vidas_de}+ pessoas`
        : f.vidas_de === f.vidas_ate
          ? `${f.vidas_de} pessoa${f.vidas_de === 1 ? "" : "s"}`
          : `${f.vidas_de}–${f.vidas_ate} pessoas`;
    return `${range} — ${BRL(Number(f.valor_mensal))}`;
  };

  // Ao trocar de convênio, reseta o "toque" para permitir auto-seleção pela quantidade.
  useEffect(() => {
    setFaixaTocada(false);
  }, [novoConvenioId]);

  // Auto-seleciona a faixa correspondente ao total de pessoas.
  // Sempre re-sincroniza quando dependentes são incluídos ou removidos.
  useEffect(() => {
    if (faixasDoConvenio.length === 0) {
      setFaixaId("");
      return;
    }
    const alvo =
      faixasDoConvenio.find(
        (f) =>
          totalPessoas >= f.vidas_de &&
          (f.vidas_ate == null || totalPessoas <= f.vidas_ate),
      ) ?? faixasDoConvenio[faixasDoConvenio.length - 1];
    setFaixaId(alvo.id);
  }, [faixasDoConvenio, totalPessoas]);

  const novosComTaxa = deps.filter(
    (d) => d.id === null && d.paciente_id && d.cobrar_taxa_inclusao,
  );
  const taxaInclusaoTotal = novosComTaxa.length * taxaInclusaoConvenio;
  const dependentesNovos = deps.filter((d) => d.id === null && d.manter && d.paciente_id);
  const dependentesRemovidos = deps.filter((d) => d.id !== null && !d.manter);
  const dependentesMantidos = deps.filter((d) => d.id !== null && d.manter);

  const podeConfirmar =
    !saving &&
    !!novoConvenioId &&
    !depsIncompletos &&
    (faixasDoConvenio.length === 0 || !!faixaId);

  const updateDep = (key: string, patch: Partial<DepRow>) => {
    setDeps((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const addLinhaNova = () => {
    if (maxDep > 0 && depsPreenchidosCount >= maxDep) {
      toast.error(`Limite de ${maxDep} dependentes atingido para este convênio.`);
      return;
    }
    const key = `novo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDeps((prev) => [
      ...prev,
      {
        key,
        id: null,
        paciente_id: null,
        paciente_nome: "",
        parentesco: "",
        tipo: "dependente",
        manter: true,
        cobrar_taxa_inclusao: true,
      },
    ]);
  };

  const removerLinha = (key: string) => {
    setDeps((prev) => {
      const alvo = prev.find((d) => d.key === key);
      if (!alvo) return prev;
      // Novo (sem id): tira da lista. Existente: marca manter=false para
      // preservar o histórico e mandar ao backend.
      if (alvo.id === null) return prev.filter((d) => d.key !== key);
      return prev.map((d) => (d.key === key ? { ...d, manter: false } : d));
    });
  };

  const restaurarLinha = (key: string) => {
    updateDep(key, { manter: true });
  };

  const buildPayloadDeps = () =>
    deps
      .filter((d) => d.id !== null || (d.paciente_id && d.manter))
      .map((d) => ({
        id: d.id,
        paciente_id: d.paciente_id,
        paciente_nome: d.paciente_nome,
        parentesco: d.parentesco || null,
        tipo: d.tipo || "dependente",
        manter: d.manter,
        cobrar_taxa_inclusao: d.id === null ? !!d.cobrar_taxa_inclusao : false,
      }));

  const abrirConfirmacao = () => {
    if (!podeConfirmar) return;
    setErroRenovacao(null);
    setConfirmacaoAberta(true);
  };

  const confirmar = async () => {
    if (!podeConfirmar) return;
    setSaving(true);
    try {
      const payloadDeps = buildPayloadDeps();
      if (mode === "extensao") {
        const { data, error } = await (supabase.rpc as any)("renovar_contrato_extensao", {
          _contrato_id: contratoId,
          _observacao: observacao || null,
          _dependentes: payloadDeps,
          _valor_mensal: faixaSelecionada ? Number(faixaSelecionada.valor_mensal) : null,
        });
        if (error) throw error;
        toast.success(
          `Contrato renovado — ${(data as any)?.parcelas_geradas ?? parcelasRenovacao} novas parcelas geradas`,
        );
        onRenovado({ tipo: "extensao" });
      } else {
        const { data, error } = await (supabase.rpc as any)("renovar_contrato_troca_plano", {
          _contrato_id: contratoId,
          _convenio_novo_id: novoConvenioId,
          _observacao: observacao || null,
          _cobrar_taxa_adesao: cobrarTaxa,
          _dependentes: payloadDeps,
          _valor_mensal: faixaSelecionada ? Number(faixaSelecionada.valor_mensal) : null,
        });
        if (error) throw error;
        toast.success("Novo contrato criado a partir da renovação");
        onRenovado({ tipo: "troca_plano", contratoNovoId: (data as any)?.contrato_novo_id ?? null });
      }
      setConfirmacaoAberta(false);
      onOpenChange(false);
    } catch (e) {
      const erroTratado = normalizarErro(e);
      setErroRenovacao(erroTratado);
      toast.error(erroTratado.titulo);
    } finally {
      setSaving(false);
    }
  };

  const parentescoOptions = useMemo(
    () => ["Filho(a)", "Cônjuge", "Pai", "Mãe", "Irmão(ã)", "Outro"],
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-red-600" />
            Renovar contrato
          </DialogTitle>
          <DialogDescription>
            Todas as mensalidades deste contrato estão pagas. Escolha o convênio da renovação e revise os dependentes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 1. Convênio da renovação */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Convênio da renovação</Label>
              <Select value={novoConvenioId} onValueChange={setNovoConvenioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o convênio" />
                </SelectTrigger>
                <SelectContent>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                      {c.id === convenioAtualId ? " (atual)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {mode === "extensao"
                  ? "Mesmo convênio: estende este contrato sem cobrar taxa de adesão."
                  : "Convênio diferente: cria um novo contrato e cobra a taxa de adesão do convênio escolhido."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nº de pessoas no contrato</Label>
              {faixasDoConvenio.length > 0 ? (
                <>
                  <Select
                    value={faixaId}
                    onValueChange={(v) => setFaixaId(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a faixa…" />
                    </SelectTrigger>
                    <SelectContent>
                      {faixasDoConvenio.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {labelFaixa(f)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Atualiza automaticamente conforme dependentes são incluídos ou removidos.
                    {" "}Contrato atual: <strong>{totalPessoas}</strong> pessoa{totalPessoas === 1 ? "" : "s"}.
                  </p>
                </>
              ) : (
                <>
                  <Input value={`${totalPessoas} pessoa${totalPessoas === 1 ? "" : "s"} — ${BRL(valorRenovacao)}`} readOnly />
                  <p className="text-[11px] text-muted-foreground">
                    Este convênio não possui faixas de preço cadastradas — o valor base é aplicado.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 2. Dependentes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Dependentes</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addLinhaNova}
                className="h-7"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar dependente
              </Button>
            </div>

            {deps.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-2 py-3 rounded-md border border-dashed text-center">
                Nenhum dependente. Clique em "Adicionar dependente" para incluir.
              </p>
            ) : (
              <div className="rounded-md border divide-y">
                {deps.map((d) => (
                  <DepLinha
                    key={d.key}
                    row={d}
                    clinicaId={clinicaId}
                    parentescoOptions={parentescoOptions}
                    taxaInclusaoValor={taxaInclusaoConvenio}
                    onChange={(patch) => updateDep(d.key, patch)}
                    onRemove={() => removerLinha(d.key)}
                    onRestaurar={() => restaurarLinha(d.key)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 3. Taxa de adesão (só troca) */}
          {mode === "troca_plano" && taxaAdesaoConvenio > 0 ? (
            <label className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40">
              <Checkbox
                checked={cobrarTaxa}
                onCheckedChange={(v) => setCobrarTaxa(v === true)}
                className="mt-0.5"
              />
              <span className="flex-1">
                Cobrar taxa de adesão do novo convênio ({BRL(taxaAdesaoConvenio)})
              </span>
            </label>
          ) : null}

          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Convênio anterior</span>
              <span className="font-medium">{convenioAtualNome ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Novo convênio</span>
              <span className="font-medium">{novoConvenio?.nome ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor mensal anterior</span>
              <span className="font-mono">{BRL(valorAtual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor da renovação</span>
              <span className="font-mono font-semibold">{BRL(valorRenovacao)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parcelas a gerar</span>
              <span className="font-mono">{parcelasRenovacao}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxa de adesão</span>
              <span className="font-mono">{BRL(taxaAdesaoCobrada)}</span>
            </div>
            {novosComTaxa.length > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa de inclusão ({novosComTaxa.length}× {BRL(taxaInclusaoConvenio)})</span>
                <span className="font-mono">{BRL(taxaInclusaoTotal)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pessoas no contrato</span>
              <span className="font-mono">{totalPessoas}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Motivo, condições combinadas, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={abrirConfirmacao} disabled={!podeConfirmar} className="bg-red-600 hover:bg-red-700 text-white">
            <RefreshCw className="h-4 w-4 mr-1" />
            Confirmar renovação
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmacaoAberta} onOpenChange={(v) => !saving && setConfirmacaoAberta(v)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Revisar e confirmar renovação
            </AlertDialogTitle>
            <AlertDialogDescription>
              Confira a identificação do contrato, dependentes e movimentos financeiros antes de concluir.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Identificação da renovação
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Tipo</span>
                <span className="font-medium">{mode === "extensao" ? "Renovar contrato atual" : "Criar novo contrato"}</span>
                <span className="text-muted-foreground">Convênio anterior</span>
                <span className="font-medium">{convenioAtualNome ?? "—"}</span>
                <span className="text-muted-foreground">Convênio da renovação</span>
                <span className="font-medium">{novoConvenio?.nome ?? "—"}</span>
                <span className="text-muted-foreground">Pessoas no contrato</span>
                <span className="font-medium">{totalPessoas}</span>
                <span className="text-muted-foreground">Mensalidades</span>
                <span className="font-medium">{parcelasRenovacao} × {BRL(valorRenovacao)}</span>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="font-medium">Dependentes</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <ResumoDependentes titulo="Mantidos" nomes={dependentesMantidos.map((d) => d.paciente_nome)} />
                <ResumoDependentes titulo="Incluídos" nomes={dependentesNovos.map((d) => d.paciente_nome)} destaque="text-emerald-700" />
                <ResumoDependentes titulo="Removidos" nomes={dependentesRemovidos.map((d) => d.paciente_nome)} destaque="text-red-700" />
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-1 text-xs">
              <div className="font-medium text-sm">Movimentos financeiros que serão gerados</div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Mensalidades</span>
                <span className="font-mono">{parcelasRenovacao} × {BRL(valorRenovacao)}</span>
              </div>
              {taxaAdesaoCobrada > 0 ? (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Taxa de adesão</span>
                  <span className="font-mono">{BRL(taxaAdesaoCobrada)}</span>
                </div>
              ) : null}
              {taxaInclusaoTotal > 0 ? (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Taxa de inclusão de dependente</span>
                  <span className="font-mono">{novosComTaxa.length} × {BRL(taxaInclusaoConvenio)} = {BRL(taxaInclusaoTotal)}</span>
                </div>
              ) : null}
            </div>

            {erroRenovacao ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900 space-y-1">
                <div className="font-semibold">{erroRenovacao.titulo}</div>
                <p className="text-xs">{erroRenovacao.orientacao}</p>
                <div className="text-[11px] font-mono bg-white/70 rounded px-2 py-1 break-all">
                  Identificação: {erroRenovacao.identificador}
                  <br />
                  Detalhe: {erroRenovacao.detalheTecnico}
                </div>
              </div>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Voltar e revisar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmar();
              }}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Confirmar renovação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function ResumoDependentes({
  titulo,
  nomes,
  destaque = "text-foreground",
}: {
  titulo: string;
  nomes: string[];
  destaque?: string;
}) {
  return (
    <div className="rounded-md bg-muted/30 p-2 min-h-16">
      <div className="font-medium text-muted-foreground">{titulo} ({nomes.length})</div>
      {nomes.length > 0 ? (
        <ul className={`mt-1 space-y-0.5 ${destaque}`}>
          {nomes.map((nome) => (
            <li key={`${titulo}-${nome}`} className="truncate">• {nome}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 text-muted-foreground">Nenhum</div>
      )}
    </div>
  );
}

function DepLinha({
  row,
  clinicaId,
  parentescoOptions,
  taxaInclusaoValor,
  onChange,
  onRemove,
  onRestaurar,
}: {
  row: DepRow;
  clinicaId: string;
  parentescoOptions: string[];
  taxaInclusaoValor: number;
  onChange: (patch: Partial<DepRow>) => void;
  onRemove: () => void;
  onRestaurar: () => void;
}) {
  const removido = row.id !== null && !row.manter;
  return (
    <div
      className={
        "p-2 flex flex-col gap-2 text-sm " +
        (removido ? "bg-red-50/50 opacity-70" : "hover:bg-muted/30")
      }
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          {/* Paciente */}
          {row.paciente_id ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{row.paciente_nome}</span>
                {row.id !== null ? (
                  <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                    atual
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded shrink-0">
                    novo
                  </span>
                )}
              </div>
              {!removido ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() =>
                    onChange({ paciente_id: null, paciente_nome: "" })
                  }
                >
                  Trocar
                </Button>
              ) : null}
            </div>
          ) : (
            <PatientSearchInput
              clinicaIdsOverride={[clinicaId]}
              placeholder="Buscar paciente por nome, CPF, prontuário…"
              onSelect={(p: PatientOption | null) => {
                if (!p) return;
                onChange({
                  paciente_id: p.id,
                  paciente_nome: p.nome,
                });
              }}
            />
          )}

          {/* Parentesco */}
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={row.parentesco}
              onValueChange={(v) => onChange({ parentesco: v })}
              disabled={removido}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Parentesco" />
              </SelectTrigger>
              <SelectContent>
                {parentescoOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.tipo}
              onValueChange={(v) => onChange({ tipo: v })}
              disabled={removido}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dependente">Dependente</SelectItem>
                <SelectItem value="agregado">Agregado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Taxa de inclusão apenas para NOVOS */}
          {row.id === null && row.paciente_id && taxaInclusaoValor > 0 ? (
            <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground">
              <Checkbox
                checked={row.cobrar_taxa_inclusao}
                onCheckedChange={(v) =>
                  onChange({ cobrar_taxa_inclusao: v === true })
                }
              />
              <span>
                Cobrar taxa de inclusão de dependente ({BRL(taxaInclusaoValor)})
              </span>
            </label>
          ) : null}
        </div>

        <div className="shrink-0">
          {removido ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-emerald-700"
              onClick={onRestaurar}
            >
              Restaurar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
              onClick={onRemove}
              aria-label="Remover dependente"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {removido ? (
        <p className="text-[11px] text-red-600 pl-1">
          Será removido do contrato ao confirmar a renovação.
        </p>
      ) : null}
    </div>
  );
}