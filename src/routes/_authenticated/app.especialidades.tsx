import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SERVICOS_TABS, SERVICOS_META } from "@/components/section-tabs";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useAdminPlataforma, useEditaCatalogoGlobal } from "@/hooks/use-admin-plataforma";
import { useClinica } from "@/hooks/use-clinica";
import { ExigeUnidadeEscolhida, FaixaUnidadeAtual } from "@/components/exige-unidade-escolhida";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Stethoscope, Plus, Pencil, Search, Trash2 } from "lucide-react";
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
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/_authenticated/app/especialidades")({
  component: EspecialidadesPageWithTabs,
  head: () => ({ meta: [{ title: "Especialidades — ClinicaOS" }] }),
});

interface Esp {
  id: string;
  nome: string;
  descricao: string | null;
  /** Lista única: só a plataforma muda. */
  ativoGlobal: boolean;
  /** Ligada nesta unidade (sem linha = não aparece aqui). */
  ativoUnidade: boolean;
}

/** Aparece nas listas de escolha desta unidade? */
const ativaAqui = (e: Esp) => e.ativoGlobal && e.ativoUnidade;

function EspecialidadesPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual!.clinica_id;
  // Ligar/desligar vale só para esta unidade: basta poder editar o módulo.
  const podeEscreverModulo = usePodeEscrever("especialidades");
  // Criar e renomear mexem na lista de nomes que as unidades compartilham.
  const editaCatalogo = useEditaCatalogoGlobal();
  const podeEditarNome = podeEscreverModulo && editaCatalogo;
  const adminPlataforma = useAdminPlataforma();
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "ativo" | "inativo">("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Esp | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "" });
  const [saving, setSaving] = useState(false);
  const [alternando, setAlternando] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Esp | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    data: rows = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ["especialidades-unidade", clinicaId],
    queryFn: async () => {
      const [esps, daUnidade] = await Promise.all([
        supabase.from("especialidades").select("id,nome,descricao,ativo").order("nome"),
        supabase
          .from("especialidade_unidade")
          .select("especialidade_id,ativo")
          .eq("clinica_id", clinicaId),
      ]);
      if (esps.error) throw esps.error;
      if (daUnidade.error) throw daUnidade.error;
      const ligada = new Map(
        (daUnidade.data ?? []).map((r) => [r.especialidade_id, r.ativo] as const),
      );
      return (esps.data ?? []).map(
        (e): Esp => ({
          id: e.id,
          nome: e.nome,
          descricao: e.descricao,
          ativoGlobal: e.ativo,
          ativoUnidade: ligada.get(e.id) ?? false,
        }),
      );
    },
    staleTime: 60_000,
  });
  useEffect(() => {
    if (error) mostrarErro(error);
  }, [error]);
  const load = () => {
    void queryClient.invalidateQueries({ queryKey: ["especialidades-unidade", clinicaId] });
    void queryClient.invalidateQueries({ queryKey: ["especialidades"] });
  };

  async function ligarNestaUnidade(especialidadeId: string, ativo: boolean) {
    return supabase
      .from("especialidade_unidade")
      .upsert(
        { clinica_id: clinicaId, especialidade_id: especialidadeId, ativo },
        { onConflict: "clinica_id,especialidade_id" },
      );
  }

  async function alternar(e: Esp) {
    if (!podeEscreverModulo) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setAlternando(e.id);
    const { error } = await ligarNestaUnidade(e.id, !e.ativoUnidade);
    setAlternando(null);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(
      e.ativoUnidade
        ? `${e.nome} desativada em ${clinicaAtual!.clinica.nome}`
        : `${e.nome} ativada em ${clinicaAtual!.clinica.nome}`,
    );
    load();
  }

  function openNew() {
    setEditing(null);
    setForm({ nome: "", descricao: "" });
    setOpen(true);
  }
  function openEdit(e: Esp) {
    setEditing(e);
    setForm({ nome: e.nome, descricao: e.descricao ?? "" });
    setOpen(true);
  }

  async function salvar() {
    if (!podeEditarNome) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    const toTitle = (s: string) =>
      s
        .toLocaleLowerCase("pt-BR")
        .split(/(\s+|-)/)
        .map((part) =>
          /^\s+$|^-$/.test(part) ? part : part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1),
        )
        .join("");
    const payload = {
      nome: toTitle(form.nome.trim()),
      descricao: form.descricao.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from("especialidades").update(payload).eq("id", editing.id);
      setSaving(false);
      if (error) {
        mostrarErro(error);
        return;
      }
      toast.success("Especialidade atualizada");
    } else {
      // Nasce ligada só nesta unidade; a outra liga se quiser.
      const { data, error } = await supabase
        .from("especialidades")
        .insert({ ...payload, ativo: true })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        mostrarErro(error);
        return;
      }
      const { error: errUnidade } = await ligarNestaUnidade(data.id, true);
      setSaving(false);
      if (errUnidade) {
        mostrarErro(errUnidade);
        return;
      }
      toast.success(`Especialidade criada em ${clinicaAtual!.clinica.nome}`);
    }
    setOpen(false);
    load();
  }

  const filtered = rows.filter((r) => {
    const matchNome = r.nome.toLowerCase().includes(q.toLowerCase());
    const matchStatus =
      statusFiltro === "todos" ||
      (statusFiltro === "ativo" && ativaAqui(r)) ||
      (statusFiltro === "inativo" && !ativaAqui(r));
    return matchNome && matchStatus;
  });

  async function confirmarExclusao() {
    if (!podeEditarNome) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!toDelete) return;
    setDeleting(true);
    const { data: vinculos, error: countError } = await supabase
      .from("procedimentos")
      .select("clinica_id")
      .ilike("grupo", toDelete.nome);
    if (countError) {
      setDeleting(false);
      mostrarErro(countError);
      return;
    }
    if ((vinculos?.length ?? 0) > 0) {
      setDeleting(false);
      const clinicaIds = Array.from(
        new Set((vinculos ?? []).map((v: any) => v.clinica_id).filter(Boolean)),
      );
      let nomes: string[] = [];
      if (clinicaIds.length > 0) {
        const { data: clins } = await supabase.from("clinicas").select("nome").in("id", clinicaIds);
        nomes = (clins ?? []).map((c: any) => c.nome).filter(Boolean);
      }
      const detalhe = nomes.length ? ` (clínica(s): ${nomes.join(", ")})` : "";
      toast.error(
        `Não é possível excluir: existem ${vinculos!.length} serviço(s) vinculados a esta especialidade${detalhe}. Especialidades são globais — remova os serviços em todas as clínicas antes.`,
        { duration: 8000 },
      );
      setToDelete(null);
      return;
    }
    // Verificar médicos vinculados
    const { data: medVinc, error: medErr } = await supabase
      .from("medicos")
      .select("nome")
      .eq("especialidade_id", toDelete.id);
    if (medErr) {
      setDeleting(false);
      mostrarErro(medErr);
      return;
    }
    if ((medVinc?.length ?? 0) > 0) {
      setDeleting(false);
      const nomes = (medVinc ?? [])
        .map((m: any) => m.nome)
        .filter(Boolean)
        .slice(0, 5);
      const extra = medVinc!.length > 5 ? ` e mais ${medVinc!.length - 5}` : "";
      toast.error(
        `Não é possível excluir: ${medVinc!.length} médico(s) vinculado(s) a esta especialidade (${nomes.join(", ")}${extra}). Altere a especialidade desses médicos antes.`,
        { duration: 8000 },
      );
      setToDelete(null);
      return;
    }
    const { error, count: delCount } = await supabase
      .from("especialidades")
      .delete({ count: "exact" })
      .eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    if (!delCount) {
      toast.error("Não foi possível excluir. Verifique se você tem permissão.");
      return;
    }
    toast.success("Especialidade excluída");
    setToDelete(null);
    load();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Stethoscope className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Especialidades</h1>
          <p className="text-sm text-muted-foreground">
            Ativar ou desativar vale só para esta unidade. Os nomes são compartilhados: uma
            especialidade nova nasce ativa só na unidade que criou.
          </p>
          {podeEscreverModulo && !editaCatalogo && (
            <p className="text-sm text-muted-foreground">
              Criar ou renomear especialidade é só para as pessoas autorizadas. Peça a uma delas.
            </p>
          )}
        </div>
        {podeEditarNome && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nova
          </Button>
        )}
      </div>

      <FaixaUnidadeAtual />

      <Card className="p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput);
          }}
        >
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar..."
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4 mr-1" /> Buscar
          </Button>
          <Select
            value={statusFiltro}
            onValueChange={(v) => setStatusFiltro(v as "todos" | "ativo" | "inativo")}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as situações</SelectItem>
              <SelectItem value="ativo">Ativas nesta unidade</SelectItem>
              <SelectItem value="inativo">Inativas nesta unidade</SelectItem>
            </SelectContent>
          </Select>
        </form>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-44">Nesta unidade</TableHead>
              <TableHead className="w-56 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  Nenhuma especialidade.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${ativaAqui(r) ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                    >
                      {!r.ativoGlobal
                        ? "Desativada pela plataforma"
                        : r.ativoUnidade
                          ? "Ativa"
                          : "Inativa"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {podeEscreverModulo && r.ativoGlobal && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={alternando === r.id}
                          onClick={() => void alternar(r)}
                        >
                          {r.ativoUnidade ? "Desativar nesta unidade" : "Ativar nesta unidade"}
                        </Button>
                      )}
                      {podeEditarNome && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(r)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {podeEditarNome && adminPlataforma && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setToDelete(r)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar especialidade" : "Nova especialidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                uppercase
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Hepatologia"
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {editing
                ? "Renomear só é permitido se a especialidade não estiver em uso em outra unidade."
                : `Ela será ativada só em ${clinicaAtual!.clinica.nome}.`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir especialidade</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{toDelete?.nome}</strong>? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmarExclusao();
              }}
              disabled={deleting}
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function EspecialidadesPageWithTabs() {
  return (
    <>
      <SectionTabs title={SERVICOS_META.title} icon={SERVICOS_META.icon} tabs={SERVICOS_TABS} />
      <ExigeUnidadeEscolhida oQue="ativar ou desativar especialidades">
        <EspecialidadesPage />
      </ExigeUnidadeEscolhida>
    </>
  );
}
