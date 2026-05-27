import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

export const Route = createFileRoute("/_authenticated/app/clientes/")({
  component: ClientesPage,
  head: () => ({ meta: [{ title: "Clientes — ClinicaOS" }] }),
});

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

  // Biometria facial
  const [faceFor, setFaceFor] = useState<Paciente | null>(null);
  const [consentFor, setConsentFor] = useState<Paciente | null>(null);
  const [prontFor, setProntFor] = useState<Paciente | null>(null);
  const [prontList, setProntList] = useState<Array<{
    id: string; data: string; medico_nome: string | null;
    queixa_principal: string | null; hipotese_diagnostica: string | null;
    conduta: string | null; prescricao: string | null;
    historia_doenca: string | null; exame_fisico: string | null; observacoes: string | null;
  }>>([]);
  const [prontLoading, setProntLoading] = useState(false);
  const [hasBiometria, setHasBiometria] = useState<Record<string, boolean>>({});
  const [fotoSigned, setFotoSigned] = useState<Record<string, string>>({});

  const abrirProntuario = async (p: Paciente) => {
    setProntFor(p);
    setProntLoading(true);
    setProntList([]);
    const { data, error } = await supabase
      .from("prontuarios")
      .select("id, data, medico_id, queixa_principal, hipotese_diagnostica, conduta, prescricao, historia_doenca, exame_fisico, observacoes, medicos(nome)")
      .eq("paciente_id", p.id)
      .order("data", { ascending: false });
    if (error) {
      toast.error("Não foi possível carregar o prontuário.");
      setProntLoading(false);
      return;
    }
    setProntList((data ?? []).map((r: any) => ({
      id: r.id, data: r.data,
      medico_nome: r.medicos?.nome ?? null,
      queixa_principal: r.queixa_principal,
      hipotese_diagnostica: r.hipotese_diagnostica,
      conduta: r.conduta, prescricao: r.prescricao,
      historia_doenca: r.historia_doenca,
      exame_fisico: r.exame_fisico,
      observacoes: r.observacoes,
    })));
    setProntLoading(false);
  };

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pacientes")
      .select("id,nome,cpf,telefone,email,ativo,cidade,estado,created_at,foto_url")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome")
      .limit(100);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as any);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (!clinicaAtual || items.length === 0) { setHasBiometria({}); return; }
    (async () => {
      const { data } = await supabase
        .from("paciente_biometria")
        .select("paciente_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .is("revogado_em", null)
        .in("paciente_id", items.map(p => p.id));
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((b: any) => { map[b.paciente_id] = true; });
      setHasBiometria(map);
    })();
  }, [items, clinicaAtual?.clinica_id]);

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

  async function salvarBiometria(descriptor: number[]) {
    if (!faceFor || !clinicaAtual) return;
    await supabase.from("paciente_biometria")
      .update({ revogado_em: new Date().toISOString() })
      .eq("paciente_id", faceFor.id)
      .eq("clinica_id", clinicaAtual.clinica_id)
      .is("revogado_em", null);
    const { error } = await supabase.from("paciente_biometria").insert({
      paciente_id: faceFor.id,
      clinica_id: clinicaAtual.clinica_id,
      descriptor: descriptor as any,
      consentimento_em: new Date().toISOString(),
    });
    if (error) throw error;
    setHasBiometria(prev => ({ ...prev, [faceFor.id]: true }));
    toast.success("Biometria facial cadastrada");
  }

  async function revogarBiometria(p: Paciente) {
    if (!clinicaAtual) return;
    if (!confirm(`Remover a biometria facial de ${p.nome}? (direito de exclusão — LGPD)`)) return;
    const { error } = await supabase.from("paciente_biometria")
      .update({ revogado_em: new Date().toISOString() })
      .eq("paciente_id", p.id)
      .eq("clinica_id", clinicaAtual.clinica_id)
      .is("revogado_em", null);
    if (error) { toast.error(error.message); return; }
    setHasBiometria(prev => { const c = { ...prev }; delete c[p.id]; return c; });
    toast.success("Biometria removida");
  }

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
              <TableHead className="w-48">E-mail</TableHead>
              <TableHead className="w-36">Telefone</TableHead>
              <TableHead className="w-40">Cidade/UF</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-40 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : !clinicaAtual ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
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
                <TableCell className="text-sm text-muted-foreground truncate max-w-[12rem]">{p.email ?? "—"}</TableCell>
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
                  {hasBiometria[p.id] ? (
                    <Button variant="ghost" size="icon" onClick={() => revogarBiometria(p)} title="Biometria cadastrada — clique para remover">
                      <ScanFace className="h-4 w-4 text-emerald-600" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => setConsentFor(p)} title="Cadastrar biometria facial">
                      <ScanFace className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => abrirProntuario(p)} title="Ver prontuário">
                    <FileHeart className="h-4 w-4 text-primary" />
                  </Button>
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

      {/* Consentimento LGPD para biometria facial */}
      <Dialog open={!!consentFor} onOpenChange={(o) => { if (!o) setConsentFor(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Consentimento — Biometria facial</DialogTitle>
            <DialogDescription>
              Termo obrigatório (LGPD — Lei 13.709/2018, art. 11).
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-2 max-h-72 overflow-auto rounded-md border bg-muted/30 p-3">
            <p><strong>Paciente:</strong> {consentFor?.nome}</p>
            <p><strong>Finalidade:</strong> identificação na recepção, totem de auto-atendimento e confirmação de identidade em atendimentos, evitando troca de prontuários.</p>
            <p><strong>O que é armazenado:</strong> apenas um vetor matemático (descritor) do seu rosto — <em>não</em> guardamos a foto. O vetor não permite reconstruir a imagem original.</p>
            <p><strong>Compartilhamento:</strong> os dados ficam restritos à clínica e não são compartilhados com terceiros.</p>
            <p><strong>Direitos do titular:</strong> você pode revogar o consentimento e solicitar a exclusão da biometria a qualquer momento, pela equipe da recepção.</p>
            <p><strong>Base legal:</strong> consentimento específico e destacado (art. 11, I).</p>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background border-t -mx-6 -mb-6 px-6 py-3 z-10">
            <Button variant="ghost" onClick={() => setConsentFor(null)}>Não concordo</Button>
            <Button onClick={() => { setFaceFor(consentFor); setConsentFor(null); }}>
              Concordo e autorizo a captura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FaceCaptureDialog
        open={!!faceFor}
        onClose={() => setFaceFor(null)}
        onCaptured={salvarBiometria}
        titulo={`Biometria — ${faceFor?.nome ?? ""}`}
      />

      {/* Prontuário do paciente */}
      <Dialog open={!!prontFor} onOpenChange={(o) => { if (!o) setProntFor(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileHeart className="h-5 w-5 text-primary" />
              Prontuário — {prontFor?.nome}
            </DialogTitle>
            <DialogDescription>
              Histórico de atendimentos registrados para este paciente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {prontLoading ? (
              <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : prontList.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                Nenhum registro de prontuário para este paciente.
              </div>
            ) : prontList.map((r) => (
              <div key={r.id} className="border rounded-lg p-4 bg-card space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{new Date(r.data).toLocaleString("pt-BR")}</span>
                  <span className="text-muted-foreground uppercase text-xs">{r.medico_nome ?? "—"}</span>
                </div>
                {([
                  ["Queixa principal", r.queixa_principal],
                  ["História da doença", r.historia_doenca],
                  ["Exame físico", r.exame_fisico],
                  ["Hipótese diagnóstica", r.hipotese_diagnostica],
                  ["Conduta", r.conduta],
                  ["Prescrição", r.prescricao],
                  ["Observações", r.observacoes],
                ] as const).filter(([, v]) => v && v.trim()).map(([label, v]) => (
                  <div key={label} className="text-sm">
                    <div className="text-xs font-medium text-muted-foreground">{label}</div>
                    <div className="whitespace-pre-wrap">{v}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProntFor(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
