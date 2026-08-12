import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Stethoscope, Download, CalendarDays, MessageCircle,
  Power, PowerOff, Users, Filter, Check, Search,
} from "lucide-react";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/export-csv";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MedicoFormDialog } from "@/components/medicos/MedicoFormDialog";

export const Route = createFileRoute("/_authenticated/app/equipe/")({
  component: EquipePage,
  head: () => ({ meta: [{ title: "Médicos — ClinicaOS" }] }),
});

interface Medico {
  id: string;
  nome: string;
  crm: string | null;
  crm_uf: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  especialidades?: string[];
  pending?: boolean;
  user_id?: string;
}

const limparPrefixoMedico = (nome: string) =>
  nome.replace(/^(\s*(dr|dra)\.?\s+)+/i, "").trim();

const tituloCase = (nome: string) =>
  nome
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((p) =>
      ["de", "da", "do", "das", "dos", "e"].includes(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1),
    )
    .join(" ");

const iniciais = (nome: string) => {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1]![0] : "")).toUpperCase();
};

const formatarTelefone = (tel: string) => {
  const d = tel.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
};

const linkWhatsapp = (tel: string) => {
  const d = tel.replace(/\D/g, "");
  const comDDI = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${comDDI}`;
};

function KpiCard({
  label, value, icon: Icon, dot,
}: { label: string; value: number | string; icon: typeof Users; dot?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {dot && <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />}
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
    </Card>
  );
}

function EquipePage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("equipe");
  const navigate = useNavigate();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [medicoStatus, setMedicoStatus] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [medicoDialog, setMedicoDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [medicoPrefillNome, setMedicoPrefillNome] = useState<string | undefined>(undefined);
  const [medicoPrefillUserId, setMedicoPrefillUserId] = useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [espFiltro, setEspFiltro] = useState<string[]>([]);
  const [espBusca, setEspBusca] = useState("");

  useEffect(() => {
    if (!clinicaAtual) return;
    setLoading(true);
    void Promise.all([
      supabase
        .from("clinica_memberships")
        .select("id, user_id, role, ativo")
        .eq("clinica_id", clinicaAtual.clinica_id),
      supabase
        .from("medicos")
        .select("id, user_id, nome, crm, crm_uf, email, telefone, ativo")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("nome"),
    ]).then(async ([f, m]) => {
      const mems = (f.data ?? []) as Array<{ id: string; user_id: string; role: string; ativo: boolean }>;
      const medicosRaw = (m.data ?? []) as Array<{ user_id: string | null }>;
      const medicosUserIds = new Set(medicosRaw.map((x) => x.user_id).filter((x): x is string => !!x));
      
      // Buscar nomes dos usuários pendentes
      const idsMedicoPendente = Array.from(new Set(
        mems.filter((r) => r.role === "medico" && !medicosUserIds.has(r.user_id)).map((r) => r.user_id)
      ));
      const nomeMap = new Map<string, string>();
      if (idsMedicoPendente.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", idsMedicoPendente);
        (profs ?? []).forEach((p: any) => nomeMap.set(p.id, p.nome));
      }

      // Médicos pendentes (perfil médico sem cadastro completo)
      const medicosPendentes: Medico[] = mems
        .filter((r) => r.role === "medico" && !medicosUserIds.has(r.user_id))
        .map((r) => ({
          id: `pending-${r.user_id}`,
          nome: nomeMap.get(r.user_id) ?? "(sem nome)",
          crm: null,
          crm_uf: null,
          email: null,
          telefone: null,
          ativo: r.ativo,
          especialidades: [],
          pending: true,
          user_id: r.user_id,
        }));

      const medicosBase = ((m.data ?? []) as Medico[]).map((medico) => ({
        ...medico,
        nome: limparPrefixoMedico(medico.nome),
      }));
      
      // Buscar especialidades
      const medicoIds = medicosBase.map((x) => x.id);
      const espMap = new Map<string, string[]>();
      if (medicoIds.length) {
        const { data: vincs } = await supabase
          .from("medico_especialidades")
          .select("medico_id, especialidade:especialidades(nome)")
          .in("medico_id", medicoIds);
        for (const v of (vincs ?? []) as Array<{ medico_id: string; especialidade: { nome: string } | null }>) {
          const nome = v.especialidade?.nome;
          if (!nome) continue;
          const arr = espMap.get(v.medico_id) ?? [];
          if (!arr.includes(nome)) arr.push(nome);
          espMap.set(v.medico_id, arr);
        }
      }

      setMedicos([
        ...medicosBase.map((md) => ({
          ...md,
          especialidades: espMap.get(md.id) ?? [],
        })),
        ...medicosPendentes,
      ]);
      setLoading(false);
    });
  }, [clinicaAtual?.clinica_id, reloadKey]);

  const handleExport = () => {
    if (medicos.length === 0) {
      toast.info("Sem dados para exportar.");
      return;
    }
    exportToExcel(
      medicos.map((m) => ({
        nome: m.nome,
        crm: m.crm ? `${m.crm}/${m.crm_uf ?? ""}` : "",
        especialidades: (m.especialidades ?? []).join(", "),
        telefone: m.telefone ?? "",
        status: m.pending ? "Cadastro pendente" : m.ativo ? "Ativo" : "Inativo",
      })),
      `medicos-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: "nome", label: "Nome" },
        { key: "crm", label: "CRM" },
        { key: "especialidades", label: "Especialidades" },
        { key: "telefone", label: "Telefone" },
        { key: "status", label: "Status" },
      ],
    );
  };

  const novoMedico = () => {
    setMedicoPrefillNome(undefined);
    setMedicoPrefillUserId(undefined);
    setMedicoDialog({ open: true, id: null });
  };

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  const q = busca.trim().toLowerCase();
  const medicosPorStatus = medicos.filter((m) =>
    medicoStatus === "todos" ? true : medicoStatus === "ativos" ? m.ativo : !m.ativo
  );
  const medicosPorEsp = espFiltro.length
    ? medicosPorStatus.filter((m) => (m.especialidades ?? []).some((e) => espFiltro.includes(e)))
    : medicosPorStatus;
  const medicosFiltrados = q
    ? medicosPorEsp.filter((m) =>
        m.nome.toLowerCase().includes(q) ||
        (m.crm ?? "").includes(q) ||
        (m.especialidades?.some((e) => e.toLowerCase().includes(q)) ?? false)
      )
    : medicosPorEsp;
  const medicosAtivosCount = medicos.filter((m) => m.ativo).length;
  const medicosInativosCount = medicos.length - medicosAtivosCount;
  const todasEspecialidades = Array.from(
    new Set(medicos.flatMap((m) => m.especialidades ?? [])),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const especialidadesAtivas = new Set(
    medicos.filter((m) => m.ativo).flatMap((m) => m.especialidades ?? []),
  );

  const toggleAtivo = async (m: Medico) => {
    const ok = await confirmDialog({
      title: m.ativo ? "Inativar médico?" : "Reativar médico?",
      description: m.ativo
        ? `${tituloCase(m.nome)} deixará de aparecer nas listas de agendamento.`
        : `${tituloCase(m.nome)} voltará a ficar disponível para agendamentos.`,
      confirmText: m.ativo ? "Inativar" : "Reativar",
      tone: m.ativo ? "danger" : "default",
    });
    if (!ok) return;
    const { error } = await supabase.from("medicos").update({ ativo: !m.ativo }).eq("id", m.id);
    if (error) {
      toast.error("Não foi possível atualizar o médico.");
      return;
    }
    toast.success(m.ativo ? "Médico inativado." : "Médico reativado.");
    setReloadKey((k) => k + 1);
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Médicos</h1>
          <p className="text-sm text-muted-foreground">
            Médicos da clínica. Cadastre e gerencie os profissionais de saúde.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          {podeEscrever && (
            <Button onClick={novoMedico}>
              <Plus className="h-4 w-4 mr-2" /> Novo médico
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Médicos ativos" value={medicosAtivosCount} icon={Stethoscope} dot />
        <KpiCard label="Total cadastrados" value={medicos.length} icon={Users} />
        <KpiCard label="Especialidades" value={especialidadesAtivas.size} icon={Filter} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={medicoStatus} onValueChange={(v) => setMedicoStatus(v as typeof medicoStatus)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos ({medicosAtivosCount})</SelectItem>
              <SelectItem value="inativos">Inativos ({medicosInativosCount})</SelectItem>
              <SelectItem value="todos">Todos ({medicos.length})</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="h-4 w-4 mr-2" />
                Filtrar por especialidade
                {espFiltro.length > 0 && (
                  <Badge className="ml-2 h-5 px-1.5 text-[10px]">{espFiltro.length}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={espBusca}
                    onChange={(e) => setEspBusca(e.target.value)}
                    placeholder="Buscar especialidade..."
                    className="h-8 pl-7 text-sm"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {todasEspecialidades
                  .filter((e) => e.toLowerCase().includes(espBusca.trim().toLowerCase()))
                  .map((e) => {
                    const sel = espFiltro.includes(e);
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() =>
                          setEspFiltro((prev) => (sel ? prev.filter((x) => x !== e) : [...prev, e]))
                        }
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border",
                          sel ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}>
                          {sel && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{e}</span>
                      </button>
                    );
                  })}
                {todasEspecialidades.length === 0 && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Nenhuma especialidade cadastrada.</p>
                )}
              </div>
              {espFiltro.length > 0 && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setEspFiltro([])}>
                    Limpar filtro
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Buscar por nome, especialidade ou CRM..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full sm:w-64 h-9"
          />
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : medicosFiltrados.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" /> Nenhum médico encontrado.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Médico</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[130px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicosFiltrados.map((m) => {
                const esp = m.especialidades ?? [];
                const extras = esp.slice(2);
                return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {iniciais(m.nome)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">Dr(a). {tituloCase(m.nome)}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.crm ? `CRM ${m.crm}/${m.crm_uf ?? ""}` : "CRM não informado"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {esp.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[300px]">
                        {esp.slice(0, 2).map((e, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {e}
                          </Badge>
                        ))}
                        {extras.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="cursor-default text-xs">
                                +{extras.length} mais
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[240px]">{esp.join(" · ")}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-xs text-muted-foreground">Não informada</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.telefone ? (
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-muted-foreground">{formatarTelefone(m.telefone)}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={linkWhatsapp(m.telefone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-500/10"
                              aria-label="Abrir conversa no WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Conversar no WhatsApp</TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem contato</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.pending ? (
                      <Badge variant="destructive" className="text-xs">Cadastro pendente</Badge>
                    ) : m.ativo ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!m.pending && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" asChild className="h-8 w-8">
                              <Link to="/app/medico/$medicoId" params={{ medicoId: m.id }} aria-label="Ver agenda do médico">
                                <CalendarDays className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ver agenda do médico</TooltipContent>
                        </Tooltip>
                      )}
                      {podeEscrever && (
                        m.pending ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setMedicoPrefillNome(m.nome);
                                  setMedicoPrefillUserId(m.user_id);
                                  setMedicoDialog({ open: true, id: null });
                                }}
                                className="h-8 w-8"
                                aria-label="Completar cadastro"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Completar cadastro</TooltipContent>
                          </Tooltip>
                        ) : (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" asChild className="h-8 w-8">
                                  <Link to="/app/equipe/medico/$medicoId/editar" params={{ medicoId: m.id }} aria-label="Editar cadastro">
                                    <Pencil className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar cadastro</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className={cn("h-8 w-8", m.ativo ? "text-destructive" : "text-emerald-600")}
                                  onClick={() => void toggleAtivo(m)}
                                  aria-label={m.ativo ? "Inativar médico" : "Reativar médico"}
                                >
                                  {m.ativo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{m.ativo ? "Inativar médico" : "Reativar médico"}</TooltipContent>
                            </Tooltip>
                          </>
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {clinicaAtual && (
        <MedicoFormDialog
          open={medicoDialog.open}
          onOpenChange={(o) => setMedicoDialog((s) => ({ ...s, open: o }))}
          clinicaId={clinicaAtual.clinica_id}
          editingMedicoId={medicoDialog.id}
          prefillNome={medicoPrefillNome}
          prefillUserId={medicoPrefillUserId}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
    </TooltipProvider>
  );
}