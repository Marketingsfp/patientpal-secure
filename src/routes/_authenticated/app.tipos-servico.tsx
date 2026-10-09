import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SERVICOS_TABS, SERVICOS_META } from "@/components/section-tabs";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useEditaCatalogoGlobal } from "@/hooks/use-admin-plataforma";
import { useClinica } from "@/hooks/use-clinica";
import { ExigeUnidadeEscolhida, FaixaUnidadeAtual } from "@/components/exige-unidade-escolhida";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { LayoutGrid, Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/_authenticated/app/tipos-servico")({
  component: TiposServicoPageWithTabs,
  head: () => ({ meta: [{ title: "Categorias de Serviço — ClinicaOS" }] }),
});

interface Tipo {
  id: string;
  nome: string;
  /** Lista única: só a plataforma muda. */
  ativoGlobal: boolean;
  /** Ligada nesta unidade (sem linha = não aparece aqui). */
  ativoUnidade: boolean;
}

const ativoAqui = (t: Tipo) => t.ativoGlobal && t.ativoUnidade;

function TiposServicoPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual!.clinica_id;
  // Ligar/desligar vale só para esta unidade: basta poder editar o módulo.
  const podeEscreverModulo = usePodeEscrever("tipos-servico");
  // Criar e renomear mexem na lista de nomes que as unidades compartilham.
  const editaCatalogo = useEditaCatalogoGlobal();
  const podeEditarNome = podeEscreverModulo && editaCatalogo;
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tipo | null>(null);
  const [form, setForm] = useState({ nome: "" });
  const [saving, setSaving] = useState(false);
  const [alternando, setAlternando] = useState<string | null>(null);

  const {
    data: rows = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ["tipos-servico-unidade", clinicaId],
    queryFn: async () => {
      const [tipos, daUnidade] = await Promise.all([
        supabase.from("tipos_servico").select("id,nome,ativo").order("nome"),
        supabase
          .from("tipo_servico_unidade")
          .select("tipo_servico_id,ativo")
          .eq("clinica_id", clinicaId),
      ]);
      if (tipos.error) throw tipos.error;
      if (daUnidade.error) throw daUnidade.error;
      const ligado = new Map(
        (daUnidade.data ?? []).map((r) => [r.tipo_servico_id, r.ativo] as const),
      );
      return (tipos.data ?? []).map(
        (t): Tipo => ({
          id: t.id,
          nome: t.nome,
          ativoGlobal: t.ativo,
          ativoUnidade: ligado.get(t.id) ?? false,
        }),
      );
    },
    staleTime: 60_000,
  });
  useEffect(() => {
    if (error) mostrarErro(error);
  }, [error]);
  const load = () => {
    void queryClient.invalidateQueries({ queryKey: ["tipos-servico-unidade", clinicaId] });
    void queryClient.invalidateQueries({ queryKey: ["tipos-servico"] });
  };

  async function ligarNestaUnidade(tipoId: string, ativo: boolean) {
    return supabase
      .from("tipo_servico_unidade")
      .upsert(
        { clinica_id: clinicaId, tipo_servico_id: tipoId, ativo },
        { onConflict: "clinica_id,tipo_servico_id" },
      );
  }

  async function alternar(t: Tipo) {
    if (!podeEscreverModulo) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setAlternando(t.id);
    const { error } = await ligarNestaUnidade(t.id, !t.ativoUnidade);
    setAlternando(null);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(
      t.ativoUnidade
        ? `${cap(t.nome)} desativada em ${clinicaAtual!.clinica.nome}`
        : `${cap(t.nome)} ativada em ${clinicaAtual!.clinica.nome}`,
    );
    load();
  }

  function openNew() {
    setEditing(null);
    setForm({ nome: "" });
    setOpen(true);
  }
  function openEdit(t: Tipo) {
    setEditing(t);
    setForm({ nome: t.nome });
    setOpen(true);
  }

  async function salvar() {
    if (!podeEditarNome) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const nome = form.nome.trim().toLowerCase();
    if (!nome) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("tipos_servico").update({ nome }).eq("id", editing.id);
      setSaving(false);
      if (error) {
        mostrarErro(error);
        return;
      }
      toast.success("Categoria atualizada");
    } else {
      // Nasce ligada só nesta unidade; a outra liga se quiser.
      const { data, error } = await supabase
        .from("tipos_servico")
        .insert({ nome, ativo: true })
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
      toast.success(`Categoria criada em ${clinicaAtual!.clinica.nome}`);
    }
    setOpen(false);
    load();
  }

  const filtered = rows.filter((r) => r.nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <LayoutGrid className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Categorias de Serviço</h1>
          <p className="text-sm text-muted-foreground">
            Categorias de serviços (Consulta, Exames / Procedimentos, Cirurgia…). Ativar ou
            desativar vale só para esta unidade; uma categoria nova nasce ativa só na unidade que
            criou.
          </p>
          {podeEscreverModulo && !editaCatalogo && (
            <p className="text-sm text-muted-foreground">
              Criar ou renomear categoria é só para as pessoas autorizadas. Peça a uma delas.
            </p>
          )}
        </div>
        {podeEditarNome && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        )}
      </div>

      <FaixaUnidadeAtual />

      <Card className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
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
                  Nenhuma categoria cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{cap(r.nome)}</TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${ativoAqui(r) ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                    >
                      {!r.ativoGlobal
                        ? "Desativada pela plataforma"
                        : r.ativoUnidade
                          ? "Ativo"
                          : "Inativo"}
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
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
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
            <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                uppercase
                value={form.nome}
                onChange={(e) => setForm({ nome: e.target.value })}
                placeholder="Ex: Cirurgia"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {editing
                ? "Renomear só é permitido se a categoria não estiver em uso em outra unidade."
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
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function TiposServicoPageWithTabs() {
  return (
    <>
      <SectionTabs title={SERVICOS_META.title} icon={SERVICOS_META.icon} tabs={SERVICOS_TABS} />
      <ExigeUnidadeEscolhida oQue="ativar ou desativar categorias">
        <TiposServicoPage />
      </ExigeUnidadeEscolhida>
    </>
  );
}
