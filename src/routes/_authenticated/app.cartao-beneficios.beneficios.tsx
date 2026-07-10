import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Gift, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/beneficios")({
  component: BeneficiosPage,
  head: () => ({ meta: [{ title: "Benefícios — Cartão Benefícios" }] }),
});

type Convenio = { id: string; nome: string; ativo: boolean };
type Beneficio = {
  id: string;
  clinica_id: string;
  convenio_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  escopo: "servico" | "especialidade";
  procedimento_id: string | null;
  especialidade_id: string | null;
  tipo_desconto: "percentual" | "valor" | "gratuidade";
  valor_desconto: number | null;
};
type Procedimento = { id: string; nome: string };
type Especialidade = { id: string; nome: string };

function BeneficiosPage() {
  const { clinicaAtual } = useClinica();
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [rows, setRows] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroConvenio, setFiltroConvenio] = useState<string>("todos");

  const [view, setView] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<Beneficio | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [convenioId, setConvenioId] = useState<string>("");
  const [ativo, setAtivo] = useState(true);
  const [escopo, setEscopo] = useState<"servico" | "especialidade">("servico");
  const [procedimentoId, setProcedimentoId] = useState<string>("");
  const [especialidadeId, setEspecialidadeId] = useState<string>("");
  const [tipoDesconto, setTipoDesconto] = useState<"percentual" | "valor" | "gratuidade">(
    "percentual",
  );
  const [valorDesconto, setValorDesconto] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Beneficio | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const cid = clinicaAtual.clinica_id;
    const [cs, bs, es] = await Promise.all([
      supabase.from("cb_convenios").select("id, nome, ativo").eq("clinica_id", cid).order("nome"),
      supabase
        .from("cb_beneficios")
        .select(
          "id, clinica_id, convenio_id, nome, descricao, ativo, escopo, procedimento_id, especialidade_id, tipo_desconto, valor_desconto",
        )
        .eq("clinica_id", cid)
        .order("nome"),
      supabase
        .from("especialidades")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome")
        .range(0, 9999),
    ]);
    // PostgREST aplica db-max-rows=1000 mesmo com .range() amplo —
    // pagina manualmente para trazer todos os procedimentos ativos.
    const PAGE = 1000;
    const allProcs: Procedimento[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("procedimentos")
        .select("id, nome")
        .eq("clinica_id", cid)
        .order("nome")
        .range(from, from + PAGE - 1);
      if (error) break;
      const page = (data ?? []) as Procedimento[];
      allProcs.push(...page);
      if (page.length < PAGE) break;
    }
    if (cs.error) mostrarErro(cs.error);
    if (bs.error) mostrarErro(bs.error);
    setConvenios((cs.data ?? []) as Convenio[]);
    setRows((bs.data ?? []) as Beneficio[]);
    setProcedimentos(allProcs);
    setEspecialidades((es.data ?? []) as Especialidade[]);
    setLoading(false);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [clinicaAtual?.clinica_id]);

  const convMap = useMemo(() => {
    const m = new Map<string, string>();
    convenios.forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [convenios]);

  const filtered = useMemo(
    () =>
      filtroConvenio === "todos" ? rows : rows.filter((b) => b.convenio_id === filtroConvenio),
    [rows, filtroConvenio],
  );

  const openNew = () => {
    if (convenios.length === 0) {
      toast.error("Cadastre um convênio primeiro.");
      return;
    }
    setEditing(null);
    setNome("");
    setDescricao("");
    setAtivo(true);
    setConvenioId(convenios[0]?.id ?? "");
    setEscopo("servico");
    setProcedimentoId("");
    setEspecialidadeId("");
    setTipoDesconto("percentual");
    setValorDesconto("");
    setView("form");
  };

  const openEdit = (b: Beneficio) => {
    setEditing(b);
    setNome(b.nome);
    setDescricao(b.descricao ?? "");
    setConvenioId(b.convenio_id);
    setAtivo(b.ativo);
    setEscopo(b.escopo);
    setProcedimentoId(b.procedimento_id ?? "");
    setEspecialidadeId(b.especialidade_id ?? "");
    setTipoDesconto(b.tipo_desconto);
    setValorDesconto(b.valor_desconto != null ? String(b.valor_desconto) : "");
    setView("form");
  };

  const save = async () => {
    if (!clinicaAtual) return;
    if (!convenioId) {
      toast.error("Selecione um convênio.");
      return;
    }
    if (escopo === "servico" && !procedimentoId) {
      toast.error("Selecione o procedimento.");
      return;
    }
    if (escopo === "especialidade" && !especialidadeId) {
      toast.error("Selecione a especialidade.");
      return;
    }
    const valorNum = valorDesconto ? Number(valorDesconto.replace(",", ".")) : null;
    if (tipoDesconto !== "gratuidade" && (!valorNum || valorNum <= 0)) {
      toast.error("Informe um valor de desconto.");
      return;
    }
    const alvoNome =
      escopo === "servico"
        ? procedimentos.find((p) => p.id === procedimentoId)?.nome
        : especialidades.find((e) => e.id === especialidadeId)?.nome;
    const nomeFinal =
      nome.trim() ||
      (alvoNome ? (escopo === "servico" ? alvoNome : `Especialidade: ${alvoNome}`) : "");
    if (!nomeFinal) {
      toast.error("Informe o nome.");
      return;
    }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      convenio_id: convenioId,
      nome: nomeFinal,
      descricao: descricao.trim() || null,
      ativo,
      escopo,
      procedimento_id: escopo === "servico" ? procedimentoId : null,
      especialidade_id: escopo === "especialidade" ? especialidadeId : null,
      tipo_desconto: tipoDesconto,
      valor_desconto: tipoDesconto === "gratuidade" ? null : valorNum,
    };
    const { error } = editing
      ? await supabase.from("cb_beneficios").update(payload).eq("id", editing.id)
      : await supabase.from("cb_beneficios").insert(payload);
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(editing ? "Benefício atualizado." : "Benefício criado.");
    setView("list");
    load();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("cb_beneficios").delete().eq("id", toDelete.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Benefício excluído.");
    setToDelete(null);
    load();
  };

  if (!clinicaAtual) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;

  return (
    <div className="space-y-4">
      {view === "list" ? (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Benefícios oferecidos pelos cartões da clínica.
            </p>
            <div className="flex items-center gap-2">
              <Select value={filtroConvenio} onValueChange={setFiltroConvenio}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filtrar por convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os convênios</SelectItem>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Novo benefício
              </Button>
            </div>
          </div>

          {convenios.length === 0 && !loading ? (
            <Card>
              <CardContent className="p-4 text-sm">
                Nenhum convênio cadastrado.{" "}
                <Link to="/app/cartao-beneficios/convenios" className="text-primary underline">
                  Cadastrar agora
                </Link>
                .
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        Nenhum benefício encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.nome}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{convMap.get(b.convenio_id) ?? "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.escopo === "servico" ? "default" : "secondary"}>
                            {b.escopo === "servico" ? "Serviço" : "Especialidade"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.tipo_desconto === "gratuidade"
                            ? "Gratuito"
                            : b.tipo_desconto === "percentual"
                              ? `${b.valor_desconto ?? 0}%`
                              : `R$ ${Number(b.valor_desconto ?? 0).toFixed(2)}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.ativo ? "default" : "outline"}>
                            {b.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setToDelete(b)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <h2 className="text-lg font-semibold">
                {editing ? `Editar benefício: ${editing.nome}` : "Novo benefício"}
              </h2>
              <div />
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Opcional — preenchido automaticamente"
                />
              </div>
              <div>
                <Label>Convênio *</Label>
                <Select value={convenioId} onValueChange={setConvenioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Aplicar em *</Label>
                  <Select
                    value={escopo}
                    onValueChange={(v) => setEscopo(v as "servico" | "especialidade")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="servico">Serviço (procedimento)</SelectItem>
                      <SelectItem value="especialidade">Especialidade inteira</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{escopo === "servico" ? "Procedimento *" : "Especialidade *"}</Label>
                  {escopo === "servico" ? (
                    <Select value={procedimentoId} onValueChange={setProcedimentoId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {procedimentos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={especialidadeId} onValueChange={setEspecialidadeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {especialidades.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de desconto *</Label>
                  <Select
                    value={tipoDesconto}
                    onValueChange={(v) =>
                      setTipoDesconto(v as "percentual" | "valor" | "gratuidade")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual">Percentual (%)</SelectItem>
                      <SelectItem value="valor">Valor fixo (R$)</SelectItem>
                      <SelectItem value="gratuidade">Gratuito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {tipoDesconto !== "gratuidade" && (
                  <div>
                    <Label>{tipoDesconto === "percentual" ? "Valor (%)" : "Valor (R$)"} *</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={valorDesconto}
                      onChange={(e) => setValorDesconto(e.target.value)}
                      placeholder={tipoDesconto === "percentual" ? "Ex: 20" : "Ex: 50.00"}
                    />
                  </div>
                )}
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={ativo} onCheckedChange={setAtivo} />
                <Label>Ativo</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setView("list")}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir benefício?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
