import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface SimpleCrudProps<T extends { id: string }, F> {
  table: string;
  selectColumns: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  columns: ColumnDef<T>[];
  /**
   * Default value for the form when creating a new row.
   *
   * Pode ser uma função quando algum campo depende do momento da abertura
   * (data/hora de agora, por exemplo). Um objeto fixo é calculado uma única
   * vez, e num computador de recepção que fica dias com a tela aberta o
   * cadastro novo nascia com a data em que a página foi carregada.
   */
  emptyForm: F | (() => F);
  /** Convert row to form values when editing. */
  toForm: (row: T) => F;
  /** Convert form values into the payload for insert/update (clinica_id is added automatically). */
  toPayload: (form: F) => Record<string, unknown>;
  /** Form fields rendered inside the dialog. */
  renderForm: (form: F, setForm: (f: F) => void) => ReactNode;
  /**
   * Optional pre-submit validation. Return a string with the error message
   * to block submission and show a toast; return null to allow saving.
   */
  validate?: (form: F) => string | null;
  /** Optional search filter. */
  searchFields?: (keyof T)[];
  /** Optional sort column. Defaults to created_at desc. */
  orderBy?: { column: string; ascending?: boolean };
  /** Optional max-width class for the dialog (default: max-w-2xl). */
  dialogClassName?: string;
  /** Optional custom labels for the create/edit dialog title. */
  newLabel?: string;
  editLabel?: string;
  /** When true, hides create/edit/delete actions (read-only permission level). */
  readOnly?: boolean;
  /** Optional custom label for the create button (default: "Novo"). */
  addLabel?: string;
  /** Opt-in premium visual style for the header/table (does not affect other pages). */
  premium?: boolean;
}

export function SimpleCrud<T extends { id: string }, F>({
  table,
  selectColumns,
  title,
  subtitle,
  icon,
  columns,
  emptyForm,
  toForm,
  toPayload,
  renderForm,
  validate,
  searchFields,
  orderBy,
  dialogClassName,
  newLabel,
  editLabel,
  readOnly,
  addLabel,
  premium,
}: SimpleCrudProps<T, F>) {
  const { clinicaAtual } = useClinica();
  const novoForm = (): F =>
    typeof emptyForm === "function" ? (emptyForm as () => F)() : emptyForm;
  const [items, setItems] = useState<T[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<F>(() => novoForm());
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const o = orderBy ?? { column: "created_at", ascending: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(table as any) as any)
      .select(selectColumns)
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order(o.column, { ascending: o.ascending ?? false });
    setLoading(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setItems((data ?? []) as T[]);
  };
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q || !searchFields?.length) return items;
    return items.filter((r) =>
      searchFields.some((f) =>
        String((r as Record<string, unknown>)[f as string] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [items, busca, searchFields]);

  const openNew = () => {
    setEditing(null);
    setForm(novoForm());
    setOpen(true);
  };
  const openEdit = (r: T) => {
    setEditing(r);
    setForm(toForm(r));
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    if (validate) {
      const msg = validate(form);
      if (msg) {
        toast.error(msg);
        return;
      }
    }
    setSaving(true);
    // O `finally` é obrigatório aqui: `toPayload` é escrito por cada tela e
    // pode lançar antes de qualquer ida ao banco — uma data em branco vira
    // `new Date("")` e estoura. Sem ele o botão ficava travado em "Salvando…"
    // para sempre, e a única saída era recarregar a página perdendo o que
    // tinha sido digitado.
    try {
      const payload = { ...toPayload(form), clinica_id: clinicaAtual.clinica_id };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = supabase.from(table as any) as any;
      const { data: ret, error } = editing
        ? await q.update(payload).eq("id", editing.id).select("id")
        : await q.insert(payload).select("id");
      if (error) {
        mostrarErro(error);
        return;
      }
      if (!ret || (Array.isArray(ret) && ret.length === 0)) {
        toast.error(
          editing
            ? "Sem permissão para alterar este registro. Verifique se você é admin/gestor desta clínica."
            : "Cadastro não foi salvo. Verifique se você tem permissão de admin/gestor nesta clínica.",
        );
        return;
      }
      toast.success(editing ? "Atualizado." : "Cadastrado.");
      setOpen(false);
      void load();
    } catch (e) {
      // Falha ao montar os dados do formulário. Não é erro do banco, então
      // `mostrarErro` diria algo sem sentido para quem está na recepção.
      console.error("[SimpleCrud] falha ao preparar o cadastro", e);
      toast.error("Não foi possível salvar. Confira os campos preenchidos, principalmente datas.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (r: T) => {
    if (readOnly) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setDeleting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table as any) as any).delete().eq("id", r.id);
    setDeleting(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Excluído.");
    setToDelete(null);
    void load();
  };

  return (
    <div className="space-y-6">
      {premium ? (
        <div className="flex items-center justify-between gap-3 mt-8 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary border border-primary/15 flex items-center justify-center">
              {icon}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={openNew}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2.5 rounded-xl shadow-2xs hover:shadow-xs transition-all flex items-center gap-2 text-xs"
            >
              <Plus className="h-4 w-4" /> {addLabel ?? "Novo"}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {icon} {title}
            </h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {!readOnly && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> {addLabel ?? "Novo"}
            </Button>
          )}
        </div>
      )}

      {searchFields && searchFields.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar…"
              className="pl-9"
            />
          </div>
        </div>
      )}

      <div
        className={
          premium
            ? "rounded-2xl border border-border/50 bg-card shadow-2xs overflow-hidden"
            : "rounded-lg border border-border bg-card overflow-hidden"
        }
      >
        <Table>
          <TableHeader>
            <TableRow
              className={
                premium
                  ? "bg-muted/30 border-b border-border/50 h-11 hover:bg-muted/30"
                  : "bg-muted/40"
              }
            >
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={`${premium ? "text-[12px] font-semibold uppercase tracking-wider text-muted-foreground " : ""}${c.className ?? ""}`}
                >
                  {c.header}
                </TableHead>
              ))}
              <TableHead
                className={`w-28 text-right${premium ? " text-[12px] font-semibold uppercase tracking-wider text-muted-foreground" : ""}`}
              >
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-center py-8 text-muted-foreground"
                >
                  Carregando…
                </TableCell>
              </TableRow>
            ) : !clinicaAtual ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-center py-8 text-muted-foreground"
                >
                  Selecione uma clínica.
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-center py-8 text-muted-foreground"
                >
                  Nenhum registro.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((r) => (
                <TableRow
                  key={r.id}
                  className={
                    premium
                      ? "hover:bg-muted/30 transition-colors h-14 border-b border-border/40"
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.render(r)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    {!readOnly &&
                      (premium ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Editar"
                            aria-label="Editar"
                            onClick={() => openEdit(r)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Excluir"
                            aria-label="Excluir"
                            onClick={() => setToDelete(r)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setToDelete(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`${dialogClassName ?? "max-w-2xl"} max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? (editLabel ?? `Editar ${title.toLowerCase()}`)
                : (newLabel ?? `Novo ${title.toLowerCase().replace(/s$/, "")}`)}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            {renderForm(form, setForm)}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) void onDelete(toDelete);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
