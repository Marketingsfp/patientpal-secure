import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Users, Download, Eye, IdCard, RefreshCw, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { confirmDialog } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClienteForm } from "@/components/clientes/cliente-form";
import { EditarClienteDialog } from "@/components/clientes/editar-cliente-dialog";
import { IdadeIcon, calcIdadeAnos } from "@/components/idade-icon";
import { ClientesShellV2 } from "@/components/clientes-v2/clientes-shell";
import { useClientesV2Flag } from "@/hooks/use-clientes-v2-flag";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { useClinica as useClinicaGate } from "@/hooks/use-clinica";

export const Route = createFileRoute("/_authenticated/app/clientes/")({
  component: ClientesPageGate,
  head: () => ({ meta: [{ title: "Clientes — ClinicaOS" }] }),
});

/**
 * Gate de promoção do Clientes V2 (mantendo o clássico como fallback).
 *
 * Regras (aprovadas pelo usuário):
 * - Somente `admin` e `gestor` recebem o V2.
 * - Feature flag `clientes_v2` continua ligada por usuário (opt-in).
 * - Recepção, caixa, médico, enfermeiro, financeiro e qualquer outro papel
 *   permanecem no clássico — sem exceção.
 * - Enquanto o role/flag carrega, mostramos o clássico (fail-safe).
 * - Rollback imediato: basta desligar a flag no perfil.
 *
 * A promoção é apenas de UI: nenhum dado é escrito, migrado, normalizado
 * ou recalculado. Campos legados (prontuário, pasta, ficha) continuam
 * somente-leitura no V2, conforme política de dados imutáveis.
 */
function ClientesPageGate() {
  const { clinicaAtual } = useClinicaGate();
  const { enabled, loading: flagLoading } = useClientesV2Flag();
  const role = clinicaAtual?.role ?? null;
  const elegivel = role === "admin" || role === "gestor";

  if (!clinicaAtual || flagLoading) return <ClientesPage />;
  if (elegivel && enabled) return <ClientesV2Wrapper />;
  return <ClientesPage />;
}

function ClientesV2Wrapper() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { prefs } = await getPreferenciasUi();
      const p = prefs as { clientes?: { compact?: boolean } };
      if (alive && typeof p.clientes?.compact === "boolean") setCompact(p.clientes.compact);
    })();
    return () => { alive = false; };
  }, []);
  const persistCompact = async (v: boolean) => {
    setCompact(v);
    await updatePreferenciasUi((prev) => ({
      ...prev,
      clientes: { ...((prev.clientes as object) ?? {}), compact: v },
    }));
  };
  return (
    <div className="h-[calc(100vh-64px)] -mx-3 -mt-1 -mb-3 sm:-mx-4 sm:-mt-1.5 sm:-mb-4 lg:-mx-6 lg:-mt-2 lg:-mb-6">
      <ClientesShellV2 compactPref={compact} onToggleCompact={(v) => void persistCompact(v)} />
    </div>
  );
}

function fmtNasc(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}

function IdadeCell({ nascimento }: { nascimento: string | null }) {
  const idade = calcIdadeAnos(nascimento);
  if (idade === null || idade < 0) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{idade} {idade === 1 ? "ano" : "anos"}</span>
      <IdadeIcon nascimento={nascimento} size={20} />
    </span>
  );
}

interface Paciente {
  id: string;
  nome: string;
  cpf: string | null;
  numero_pasta: string | null;
  codigo_prontuario: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  ativo: boolean;
  cidade: string | null;
  estado: string | null;
  created_at: string;
  foto_url?: string | null;
}

/** Formatação de exibição do CPF — não altera o dado armazenado. */
function formatCPF(valor: string | null | undefined): string {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (!digitos) return "—";
  if (digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }
  return valor ?? "—";
}

/** Formatação de exibição do telefone — não altera o dado armazenado. */
function formatPhone(valor: string | null | undefined): string {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (!digitos) return "—";
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return valor ?? "—";
}



function ClientesPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("clientes");
  // Cache de dados (React Query) — só São Francisco de Paula. Desligada,
  // segue 100% no caminho manual abaixo (idêntico ao comportamento anterior).
  const { enabled: uxMelhorias } = useClinicFeatureFlag("ux_melhorias");
  const [itemsManual, setItemsManual] = useState<Paciente[]>([]);
  const [totalPacientesManual, setTotalPacientesManual] = useState<number | null>(null);
  const [atingiuTetoManual, setAtingiuTetoManual] = useState(false);
  const [busca, setBusca] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? "";
  });
  const [loadingManual, setLoadingManual] = useState(false);
  const [openNovo, setOpenNovo] = useState(false);
  const loadSeq = useRef(0);

  const [fotoSigned, setFotoSigned] = useState<Record<string, string>>({});

  const LIMITE_BUSCA = 500;
  const LIMITE_LISTA = 500;

  const loadManual = async (termo: string = "") => {
    if (!clinicaAtual) return;
    const requestId = ++loadSeq.current;
    setLoadingManual(true);
    const q = termo.trim();
    if (q && q.length < 3 && q.replace(/\D/g, "").length < 3) {
      setItemsManual([]);
      setLoadingManual(false);
      return;
    }
    try {
      const dataRequest = supabase.rpc("buscar_pacientes", {
        _clinica_id: clinicaAtual.clinica_id,
        _termo: q,
        _limit: q ? LIMITE_BUSCA : LIMITE_LISTA,
      });
      const countRequest = q
        ? Promise.resolve({ count: totalPacientesManual, error: null })
        : supabase
          .from("pacientes")
          .select("id", { count: "exact", head: true })
          .eq("clinica_id", clinicaAtual.clinica_id);
      const [{ data, error }, { count, error: countError }] = await Promise.all([dataRequest, countRequest]);
      if (requestId !== loadSeq.current) return;
      setLoadingManual(false);
      if (error) { toast.error("Não foi possível concluir esta busca. Tente novamente com mais letras do nome."); return; }
      if (countError) { mostrarErro(countError); } else { setTotalPacientesManual(count ?? 0); }
      const rows = (data ?? []) as any[];
      setItemsManual(rows as any);
      setAtingiuTetoManual(rows.length >= (q ? LIMITE_BUSCA : LIMITE_LISTA));
    } catch {
      if (requestId !== loadSeq.current) return;
      setLoadingManual(false);
      toast.error("Não foi possível concluir esta busca. Tente novamente com mais letras do nome.");
    }
  };

  // Debounce único da busca, usado pelos dois caminhos (manual e cache).
  const [debouncedBusca, setDebouncedBusca] = useState(busca);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBusca(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Página atual (paginação de 500 em 500) — apenas usada no caminho
  // com cache (São Francisco de Paula via flag `ux_melhorias`) e somente
  // quando não há termo de busca. Ao buscar por nome/CPF/telefone o
  // filtro roda no banco todo em uma página só.
  const [pagina, setPagina] = useState(0);
  useEffect(() => { setPagina(0); }, [debouncedBusca]);

  // Caminho manual (sem a flag): idêntico ao comportamento anterior.
  useEffect(() => {
    if (!clinicaAtual || uxMelhorias) return;
    void loadManual(debouncedBusca);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [debouncedBusca, clinicaAtual?.clinica_id, uxMelhorias]);

  // Caminho com cache (só São Francisco): staleTime de 60s — revisitar a
  // tela com o mesmo termo mostra os dados na hora e revalida em segundo
  // plano, sem piscar o skeleton de novo.
  const clinicaId = clinicaAtual?.clinica_id;
  const totalQuery = useQuery({
    queryKey: ["clientes-total", clinicaId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pacientes")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", clinicaId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: uxMelhorias && !!clinicaId,
    staleTime: 60_000,
  });
  const listaQuery = useQuery({
    queryKey: ["clientes-lista", clinicaId, debouncedBusca, pagina],
    queryFn: async () => {
      const q = debouncedBusca.trim();
      if (q && q.length < 3 && q.replace(/\D/g, "").length < 3) {
        return { items: [] as Paciente[], atingiuTeto: false };
      }
      const { data, error } = await supabase.rpc("buscar_pacientes", {
        _clinica_id: clinicaId!,
        _termo: q,
        _limit: q ? LIMITE_BUSCA : LIMITE_LISTA,
        _offset: q ? 0 : pagina * LIMITE_LISTA,
      } as any);
      if (error) throw error;
      const rows = (data ?? []) as Paciente[];
      return { items: rows, atingiuTeto: rows.length >= (q ? LIMITE_BUSCA : LIMITE_LISTA) };
    },
    enabled: uxMelhorias && !!clinicaId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (listaQuery.error) toast.error("Não foi possível concluir esta busca. Tente novamente com mais letras do nome.");
  }, [listaQuery.error]);
  useEffect(() => {
    if (totalQuery.error) mostrarErro(totalQuery.error);
  }, [totalQuery.error]);

  const items = uxMelhorias ? (listaQuery.data?.items ?? []) : itemsManual;
  const totalPacientes = uxMelhorias ? (totalQuery.data ?? null) : totalPacientesManual;
  const atingiuTeto = uxMelhorias ? (listaQuery.data?.atingiuTeto ?? false) : atingiuTetoManual;
  const loading = uxMelhorias ? listaQuery.isLoading : loadingManual;

  const queryClient = useQueryClient();
  const [editarId, setEditarId] = useState<string | null>(null);
  const refrescar = () => {
    if (uxMelhorias) {
      void queryClient.invalidateQueries({ queryKey: ["clientes-lista", clinicaId] });
      void queryClient.invalidateQueries({ queryKey: ["clientes-total", clinicaId] });
    } else {
      void loadManual(busca);
    }
  };

  // Chave estável baseada apenas em foto_url (não em items completo).
  // Evita re-executar createSignedUrls a cada re-render/digitação, o que
  // travava a rolagem quando havia muitas fotos.
  const fotoPathsKey = items
    .map((p) => (p.foto_url ? `${p.id}::${p.foto_url}` : ""))
    .filter(Boolean)
    .join("|");
  useEffect(() => {
    if (!fotoPathsKey) { setFotoSigned({}); return; }
    const entries = fotoPathsKey.split("|").map((s) => {
      const [id, ...rest] = s.split("::");
      return { id, path: rest.join("::") };
    });
    const paths = entries.map((e) => e.path);
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from("pacientes-fotos").createSignedUrls(paths, 3600);
      if (cancelled) return;
      const map: Record<string, string> = {};
      entries.forEach((e) => {
        const found = data?.find((d) => d.path === e.path);
        if (found?.signedUrl) map[e.id] = found.signedUrl;
      });
      setFotoSigned(map);
    })();
    return () => { cancelled = true; };
  }, [fotoPathsKey]);

  const filtrados = items;

  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [excluindoLote, setExcluindoLote] = useState(false);
  const excluirCliente = async (p: Paciente) => {
    const ok = await confirmDialog({
      title: "Excluir cliente",
      description: `Tem certeza que deseja excluir "${p.nome}"? Esta ação não pode ser desfeita.`,
      tone: "danger",
      confirmText: "Excluir",
    });
    if (!ok) return;
    setExcluindoId(p.id);
    const { error } = await supabase.from("pacientes").delete().eq("id", p.id);
    setExcluindoId(null);
    if (error) {
      if ((error as { code?: string }).code === "23503") {
        toast.error("Este cliente possui registros vinculados (agendamentos, financeiro ou prontuário) e não pode ser excluído.");
      } else {
        mostrarErro(error);
      }
      return;
    }
    setItemsManual((cur) => cur.filter((x) => x.id !== p.id));
    setSelecionados((cur) => cur.filter((id) => id !== p.id));
    toast.success("Cliente excluído.");
    refrescar();
  };

  const excluirSelecionados = async () => {
    if (selecionados.length === 0) return;
    const ok = await confirmDialog({
      title: `Excluir ${selecionados.length} cliente(s)`,
      description: `Tem certeza que deseja excluir ${selecionados.length} cliente(s) selecionado(s)? Esta ação não pode ser desfeita.`,
      tone: "danger",
      confirmText: "Excluir selecionados",
    });
    if (!ok) return;
    setExcluindoLote(true);
    const excluidos: string[] = [];
    let bloqueados = 0;
    for (const id of selecionados) {
      const { error } = await supabase.from("pacientes").delete().eq("id", id);
      if (error) {
        if ((error as { code?: string }).code === "23503") bloqueados++;
        else { mostrarErro(error); break; }
      } else {
        excluidos.push(id);
      }
    }
    setExcluindoLote(false);
    if (excluidos.length > 0) {
      setItemsManual((cur) => cur.filter((x) => !excluidos.includes(x.id)));
      toast.success(`${excluidos.length} cliente(s) excluído(s).`);
    }
    if (bloqueados > 0) {
      toast.error(`${bloqueados} cliente(s) possuem registros vinculados e não puderam ser excluídos.`);
    }
    setSelecionados([]);
    refrescar();
  };

  // Convênios ativos dos pacientes visíveis (Cartão Benefícios).
  // Exibimos um badge ao lado do nome, no mesmo padrão da busca da agenda.
  const idsKey = filtrados.map(p => p.id).sort().join(",");
  const conveniosQuery = useQuery({
    queryKey: ["clientes-convenios", clinicaId, idsKey],
    enabled: !!clinicaId && filtrados.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const ids = filtrados.map(p => p.id);
      const map = new Map<string, { tipo: "titular" | "dependente"; convenio: string }>();
      const [titRes, depRes] = await Promise.all([
        supabase
          .from("contratos_assinatura")
          .select("paciente_id, convenio_id")
          .eq("clinica_id", clinicaId!)
          .eq("status", "ativo")
          .in("paciente_id", ids),
        supabase
          .from("contrato_dependentes")
          .select("paciente_id, contrato:contratos_assinatura!inner(convenio_id, status, clinica_id)")
          .eq("ativo", true)
          .eq("contrato.status", "ativo")
          .eq("contrato.clinica_id", clinicaId!)
          .in("paciente_id", ids),
      ]);
      const convenioIds = new Set<string>();
      (titRes.data ?? []).forEach((r: any) => { if (r.convenio_id) convenioIds.add(r.convenio_id); });
      (depRes.data ?? []).forEach((r: any) => { if (r.contrato?.convenio_id) convenioIds.add(r.contrato.convenio_id); });
      const planos = new Map<string, string>();
      if (convenioIds.size > 0) {
        const { data: pls } = await supabase
          .from("cb_convenios")
          .select("id, nome")
          .in("id", Array.from(convenioIds));
        (pls ?? []).forEach((p: any) => planos.set(p.id, p.nome));
      }
      // Dependentes primeiro; titular sobrescreve (prioridade).
      (depRes.data ?? []).forEach((r: any) => {
        if (!r.paciente_id) return;
        const nome = r.contrato?.convenio_id ? planos.get(r.contrato.convenio_id) : undefined;
        if (!nome) return;
        map.set(r.paciente_id, { tipo: "dependente", convenio: nome });
      });
      (titRes.data ?? []).forEach((r: any) => {
        if (!r.paciente_id) return;
        const nome = r.convenio_id ? planos.get(r.convenio_id) : undefined;
        if (!nome) return;
        map.set(r.paciente_id, { tipo: "titular", convenio: nome });
      });
      return map;
    },
  });
  const convenios = conveniosQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Users className="h-4.5 w-4.5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clientes</h1>
          {totalPacientes !== null && (
            <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap">
              {totalPacientes.toLocaleString("pt-BR")} {totalPacientes === 1 ? "paciente" : "pacientes"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Atualizar lista de clientes"
            title="Atualizar contagem e lista"
            onClick={refrescar}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            className="inline-flex items-center border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold px-3.5 py-2 shadow-xs transition-colors"
            onClick={async () => {
              if (!clinicaAtual) return;
              const PAGE = 1000;
              const all: any[] = [];
              const toastId = toast.loading("Exportando clientes…");
              try {
                for (let from = 0; ; from += PAGE) {
                  const { data, error } = await supabase
                    .from("pacientes")
                    .select("nome,cpf,telefone,email,data_nascimento,cidade,estado,bairro,logradouro,numero,cep,ativo,codigo_prontuario,numero_pasta")
                    .eq("clinica_id", clinicaAtual.clinica_id)
                    .order("nome")
                    .range(from, from + PAGE - 1);
                  if (error) { toast.dismiss(toastId); mostrarErro(error); return; }
                  const rows = data ?? [];
                  all.push(...rows);
                  toast.loading(`Exportando clientes… (${all.length})`, { id: toastId });
                  if (rows.length < PAGE) break;
                }
              } catch (e) {
                toast.dismiss(toastId);
                toast.error("Falha ao exportar clientes.");
                return;
              }
              toast.dismiss(toastId);
              if (!all.length) { toast.info("Sem dados para exportar."); return; }
              exportToExcel(
                all.map((p: any) => ({
                  prontuario: p.codigo_prontuario ?? "",
                  pasta: p.numero_pasta ?? "",
                  nome: p.nome,
                  cpf: p.cpf ?? "",
                  telefone: p.telefone ?? "",
                  email: p.email ?? "",
                  nascimento: p.data_nascimento ?? "",
                  cidade_uf: p.cidade ? `${p.cidade}${p.estado ? "/" + p.estado : ""}` : "",
                  bairro: p.bairro ?? "",
                  endereco: [p.logradouro, p.numero].filter(Boolean).join(", "),
                  cep: p.cep ?? "",
                  ativo: p.ativo ? "Sim" : "Não",
                })),
                `clientes-${new Date().toISOString().slice(0, 10)}`,
                [
                  { key: "prontuario", label: "Prontuário" },
                  { key: "pasta", label: "Nº Serviço" },
                  { key: "nome", label: "Nome" },
                  { key: "cpf", label: "CPF" },
                  { key: "telefone", label: "Telefone" },
                  { key: "email", label: "E-mail" },
                  { key: "nascimento", label: "Nascimento" },
                  { key: "cidade_uf", label: "Cidade/UF" },
                  { key: "bairro", label: "Bairro" },
                  { key: "endereco", label: "Endereço" },
                  { key: "cep", label: "CEP" },
                  { key: "ativo", label: "Ativo" },
                ],
              );
              toast.success(`${all.length} clientes exportados.`);
            }}
          >
            <Download className="h-4 w-4 mr-1.5" /> Exportar Excel
          </button>
          {podeEscrever && (
            <button
              type="button"
              onClick={() => setOpenNovo(true)}
              className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Novo cliente
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200/80 p-3.5 rounded-xl shadow-xs mt-4 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nº serviço, nome, CPF, telefone, e-mail ou nascimento (dd/mm/aaaa)…"
            className="pl-9 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 h-10 w-full focus-visible:ring-1 focus-visible:ring-indigo-500"
          />
        </div>
      </div>

      {atingiuTeto && !(uxMelhorias && !debouncedBusca.trim()) && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          Mostrando os primeiros {LIMITE_BUSCA.toLocaleString("pt-BR")} resultados. Refine a busca (nome completo, CPF ou telefone) para ver mais.
        </div>
      )}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden mt-4">
        <Table containerClassName="max-h-[70vh]" className="max-lg:table max-lg:overflow-visible">
          <TableHeader className="sticky top-0 z-20">
            <TableRow className="bg-slate-50/80 border-b border-slate-200/80 [&>th]:text-[11px] [&>th]:font-bold [&>th]:text-slate-500 [&>th]:uppercase [&>th]:tracking-wider">
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Selecionar todos"
                  checked={filtrados.length > 0 && selecionados.length === filtrados.length
                    ? true
                    : selecionados.length > 0 ? "indeterminate" : false}
                  onCheckedChange={(v: boolean | "indeterminate") => setSelecionados(v ? filtrados.map((p) => p.id) : [])}
                />
              </TableHead>
              <TableHead className="w-28">Prontuário</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-36">CPF</TableHead>
              <TableHead className="w-32">Nascimento</TableHead>
              <TableHead className="w-28">Idade</TableHead>
              <TableHead className="w-36">Telefone</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-40 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeletonRows
                cols={9}
                fallback={<TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
              />
            ) : !clinicaAtual ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState
                    icon={<Users className="h-10 w-10" />}
                    titulo="Nenhum cliente encontrado."
                    descricao={busca.trim() ? "Tente refinar a busca — nome completo, CPF ou telefone." : "Cadastre o primeiro cliente desta clínica."}
                    acao={podeEscrever && !busca.trim() ? (
                      <Button size="sm" onClick={() => setOpenNovo(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Novo cliente
                      </Button>
                    ) : undefined}
                    fallback={<div className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</div>}
                  />
                </TableCell>
              </TableRow>
            ) : filtrados.map(p => (
              <TableRow key={p.id} className="h-12 hover:bg-slate-50/60 transition-colors border-b border-slate-100" data-state={selecionados.includes(p.id) ? "selected" : undefined}>
                <TableCell className="w-10">
                  <Checkbox
                    aria-label={`Selecionar ${p.nome}`}
                    checked={selecionados.includes(p.id)}
                    onCheckedChange={(v: boolean | "indeterminate") => setSelecionados((cur) => v ? [...cur, p.id] : cur.filter((id) => id !== p.id))}
                  />
                </TableCell>
                <TableCell>
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50/60 px-2 py-0.5 rounded-md inline-block">
                    {p.numero_pasta || p.codigo_prontuario || "—"}
                  </span>
                </TableCell>
                <TableCell className="max-w-[320px] text-sm font-semibold text-slate-800">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="h-8 w-8 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                      {fotoSigned[p.id] ? (
                        <img src={fotoSigned[p.id]} alt={p.nome} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <Users className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <span className="truncate" title={p.nome}>{p.nome}</span>
                    {convenios?.get(p.id) && (
                      <IdCard
                        className="h-4 w-4 text-emerald-600 shrink-0"
                        aria-label={`Associado - ${convenios.get(p.id)!.tipo} — ${convenios.get(p.id)!.convenio}`}
                      >
                        <title>{`Associado - ${convenios.get(p.id)!.tipo} — ${convenios.get(p.id)!.convenio}`}</title>
                      </IdCard>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs tabular-nums whitespace-nowrap text-slate-600 font-medium">{formatCPF(p.cpf)}</TableCell>
                <TableCell className="text-xs tabular-nums whitespace-nowrap text-slate-600 font-medium">{fmtNasc(p.data_nascimento)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap text-slate-600 font-medium"><span className="flex items-center gap-1"><IdadeCell nascimento={p.data_nascimento} /></span></TableCell>
                <TableCell className="text-xs tabular-nums whitespace-nowrap text-slate-600 font-medium">{formatPhone(p.telefone)}</TableCell>
                <TableCell>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${p.ativo ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      to="/app/clientes/$pacienteId/visualizar"
                      params={{ pacienteId: p.id }}
                      title="Visualizar cliente"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    {podeEscrever && (
                      <button
                        type="button"
                        onClick={() => setEditarId(p.id)}
                        title="Editar cliente"
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {podeEscrever && (
                      <button
                        type="button"
                        title="Excluir cliente"
                        disabled={excluindoId === p.id}
                        onClick={() => void excluirCliente(p)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selecionados.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
            <span className="text-sm font-medium whitespace-nowrap">
              {selecionados.length} selecionado{selecionados.length > 1 ? "s" : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelecionados([])} disabled={excluindoLote}>
              Limpar
            </Button>
            {podeEscrever && (
              <Button
                variant="destructive"
                size="sm"
                className="rounded-full"
                disabled={excluindoLote}
                onClick={() => void excluirSelecionados()}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                {excluindoLote ? "Excluindo…" : "Excluir selecionados"}
              </Button>
            )}
          </div>
        </div>
      )}

      {uxMelhorias && !debouncedBusca.trim() && totalPacientes !== null && totalPacientes > LIMITE_LISTA && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
          <div className="text-muted-foreground">
            Página <span className="font-medium text-foreground">{pagina + 1}</span> de{" "}
            <span className="font-medium text-foreground">{Math.max(1, Math.ceil(totalPacientes / LIMITE_LISTA))}</span>
            {" · "}Mostrando {pagina * LIMITE_LISTA + 1}–{pagina * LIMITE_LISTA + filtrados.length} de{" "}
            {totalPacientes.toLocaleString("pt-BR")}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina === 0 || loading}
              onClick={() => setPagina(0)}
              title="Primeira página"
            >
              Primeira
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina === 0 || loading}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || (pagina + 1) * LIMITE_LISTA >= totalPacientes || filtrados.length < LIMITE_LISTA}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || (pagina + 1) * LIMITE_LISTA >= totalPacientes}
              onClick={() => setPagina(Math.max(0, Math.ceil(totalPacientes / LIMITE_LISTA) - 1))}
              title="Última página"
            >
              Última
            </Button>
          </div>
        </div>
      )}

      {/* Novo cliente */}
      <Dialog open={openNovo} onOpenChange={setOpenNovo}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="flex-shrink-0 border-b border-border p-6 pb-4">
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>
              Preencha os dados do paciente. Use o microfone ao lado de cada campo para ditar por voz (quando disponível).
            </DialogDescription>
          </DialogHeader>
          {clinicaAtual && (
            <ClienteForm
              clinicaId={clinicaAtual.clinica_id}
              paciente={null}
              stickyFooter
              onCancel={() => setOpenNovo(false)}
              onSaved={() => { setOpenNovo(false); refrescar(); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Editar cliente (modal centralizado) */}
      {clinicaAtual && (
        <EditarClienteDialog
          pacienteId={editarId}
          clinicaId={clinicaAtual.clinica_id}
          onClose={() => setEditarId(null)}
          onSaved={refrescar}
        />
      )}
    </div>
  );
}
