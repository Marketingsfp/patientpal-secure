import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Pencil, Users, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
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
import { IdadeIcon, calcIdadeAnos } from "@/components/idade-icon";
import { ClientesShellV2 } from "@/components/clientes-v2/clientes-shell";
import { useClientesV2Flag } from "@/hooks/use-clientes-v2-flag";
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
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles")
        .select("preferencias_ui").eq("id", u.user.id).maybeSingle();
      const p = (data?.preferencias_ui ?? {}) as { clientes?: { compact?: boolean } };
      if (alive && typeof p.clientes?.compact === "boolean") setCompact(p.clientes.compact);
    })();
    return () => { alive = false; };
  }, []);
  const persistCompact = async (v: boolean) => {
    setCompact(v);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.from("profiles")
      .select("preferencias_ui").eq("id", u.user.id).maybeSingle();
    const prev = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
    const clientes = { ...((prev.clientes as object) ?? {}), compact: v };
    await supabase.from("profiles").update({ preferencias_ui: { ...prev, clientes } }).eq("id", u.user.id);
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



function ClientesPage() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Paciente[]>([]);
  const [totalPacientes, setTotalPacientes] = useState<number | null>(null);
  const [busca, setBusca] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? "";
  });
  const [loading, setLoading] = useState(false);
  const [openNovo, setOpenNovo] = useState(false);
  const [visualizar, setVisualizar] = useState<Paciente | null>(null);
  const loadSeq = useRef(0);

  const [fotoSigned, setFotoSigned] = useState<Record<string, string>>({});

  const load = async (termo: string = "") => {
    if (!clinicaAtual) return;
    const requestId = ++loadSeq.current;
    setLoading(true);
    const q = termo.trim();
    if (q && q.length < 3 && q.replace(/\D/g, "").length < 3) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const dataRequest = supabase.rpc("buscar_pacientes", {
        _clinica_id: clinicaAtual.clinica_id,
        _termo: q,
        _limit: q ? 80 : 120,
      });
      const countRequest = q
        ? Promise.resolve({ count: totalPacientes, error: null })
        : supabase
          .from("pacientes")
          .select("id", { count: "estimated", head: true })
          .eq("clinica_id", clinicaAtual.clinica_id);
      const [{ data, error }, { count, error: countError }] = await Promise.all([dataRequest, countRequest]);
      if (requestId !== loadSeq.current) return;
      setLoading(false);
      if (error) { toast.error("Não foi possível concluir esta busca. Tente novamente com mais letras do nome."); return; }
      if (countError) { mostrarErro(countError); } else { setTotalPacientes(count ?? 0); }
      setItems((data ?? []) as any);
    } catch {
      if (requestId !== loadSeq.current) return;
      setLoading(false);
      toast.error("Não foi possível concluir esta busca. Tente novamente com mais letras do nome.");
    }
  };

  // Debounced server-side search
  useEffect(() => {
    if (!clinicaAtual) return;
    const t = setTimeout(() => { void load(busca); }, 300);
    return () => clearTimeout(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [busca, clinicaAtual?.clinica_id]);

  useEffect(() => {
    const paths = items.filter(p => p.foto_url).map(p => p.foto_url as string);
    if (paths.length === 0) { setFotoSigned({}); return; }
    (async () => {
      const { data } = await supabase.storage.from("pacientes-fotos").createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      items.forEach((p) => {
        if (!p.foto_url) return;
        const found = data?.find(d => d.path === p.foto_url);
        if (found?.signedUrl) map[p.id] = found.signedUrl;
      });
      setFotoSigned(map);
    })();
  }, [items]);

  const filtrados = items;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Clientes
            {totalPacientes !== null && (
              <span className="text-sm font-normal text-muted-foreground">
                ({totalPacientes.toLocaleString("pt-BR")} {totalPacientes === 1 ? "paciente" : "pacientes"})
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie os pacientes da clínica.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              if (!clinicaAtual) return;
              const { data, error } = await supabase
                .from("pacientes")
                .select("nome,cpf,telefone,email,data_nascimento,cidade,estado,bairro,logradouro,numero,cep,ativo")
                .eq("clinica_id", clinicaAtual.clinica_id)
                .order("nome");
              if (error) { mostrarErro(error); return; }
              if (!data?.length) { toast.info("Sem dados para exportar."); return; }
              exportToExcel(
                data.map((p: any) => ({
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
            }}
          >
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Button onClick={() => setOpenNovo(true)}><Plus className="h-4 w-4 mr-2" /> Novo cliente</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nº serviço, nome, CPF, telefone, e-mail ou nascimento (dd/mm/aaaa)…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
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
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : !clinicaAtual ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
            ) : filtrados.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.codigo_prontuario ?? "—"}</TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                      {fotoSigned[p.id] ? (
                        <img src={fotoSigned[p.id]} alt={p.nome} className="h-full w-full object-cover" />
                      ) : (
                        <Users className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <span>{p.nome}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.cpf ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtNasc(p.data_nascimento)}</TableCell>
                <TableCell className="text-sm text-muted-foreground"><IdadeCell nascimento={p.data_nascimento} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.telefone ?? "—"}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Visualizar cliente"
                      onClick={() => setVisualizar(p)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="icon" title="Editar cliente">
                      <Link to="/app/clientes/$pacienteId/editar" params={{ pacienteId: p.id }}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Novo cliente */}
      <Dialog open={openNovo} onOpenChange={setOpenNovo}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
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
              onSaved={() => { setOpenNovo(false); void load(busca); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
