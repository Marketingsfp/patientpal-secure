/**
 * Cartão Benefícios › Sem convênio.
 *
 * Corrige em lote a herança do script antigo de vínculo titular-dependente:
 * contratos que ficaram ATIVOS mas sem convênio vinculado. Sem o convênio o
 * sistema não encontra tabela de preços nenhuma — o paciente (e os dependentes
 * pendurados naquele contrato) acabam cobrados pelo valor particular cheio,
 * mesmo tendo cartão.
 *
 * A tela existe para o setor de contratos resolver isso sem abrir centenas de
 * fichas uma por uma. Ela faz UMA coisa só: preencher o convênio. Não gera
 * mensalidade, não altera valor, não cancela nem recria contrato (é por isso
 * que NÃO usa a RPC `trocar_convenio_contrato`, que cancelaria o contrato e
 * emitiria parcelas novas).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Download, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { exportToExcel } from "@/lib/export-csv";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/sem-convenio")({
  component: SemConvenioPage,
  head: () => ({ meta: [{ title: "Contratos sem convênio — Cartão Benefícios" }] }),
});

/** Contratos são gravados em lotes para não estourar o limite da requisição. */
const LOTE_UPDATE = 100;

type ContratoSemConvenio = {
  id: string;
  numero: number;
  paciente_id: string | null;
  paciente_nome: string;
  data_inicio: string | null;
  valor_mensal: number;
  observacoes: string | null;
  dependentes: string[];
};

type ConvenioOpt = { id: string; nome: string };

const fmtData = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

function SemConvenioPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("cartao-beneficios");
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const [carregando, setCarregando] = useState(true);
  const [contratos, setContratos] = useState<ContratoSemConvenio[]>([]);
  const [convenios, setConvenios] = useState<ConvenioOpt[]>([]);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [convenioEscolhido, setConvenioEscolhido] = useState("");
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const [{ data: convData, error: convErr }, { data: ctData, error: ctErr }] =
        await Promise.all([
          supabase
            .from("cb_convenios")
            .select("id,nome")
            .eq("clinica_id", clinicaId)
            .eq("ativo", true)
            .order("nome"),
          supabase
            .from("contratos_assinatura")
            .select("id,numero,paciente_id,paciente_nome,data_inicio,valor_mensal,observacoes")
            .eq("clinica_id", clinicaId)
            .eq("status", "ativo")
            .is("convenio_id", null)
            .order("paciente_nome"),
        ]);
      if (convErr) {
        mostrarErro(convErr);
        return;
      }
      if (ctErr) {
        mostrarErro(ctErr);
        return;
      }
      setConvenios((convData ?? []) as ConvenioOpt[]);
      const linhas = (ctData ?? []) as Array<Omit<ContratoSemConvenio, "dependentes">>;

      // Dependentes ativos de cada contrato — é o que mostra o tamanho real do
      // problema: um contrato sem convênio pode estar segurando uma família
      // inteira sem desconto.
      const porContrato = new Map<string, string[]>();
      const ids = linhas.map((l) => l.id);
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        if (lote.length === 0) break;
        const { data: deps } = await supabase
          .from("contrato_dependentes")
          .select("contrato_id,paciente_nome")
          .eq("ativo", true)
          .in("contrato_id", lote);
        for (const d of (deps ?? []) as Array<{ contrato_id: string; paciente_nome: string }>) {
          const atual = porContrato.get(d.contrato_id) ?? [];
          atual.push(d.paciente_nome);
          porContrato.set(d.contrato_id, atual);
        }
      }
      setContratos(
        linhas.map((l) => ({
          ...l,
          valor_mensal: Number(l.valor_mensal) || 0,
          dependentes: porContrato.get(l.id) ?? [],
        })),
      );
      setSelecionados(new Set());
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaId]);

  const filtrados = useMemo(() => {
    const termo = norm(busca);
    if (!termo) return contratos;
    return contratos.filter(
      (c) =>
        norm(c.paciente_nome).includes(termo) ||
        String(c.numero).includes(termo) ||
        c.dependentes.some((d) => norm(d).includes(termo)),
    );
  }, [contratos, busca]);

  const totalDependentes = useMemo(
    () => contratos.reduce((s, c) => s + c.dependentes.length, 0),
    [contratos],
  );
  const selecionadosVisiveis = filtrados.filter((c) => selecionados.has(c.id));
  const todosVisiveisMarcados =
    filtrados.length > 0 && selecionadosVisiveis.length === filtrados.length;

  const alternarTodosVisiveis = () => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (todosVisiveisMarcados) filtrados.forEach((c) => n.delete(c.id));
      else filtrados.forEach((c) => n.add(c.id));
      return n;
    });
  };

  const alternarUm = (id: string) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const convenioNome = convenios.find((c) => c.id === convenioEscolhido)?.nome ?? "";
  const qtdSelecionada = selecionados.size;
  const dependentesSelecionados = contratos
    .filter((c) => selecionados.has(c.id))
    .reduce((s, c) => s + c.dependentes.length, 0);

  const aplicar = async () => {
    if (!clinicaId || !convenioEscolhido || qtdSelecionada === 0) return;
    setSalvando(true);
    try {
      const ids = Array.from(selecionados);
      let gravados = 0;
      for (let i = 0; i < ids.length; i += LOTE_UPDATE) {
        const lote = ids.slice(i, i + LOTE_UPDATE);
        // `is("convenio_id", null)` é trava de segurança: se outra pessoa já
        // tiver preenchido o convênio de um desses contratos enquanto a tela
        // estava aberta, a gravação daqui não sobrescreve o trabalho dela.
        const { data, error } = await supabase
          .from("contratos_assinatura")
          .update({ convenio_id: convenioEscolhido } as never)
          .eq("clinica_id", clinicaId)
          .eq("status", "ativo")
          .is("convenio_id", null)
          .in("id", lote)
          .select("id");
        if (error) {
          mostrarErro(error);
          return;
        }
        gravados += (data ?? []).length;
      }
      const ignorados = ids.length - gravados;
      toast.success(
        `${gravados} contrato(s) vinculado(s) ao ${convenioNome}.` +
          (ignorados > 0
            ? ` ${ignorados} não foi(ram) alterado(s) — já tinham convênio preenchido por outra pessoa.`
            : ""),
      );
      setConfirmarOpen(false);
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  const exportar = () => {
    if (filtrados.length === 0) {
      toast.info("Nada para exportar.");
      return;
    }
    exportToExcel(
      filtrados.map((c) => ({
        contrato: c.numero,
        titular: c.paciente_nome,
        inicio: fmtData(c.data_inicio),
        dependentes_ativos: c.dependentes.length,
        dependentes: c.dependentes.join(" | "),
        observacoes: c.observacoes ?? "",
      })),
      "contratos-sem-convenio",
      [
        { key: "contrato", label: "Contrato" },
        { key: "titular", label: "Titular" },
        { key: "inicio", label: "Início" },
        { key: "dependentes_ativos", label: "Dependentes ativos" },
        { key: "dependentes", label: "Nomes dos dependentes" },
        { key: "observacoes", label: "Observações" },
      ],
    );
  };

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Estes contratos estão <b>ativos</b>, mas sem convênio vinculado — quase todos vêm do
          vínculo automático titular-dependente feito na importação. Sem o convênio o sistema não
          acha a tabela de preços e a cobrança sai pelo <b>valor particular cheio</b>, tanto para o
          titular quanto para os dependentes do contrato. Escolher o convênio aqui{" "}
          <b>só liga o contrato à tabela de preços</b>: não gera mensalidade, não muda valor e não
          cancela nem recria contrato.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Contratos sem convênio
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{contratos.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Dependentes afetados
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{totalDependentes}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pessoas sem desconto
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">
            {contratos.length + totalDependentes}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Vincular convênio em lote
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px] space-y-1.5">
              <Label className="text-xs font-semibold">Buscar titular, dependente ou nº</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Ex.: MARIA DA SILVA"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="min-w-[240px] space-y-1.5">
              <Label className="text-xs font-semibold">Convênio a aplicar</Label>
              <Select value={convenioEscolhido} onValueChange={setConvenioEscolhido}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o convênio" />
                </SelectTrigger>
                <SelectContent>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setConfirmarOpen(true)}
              disabled={!podeEscrever || !convenioEscolhido || qtdSelecionada === 0}
              title={
                !podeEscrever
                  ? "Você não tem permissão de edição neste módulo."
                  : !convenioEscolhido
                    ? "Escolha o convênio antes de aplicar."
                    : qtdSelecionada === 0
                      ? "Marque ao menos um contrato."
                      : undefined
              }
            >
              <Check className="h-4 w-4 mr-1" />
              Aplicar a {qtdSelecionada} contrato(s)
            </Button>
            <Button variant="outline" onClick={exportar}>
              <Download className="h-4 w-4 mr-1" />
              Exportar lista
            </Button>
          </div>
          {!podeEscrever && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Você está apenas visualizando: seu perfil não tem permissão de edição no Cartão
              Benefícios.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando contratos…</p>
          ) : filtrados.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {contratos.length === 0
                ? "Nenhum contrato ativo sem convênio. Nada a corrigir por aqui."
                : "Nenhum contrato encontrado para esta busca."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={todosVisiveisMarcados}
                        onCheckedChange={alternarTodosVisiveis}
                        aria-label="Marcar todos os contratos filtrados"
                      />
                    </TableHead>
                    <TableHead className="w-20">Contrato</TableHead>
                    <TableHead>Titular</TableHead>
                    <TableHead className="w-24">Início</TableHead>
                    <TableHead>Dependentes ativos</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((c) => (
                    <TableRow key={c.id} className={selecionados.has(c.id) ? "bg-muted/40" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selecionados.has(c.id)}
                          onCheckedChange={() => alternarUm(c.id)}
                          aria-label={`Marcar contrato de ${c.paciente_nome}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">{c.numero}</TableCell>
                      <TableCell className="font-medium">{c.paciente_nome}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {fmtData(c.data_inicio)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.dependentes.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            <Badge variant="secondary" className="h-5">
                              <Users className="h-3 w-3 mr-1" />
                              {c.dependentes.length}
                            </Badge>
                            <span className="text-muted-foreground">
                              {c.dependentes.join(", ")}
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground max-w-[260px] truncate">
                        {c.observacoes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmarOpen} onOpenChange={setConfirmarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar vínculo do convênio</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <p>
              Vou vincular <b>{qtdSelecionada}</b> contrato(s) ao convênio{" "}
              <b>{convenioNome || "—"}</b>.
            </p>
            <p>
              Isso passa a valer também para <b>{dependentesSelecionados}</b> dependente(s) ativo(s)
              desses contratos — no total, {qtdSelecionada + dependentesSelecionados} pessoa(s)
              passam a ser cobradas pela tabela desse convênio.
            </p>
            <p className="text-muted-foreground text-xs">
              Só o campo do convênio é gravado. Nenhuma mensalidade é criada, nenhum valor é
              alterado e nenhum contrato é cancelado. A alteração fica registrada na auditoria do
              sistema e pode ser revista contrato por contrato.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarOpen(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={aplicar} disabled={salvando}>
              {salvando ? "Gravando…" : "Confirmar e vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
