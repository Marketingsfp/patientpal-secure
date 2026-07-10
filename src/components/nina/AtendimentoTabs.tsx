import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Play,
  Pause as PauseIcon,
  Users,
  BookOpen,
  Zap,
  Coffee,
  BarChart3,
} from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import {
  listarDepartamentos,
  salvarDepartamento,
  excluirDepartamento,
  listarMacros,
  salvarMacro,
  excluirMacro,
  listarKb,
  salvarKb,
  excluirKb,
  listarPauseReasons,
  salvarPauseReason,
  excluirPauseReason,
  iniciarPausa,
  finalizarPausa,
  pausaAtual,
  dashboardAtendimento,
  listarMembros,
  travarMinhaFila,
} from "@/lib/atendimento.functions";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

/* ============================================================
 * DASHBOARD
 * ========================================================== */
export function AtendDashboard() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const dashFn = useServerFn(dashboardAtendimento);
  const [m, setM] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      setM(await dashFn({ data: { clinicaId } }));
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, dashFn]);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15000);
    return () => clearInterval(t);
  }, [carregar]);
  useRealtimeRefresh(
    ["atend_conversas", "atend_pausas_log", "atend_departamento_membros"],
    carregar,
    !!clinicaId,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Painel de Atendimento — Hoje
        </CardTitle>
        <Button size="sm" variant="outline" onClick={carregar} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Metric label="Conversas hoje" value={m?.conversas_hoje ?? "—"} />
          <Metric label="Ativas" value={m?.ativas ?? "—"} tone="text-emerald-500" />
          <Metric label="Em espera" value={m?.em_espera ?? "—"} tone="text-amber-500" />
          <Metric label="Fechadas hoje" value={m?.fechadas_hoje ?? "—"} />
          <Metric label="CSAT" value={m?.csat_hoje ?? "—"} />
        </div>
      </CardContent>
    </Card>
  );
}
function Metric({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

/* ============================================================
 * DEPARTAMENTOS
 * ========================================================== */
export function AtendDepartamentos() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarDepartamentos);
  const salvar = useServerFn(salvarDepartamento);
  const excluir = useServerFn(excluirDepartamento);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      setRows(await listar({ data: { clinicaId } }));
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, listar]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  useRealtimeRefresh(["atend_departamentos", "atend_departamento_membros"], carregar, !!clinicaId);

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clinicaId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await salvar({
        data: {
          clinicaId,
          id: edit?.id,
          nome: String(fd.get("nome") || ""),
          descricao: String(fd.get("descricao") || "") || undefined,
          distribuicao: (fd.get("distribuicao") as any) || "manual",
          prioridade: Number(fd.get("prioridade") || 0),
          ativo: fd.get("ativo") === "on",
        },
      });
      toast.success("Departamento salvo");
      setOpen(false);
      setEdit(null);
      await carregar();
    } catch (err: any) {
      mostrarErro(err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Departamentos
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum departamento cadastrado.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{r.nome}</span>
                {!r.ativo && <Badge variant="outline">Inativo</Badge>}
                <Badge variant="secondary" className="text-xs">
                  {r.distribuicao}
                </Badge>
              </div>
              {r.descricao && (
                <div className="text-xs text-muted-foreground truncate">{r.descricao}</div>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEdit(r);
                  setOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Excluir departamento?")) return;
                  try {
                    await excluir({ data: { clinicaId: clinicaId!, id: r.id } });
                    await carregar();
                    toast.success("Excluído");
                  } catch (e: any) {
                    mostrarErro(e);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Editar" : "Novo"} departamento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSalvar} className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input name="nome" defaultValue={edit?.nome ?? ""} required maxLength={120} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea name="descricao" defaultValue={edit?.descricao ?? ""} maxLength={500} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Distribuição</Label>
                <Select name="distribuicao" defaultValue={edit?.distribuicao ?? "manual"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="round_robin">Round robin</SelectItem>
                    <SelectItem value="menor_carga">Menor carga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Input
                  name="prioridade"
                  type="number"
                  defaultValue={edit?.prioridade ?? 0}
                  min={0}
                  max={999}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch name="ativo" defaultChecked={edit?.ativo ?? true} />
              <Label>Ativo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================================================
 * MACROS
 * ========================================================== */
export function AtendMacros() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarMacros);
  const salvar = useServerFn(salvarMacro);
  const excluir = useServerFn(excluirMacro);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      setRows(await listar({ data: { clinicaId } }));
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, listar]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  useRealtimeRefresh(["atend_macros"], carregar, !!clinicaId);

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clinicaId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await salvar({
        data: {
          clinicaId,
          id: edit?.id,
          atalho: String(fd.get("atalho") || ""),
          titulo: String(fd.get("titulo") || ""),
          conteudo: String(fd.get("conteudo") || ""),
          ativo: fd.get("ativo") === "on",
        },
      });
      toast.success("Macro salva");
      setOpen(false);
      setEdit(null);
      await carregar();
    } catch (err: any) {
      mostrarErro(err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" /> Macros / Respostas Rápidas
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma macro. Use no chat com /atalho.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between rounded-lg border p-3 gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/{r.atalho}</code>
                <span className="font-medium truncate">{r.titulo}</span>
                {!r.ativo && <Badge variant="outline">Inativa</Badge>}
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2 mt-1">
                {r.conteudo}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEdit(r);
                  setOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Excluir macro?")) return;
                  try {
                    await excluir({ data: { clinicaId: clinicaId!, id: r.id } });
                    await carregar();
                    toast.success("Excluída");
                  } catch (e: any) {
                    mostrarErro(e);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Editar" : "Nova"} macro</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSalvar} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label>Atalho *</Label>
                <Input
                  name="atalho"
                  defaultValue={edit?.atalho ?? ""}
                  required
                  maxLength={40}
                  placeholder="ola"
                  pattern="[a-zA-Z0-9_-]+"
                />
              </div>
              <div className="col-span-2">
                <Label>Título *</Label>
                <Input name="titulo" defaultValue={edit?.titulo ?? ""} required maxLength={120} />
              </div>
<<<<<<< HEAD
=======
              <div className="sm:col-span-2"><Label>Título *</Label><Input name="titulo" defaultValue={edit?.titulo ?? ""} required maxLength={120} /></div>
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
            </div>
            <div>
              <Label>Conteúdo *</Label>
              <Textarea
                name="conteudo"
                defaultValue={edit?.conteudo ?? ""}
                required
                maxLength={4000}
                rows={6}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch name="ativo" defaultChecked={edit?.ativo ?? true} />
              <Label>Ativa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================================================
 * BASE DE CONHECIMENTO (KB)
 * ========================================================== */
export function AtendKb() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarKb);
  const salvar = useServerFn(salvarKb);
  const excluir = useServerFn(excluirKb);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      setRows(await listar({ data: { clinicaId } }));
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, listar]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  useRealtimeRefresh(["atend_kb"], carregar, !!clinicaId);

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clinicaId) return;
    const fd = new FormData(e.currentTarget);
    const tags = String(fd.get("tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await salvar({
        data: {
          clinicaId,
          id: edit?.id,
          titulo: String(fd.get("titulo") || ""),
          conteudo: String(fd.get("conteudo") || ""),
          categoria: String(fd.get("categoria") || "") || undefined,
          tags,
          publicado: fd.get("publicado") === "on",
        },
      });
      toast.success("Artigo salvo");
      setOpen(false);
      setEdit(null);
      await carregar();
    } catch (err: any) {
      mostrarErro(err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Base de Conhecimento
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum artigo. A Nina usa esses artigos para responder dúvidas.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between rounded-lg border p-3 gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{r.titulo}</span>
                {r.categoria && <Badge variant="secondary">{r.categoria}</Badge>}
                {!r.publicado && <Badge variant="outline">Rascunho</Badge>}
                {(r.tags ?? []).map((t: string) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-1 whitespace-pre-wrap">
                {r.conteudo}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEdit(r);
                  setOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Excluir artigo?")) return;
                  try {
                    await excluir({ data: { clinicaId: clinicaId!, id: r.id } });
                    await carregar();
                    toast.success("Excluído");
                  } catch (e: any) {
                    mostrarErro(e);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{edit ? "Editar" : "Novo"} artigo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSalvar} className="space-y-3">
            <div>
              <Label>Título *</Label>
              <Input name="titulo" defaultValue={edit?.titulo ?? ""} required maxLength={200} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Input name="categoria" defaultValue={edit?.categoria ?? ""} maxLength={80} />
              </div>
              <div>
                <Label>Tags (separadas por vírgula)</Label>
                <Input name="tags" defaultValue={(edit?.tags ?? []).join(", ")} />
              </div>
            </div>
            <div>
              <Label>Conteúdo *</Label>
              <Textarea
                name="conteudo"
                defaultValue={edit?.conteudo ?? ""}
                required
                rows={10}
                maxLength={20000}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch name="publicado" defaultChecked={edit?.publicado ?? true} />
              <Label>Publicado</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================================================
 * PAUSAS — motivos + minha pausa atual
 * ========================================================== */
export function AtendPausas() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarPauseReasons);
  const salvar = useServerFn(salvarPauseReason);
  const excluir = useServerFn(excluirPauseReason);
  const iniciar = useServerFn(iniciarPausa);
  const finalizar = useServerFn(finalizarPausa);
  const atualFn = useServerFn(pausaAtual);

  const [rows, setRows] = useState<any[]>([]);
  const [atual, setAtual] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const [r, a] = await Promise.all([
        listar({ data: { clinicaId } }),
        atualFn({ data: { clinicaId } }),
      ]);
      setRows(r);
      setAtual(a);
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, listar, atualFn]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  useRealtimeRefresh(["atend_pause_reasons", "atend_pausas_log"], carregar, !!clinicaId);

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clinicaId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await salvar({
        data: {
          clinicaId,
          id: edit?.id,
          nome: String(fd.get("nome") || ""),
          cor: String(fd.get("cor") || "#6b7280"),
          icone: String(fd.get("icone") || "") || undefined,
          tolerancia_minutos: Number(fd.get("tolerancia") || 5),
          conta_trabalhado: fd.get("conta_trabalhado") === "on",
          ativo: fd.get("ativo") === "on",
        },
      });
      toast.success("Motivo salvo");
      setOpen(false);
      setEdit(null);
      await carregar();
    } catch (err: any) {
      mostrarErro(err);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5" /> Minha pausa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {atual ? (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: atual.atend_pause_reasons?.cor ?? "#6b7280" }}
                  />
                  <span className="font-medium">{atual.atend_pause_reasons?.nome ?? "Pausa"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Iniciada em {new Date(atual.iniciada_em).toLocaleString("pt-BR")}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await finalizar({ data: { clinicaId: clinicaId! } });
                    toast.success("Pausa finalizada");
                    await carregar();
                  } catch (e: any) {
                    mostrarErro(e);
                  }
                }}
              >
                <PauseIcon className="h-4 w-4 mr-1" /> Finalizar
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {rows
                .filter((r) => r.ativo)
                .map((r) => (
                  <Button
                    key={r.id}
                    variant="outline"
                    className="justify-start"
                    onClick={async () => {
                      try {
                        await iniciar({ data: { clinicaId: clinicaId!, reasonId: r.id } });
                        toast.success("Pausa iniciada");
                        await carregar();
                      } catch (e: any) {
                        mostrarErro(e);
                      }
                    }}
                  >
                    <Play className="h-4 w-4 mr-2" style={{ color: r.cor }} />
                    {r.nome}
                  </Button>
                ))}
              {rows.filter((r) => r.ativo).length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">
                  Nenhum motivo de pausa cadastrado.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Motivos de pausa</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum motivo cadastrado.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block h-3 w-3 rounded-full shrink-0"
                  style={{ background: r.cor }}
                />
                <span className="font-medium truncate">{r.nome}</span>
                <Badge variant="secondary" className="text-xs">
                  {r.tolerancia_minutos} min
                </Badge>
                {r.conta_trabalhado && (
                  <Badge variant="outline" className="text-xs">
                    Conta trabalhado
                  </Badge>
                )}
                {!r.ativo && <Badge variant="outline">Inativo</Badge>}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEdit(r);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("Excluir motivo?")) return;
                    try {
                      await excluir({ data: { clinicaId: clinicaId!, id: r.id } });
                      await carregar();
                      toast.success("Excluído");
                    } catch (e: any) {
                      mostrarErro(e);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Editar" : "Novo"} motivo de pausa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSalvar} className="space-y-3">
<<<<<<< HEAD
            <div>
              <Label>Nome *</Label>
              <Input name="nome" defaultValue={edit?.nome ?? ""} required maxLength={80} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Cor</Label>
                <Input name="cor" type="color" defaultValue={edit?.cor ?? "#6b7280"} />
              </div>
              <div>
                <Label>Ícone</Label>
                <Input
                  name="icone"
                  defaultValue={edit?.icone ?? ""}
                  maxLength={40}
                  placeholder="coffee"
                />
              </div>
              <div>
                <Label>Tolerância (min)</Label>
                <Input
                  name="tolerancia"
                  type="number"
                  min={0}
                  max={480}
                  defaultValue={edit?.tolerancia_minutos ?? 5}
                />
              </div>
=======
            <div><Label>Nome *</Label><Input name="nome" defaultValue={edit?.nome ?? ""} required maxLength={80} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>Cor</Label><Input name="cor" type="color" defaultValue={edit?.cor ?? "#6b7280"} /></div>
              <div><Label>Ícone</Label><Input name="icone" defaultValue={edit?.icone ?? ""} maxLength={40} placeholder="coffee" /></div>
              <div><Label>Tolerância (min)</Label><Input name="tolerancia" type="number" min={0} max={480} defaultValue={edit?.tolerancia_minutos ?? 5} /></div>
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch name="conta_trabalhado" defaultChecked={edit?.conta_trabalhado ?? false} />
                <Label>Conta como trabalhado</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch name="ativo" defaultChecked={edit?.ativo ?? true} />
                <Label>Ativo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
 * MEU STATUS — abrir/fechar filas + pausa rápida
 * ========================================================== */
export function AtendMeuStatus() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listarMembrosFn = useServerFn(listarMembros);
  const travarFn = useServerFn(travarMinhaFila);
  const listarDeptos = useServerFn(listarDepartamentos);
  const listarReasons = useServerFn(listarPauseReasons);
  const iniciar = useServerFn(iniciarPausa);
  const finalizar = useServerFn(finalizarPausa);
  const atualFn = useServerFn(pausaAtual);

  const [meusMembros, setMeusMembros] = useState<any[]>([]);
  const [deptos, setDeptos] = useState<any[]>([]);
  const [reasons, setReasons] = useState<any[]>([]);
  const [atual, setAtual] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [todos, ds, rs, a] = await Promise.all([
        listarMembrosFn({ data: { clinicaId } }),
        listarDeptos({ data: { clinicaId } }),
        listarReasons({ data: { clinicaId } }),
        atualFn({ data: { clinicaId } }),
      ]);
      setMeusMembros((todos as any[]).filter((m) => m.user_id === user?.id));
      setDeptos(ds);
      setReasons(rs);
      setAtual(a);
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, listarMembrosFn, listarDeptos, listarReasons, atualFn]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  useRealtimeRefresh(
    [
      "atend_pausas_log",
      "atend_departamento_membros",
      "atend_pause_reasons",
      "atend_departamentos",
    ],
    carregar,
    !!clinicaId,
  );

  const toggleFila = async (travada: boolean) => {
    if (!clinicaId) return;
    try {
      await travarFn({ data: { clinicaId, travada } });
      toast.success(
        travada
          ? "Fila fechada — você não receberá novos atendimentos"
          : "Fila aberta — pronto para receber",
      );
      await carregar();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const deptoNome = (id: string) => deptos.find((d) => d.id === id)?.nome ?? id;
  const algumaFechada = meusMembros.some((m) => m.queue_locked);
  const todasFechadas = meusMembros.length > 0 && meusMembros.every((m) => m.queue_locked);

  return (
    <div className="space-y-4">
      {/* ============ FILAS ============ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Minhas filas de atendimento
          </CardTitle>
          <Badge variant={todasFechadas ? "destructive" : algumaFechada ? "secondary" : "default"}>
            {todasFechadas ? "Todas fechadas" : algumaFechada ? "Parcialmente aberta" : "Aberta"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {meusMembros.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você não está em nenhum departamento. Peça a um gestor para adicioná-lo.
            </p>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={algumaFechada ? "default" : "outline"}
                  onClick={() => toggleFila(false)}
                  disabled={loading || !algumaFechada}
                >
                  <Play className="h-4 w-4 mr-1" /> Abrir todas
                </Button>
                <Button
                  size="sm"
                  variant={todasFechadas ? "outline" : "destructive"}
                  onClick={() => toggleFila(true)}
                  disabled={loading || todasFechadas}
                >
                  <PauseIcon className="h-4 w-4 mr-1" /> Fechar todas
                </Button>
              </div>
              <div className="space-y-2">
                {meusMembros.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{deptoNome(m.departamento_id)}</div>
                      <div className="text-xs text-muted-foreground">
                        Papel: {m.role} · {m.queue_locked ? "Fila fechada" : "Recebendo novos"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!m.queue_locked}
                        onCheckedChange={async (open) => {
                          if (!clinicaId) return;
                          try {
                            // Atualiza só este departamento
                            const { error } = await supabase
                              .from("atend_departamento_membros" as any)
                              .update({ queue_locked: !open })
                              .eq("id", m.id);
                            if (error) throw error;
                            toast.success(open ? "Fila aberta" : "Fila fechada");
                            await carregar();
                          } catch (e: any) {
                            mostrarErro(e);
                          }
                        }}
                      />
                      <span className="text-xs text-muted-foreground w-16 text-right">
                        {m.queue_locked ? "Fechada" : "Aberta"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ============ PAUSA ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5" /> Minha pausa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {atual ? (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: atual.atend_pause_reasons?.cor ?? "#6b7280" }}
                  />
                  <span className="font-medium">{atual.atend_pause_reasons?.nome ?? "Pausa"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Iniciada em {new Date(atual.iniciada_em).toLocaleString("pt-BR")}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await finalizar({ data: { clinicaId: clinicaId! } });
                    toast.success("Pausa finalizada");
                    await carregar();
                  } catch (e: any) {
                    mostrarErro(e);
                  }
                }}
              >
                <PauseIcon className="h-4 w-4 mr-1" /> Finalizar pausa
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {reasons
                .filter((r) => r.ativo)
                .map((r) => (
                  <Button
                    key={r.id}
                    variant="outline"
                    className="justify-start"
                    onClick={async () => {
                      try {
                        await iniciar({ data: { clinicaId: clinicaId!, reasonId: r.id } });
                        toast.success("Pausa iniciada");
                        await carregar();
                      } catch (e: any) {
                        mostrarErro(e);
                      }
                    }}
                  >
                    <Play className="h-4 w-4 mr-2" style={{ color: r.cor }} />
                    {r.nome}
                  </Button>
                ))}
              {reasons.filter((r) => r.ativo).length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">
                  Nenhum motivo de pausa cadastrado. Cadastre em{" "}
                  <strong>Atendimento — Pausas</strong>.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
