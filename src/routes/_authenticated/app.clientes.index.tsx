import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Search, Pencil, Trash2, Users, Download } from "lucide-react";
import { toast } from "sonner";
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
import iconBebe from "@/assets/icon-bebe.png";
import iconCriancas from "@/assets/icon-criancas.png";
import iconIdoso from "@/assets/icon-idoso.png";

export const Route = createFileRoute("/_authenticated/app/clientes/")({
  component: ClientesPage,
  head: () => ({ meta: [{ title: "Clientes — ClinicaOS" }] }),
});

function fmtNasc(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}

function calcIdade(d: string | null): number | null {
  if (!d) return null;
  const nasc = new Date(d + "T00:00:00");
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function IdadeCell({ nascimento }: { nascimento: string | null }) {
  const idade = calcIdade(nascimento);
  if (idade === null || idade < 0) return <>—</>;
  let icon: ReactNode = null;
  let label = "";
  if (idade <= 2) { icon = <img src={iconBebe} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 object-contain" />; label = "Bebê"; }
  else if (idade <= 10) { icon = <img src={iconCriancas} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 object-contain" />; label = "Criança"; }
  else if (idade >= 65) { icon = <img src={iconIdoso} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 object-contain" />; label = "Idoso"; }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{idade} {idade === 1 ? "ano" : "anos"}</span>
      {icon && <span title={label} aria-label={label}>{icon}</span>}
    </span>
  );
}

interface Paciente {
  id: string;
  nome: string;
  cpf: string | null;
  numero_pasta: string | null;
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
  const [busca, setBusca] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? "";
  });
  const [loading, setLoading] = useState(false);
  const [openNovo, setOpenNovo] = useState(false);

  const [fotoSigned, setFotoSigned] = useState<Record<string, string>>({});

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pacientes")
      .select("id,nome,cpf,telefone,email,data_nascimento,ativo,cidade,estado,created_at,foto_url")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome")
      .limit(100);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as any);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return items;
    return items.filter(p =>
      p.nome.toLowerCase().includes(q) ||
      (p.cpf ?? "").toLowerCase().includes(q) ||
      (p.telefone ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.numero_pasta ?? "").toLowerCase().includes(q) ||
      (p.data_nascimento ?? "").toLowerCase().includes(q) ||
      (p.data_nascimento ? p.data_nascimento.split("-").reverse().join("/") : "").includes(q)
    );
  }, [items, busca]);

  const onDelete = async (p: Paciente) => {
    if (!confirm(`Excluir ${p.nome}?`)) return;
    const { error } = await supabase.from("pacientes").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente excluído.");
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Clientes
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
              if (error) { toast.error(error.message); return; }
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
            placeholder="Buscar por nº pasta, nome, CPF, telefone, e-mail ou nascimento (dd/mm/aaaa)…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Nome</TableHead>
              <TableHead className="w-36">CPF</TableHead>
              <TableHead className="w-32">Nascimento</TableHead>
              <TableHead className="w-28">Idade</TableHead>
              <TableHead className="w-36">Telefone</TableHead>
              <TableHead className="w-40">Cidade/UF</TableHead>
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
                <TableCell className="text-sm text-muted-foreground">
                  {p.cidade ? `${p.cidade}${p.estado ? "/" + p.estado : ""}` : "—"}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon" title="Editar cliente">
                    <Link to="/app/clientes/$pacienteId/editar" params={{ pacienteId: p.id }}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
              onSaved={() => { setOpenNovo(false); void load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
