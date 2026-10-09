/**
 * Janelas do menu "Opções" da fila do médico (Agenda do Profissional).
 * Cada uma recebe o paciente e a clínica; as regras de acesso ficam no banco.
 */
import { hojeBR } from "@/lib/date-utils";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Printer, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MiniLineChart } from "@/components/charts/MiniLineChart";
import { htmlSeguro } from "@/lib/prontuario/html";

// Tabelas novas: o cliente tipado pode ainda não conhecê-las.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

export type PacienteRef = {
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
};

type BaseProps = PacienteRef & { open: boolean; onOpenChange: (v: boolean) => void };

const fmtData = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "—";

function nomeDoUsuario(user: ReturnType<typeof useAuth>["user"]): string | null {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return (meta["nome"] as string) || (meta["full_name"] as string) || user?.email || null;
}

/* ------------------------------------------------------------------ */
/* Impressão                                                           */
/* ------------------------------------------------------------------ */

export function imprimirHtml(titulo: string, corpo: string, formato: "a4" | "termica" = "a4") {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) {
    toast.error("O navegador bloqueou a janela de impressão. Libere pop-ups para este site.");
    return;
  }
  const css =
    formato === "termica"
      ? "@page{size:80mm auto;margin:3mm}body{font-family:monospace;font-size:12px;width:74mm}"
      : "@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;font-size:14px;line-height:1.5}";
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title><style>${css}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;text-align:left}h1{font-size:18px}</style></head><body>${corpo}<script>window.onload=()=>{window.print();}</script></body></html>`,
  );
  w.document.close();
}

/* ------------------------------------------------------------------ */
/* Alertas do paciente                                                 */
/* ------------------------------------------------------------------ */

export type AlertaPaciente = {
  id: string;
  tipo: "alergia" | "clinico" | "administrativo";
  descricao: string;
  ativo: boolean;
  criado_por_nome: string | null;
  created_at: string;
};

const ROTULO_ALERTA: Record<AlertaPaciente["tipo"], string> = {
  alergia: "Alergia",
  clinico: "Aviso clínico",
  administrativo: "Aviso administrativo",
};

const chaveAlertas = (pacienteId: string) => ["paciente-alertas", pacienteId];

export function useAlertasPaciente(pacienteId: string | null | undefined) {
  return useQuery({
    queryKey: chaveAlertas(pacienteId ?? ""),
    enabled: !!pacienteId,
    queryFn: async () => {
      const { data, error } = await db
        .from("paciente_alertas")
        .select("id, tipo, descricao, ativo, criado_por_nome, created_at")
        .eq("paciente_id", pacienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AlertaPaciente[];
    },
  });
}

/** Faixa destacada com os alertas ativos do paciente. Não aparece se não houver. */
export function AlertasAtivosBanner({ pacienteId }: { pacienteId: string | null | undefined }) {
  const q = useAlertasPaciente(pacienteId);
  const ativos = (q.data ?? []).filter((a) => a.ativo);
  if (!ativos.length) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <ul className="space-y-0.5">
        {ativos.map((a) => (
          <li key={a.id}>
            <span className="font-semibold text-destructive">{ROTULO_ALERTA[a.tipo]}:</span>{" "}
            {a.descricao}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AlertasPacienteDialog({
  open,
  onOpenChange,
  clinicaId,
  pacienteId,
  pacienteNome,
}: BaseProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useAlertasPaciente(open ? pacienteId : null);
  const [tipo, setTipo] = useState<AlertaPaciente["tipo"]>("alergia");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    if (!descricao.trim()) return toast.error("Escreva a descrição do alerta.");
    setSalvando(true);
    const { error } = await db.from("paciente_alertas").insert({
      clinica_id: clinicaId,
      paciente_id: pacienteId,
      tipo,
      descricao: descricao.trim(),
      criado_por_nome: nomeDoUsuario(user),
    });
    setSalvando(false);
    if (error) return mostrarErro(error);
    setDescricao("");
    void qc.invalidateQueries({ queryKey: chaveAlertas(pacienteId) });
  }

  async function alternar(a: AlertaPaciente) {
    const { error } = await db.from("paciente_alertas").update({ ativo: !a.ativo }).eq("id", a.id);
    if (error) return mostrarErro(error);
    void qc.invalidateQueries({ queryKey: chaveAlertas(pacienteId) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alertas — {pacienteNome}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as AlertaPaciente["tipo"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROTULO_ALERTA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: alergia a dipirona"
            />
          </div>
          <Button onClick={adicionar} disabled={salvando}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Criado por</TableHead>
                <TableHead className="text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((a) => (
                <TableRow key={a.id} className={a.ativo ? "" : "opacity-60"}>
                  <TableCell>{ROTULO_ALERTA[a.tipo]}</TableCell>
                  <TableCell>{a.descricao}</TableCell>
                  <TableCell className="text-xs">
                    {a.criado_por_nome ?? "—"}
                    <div className="text-muted-foreground">{fmtData(a.created_at)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => alternar(a)}>
                      {a.ativo ? "Desativar" : "Reativar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nenhum alerta cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Avaliações corporais                                                */
/* ------------------------------------------------------------------ */

type Avaliacao = {
  id: string;
  data: string;
  peso_kg: number | null;
  altura_cm: number | null;
  imc: number | null;
  cintura_cm: number | null;
  quadril_cm: number | null;
  abdomen_cm: number | null;
  braco_cm: number | null;
  coxa_cm: number | null;
  gordura_pct: number | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  observacao: string | null;
  profissional_nome: string | null;
};

const CAMPOS_AVAL: Array<[keyof Avaliacao, string]> = [
  ["peso_kg", "Peso (kg)"],
  ["altura_cm", "Altura (cm)"],
  ["cintura_cm", "Cintura (cm)"],
  ["quadril_cm", "Quadril (cm)"],
  ["abdomen_cm", "Abdômen (cm)"],
  ["braco_cm", "Braço (cm)"],
  ["coxa_cm", "Coxa (cm)"],
  ["gordura_pct", "% gordura"],
  ["pa_sistolica", "PA sistólica"],
  ["pa_diastolica", "PA diastólica"],
];

export function AvaliacoesCorporaisDialog({
  open,
  onOpenChange,
  clinicaId,
  pacienteId,
  pacienteNome,
}: BaseProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const chave = ["paciente-avaliacoes", pacienteId];
  const q = useQuery({
    queryKey: chave,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from("paciente_avaliacoes_corporais")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Avaliacao[];
    },
  });
  const linhas = q.data ?? [];
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const imcPrevia = useMemo(() => {
    const p = Number(form["peso_kg"]?.replace(",", "."));
    const a = Number(form["altura_cm"]?.replace(",", "."));
    return p > 0 && a > 0 ? (p / (a / 100) ** 2).toFixed(2) : "—";
  }, [form]);

  async function salvar() {
    const num = (k: string) => {
      const v = form[k]?.replace(",", ".").trim();
      return v ? Number(v) : null;
    };
    const reg: Record<string, unknown> = {
      clinica_id: clinicaId,
      paciente_id: pacienteId,
      data: form["data"] || hojeBR(),
      observacao: form["observacao"]?.trim() || null,
      profissional_nome: nomeDoUsuario(user),
    };
    for (const [k] of CAMPOS_AVAL) reg[k] = num(k);
    if (CAMPOS_AVAL.every(([k]) => reg[k] == null))
      return toast.error("Preencha pelo menos uma medida.");
    setSalvando(true);
    const { error } = await db.from("paciente_avaliacoes_corporais").insert(reg);
    setSalvando(false);
    if (error) return mostrarErro(error);
    setForm({});
    setNovo(false);
    void qc.invalidateQueries({ queryKey: chave });
  }

  function imprimir() {
    const cab = ["Data", "IMC", ...CAMPOS_AVAL.map(([, r]) => r), "Profissional"];
    const corpo = linhas
      .map(
        (l) =>
          `<tr><td>${fmtData(l.data)}</td><td>${l.imc ?? ""}</td>${CAMPOS_AVAL.map(([k]) => `<td>${l[k] ?? ""}</td>`).join("")}<td>${l.profissional_nome ?? ""}</td></tr>`,
      )
      .join("");
    imprimirHtml(
      "Avaliações corporais",
      `<h1>Avaliações corporais — ${pacienteNome}</h1><table><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr>${corpo}</table>`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Avaliações Corporais — {pacienteNome}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={imprimir} disabled={!linhas.length}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button size="sm" onClick={() => setNovo((v) => !v)}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
        {novo && (
          <Card className="grid gap-2 p-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label>Data</Label>
              <Input
                type="date"
                value={form["data"] ?? ""}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            {CAMPOS_AVAL.map(([k, r]) => (
              <div key={k} className="space-y-1">
                <Label>{r}</Label>
                <Input
                  inputMode="decimal"
                  value={form[k] ?? ""}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label>IMC (calculado)</Label>
              <div className="h-9 rounded-md border bg-muted/40 px-3 py-2 text-sm">{imcPrevia}</div>
            </div>
            <div className="space-y-1 sm:col-span-4">
              <Label>Observação</Label>
              <Textarea
                value={form["observacao"] ?? ""}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-4">
              <Button variant="outline" onClick={() => setNovo(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                Salvar
              </Button>
            </div>
          </Card>
        )}
        <Tabs defaultValue="tabela">
          <TabsList>
            <TabsTrigger value="tabela">Tabela</TabsTrigger>
            <TabsTrigger value="grafico">Gráfico</TabsTrigger>
          </TabsList>
          <TabsContent value="tabela">
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>IMC</TableHead>
                    {CAMPOS_AVAL.map(([k, r]) => (
                      <TableHead key={k} className="whitespace-nowrap">
                        {r}
                      </TableHead>
                    ))}
                    <TableHead>Profissional</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...linhas].reverse().map((l) => (
                    <TableRow key={l.id} title={l.observacao ?? undefined}>
                      <TableCell>{fmtData(l.data)}</TableCell>
                      <TableCell className="font-medium">{l.imc ?? "—"}</TableCell>
                      {CAMPOS_AVAL.map(([k]) => (
                        <TableCell key={k}>{(l[k] as number | null) ?? "—"}</TableCell>
                      ))}
                      <TableCell className="text-xs">{l.profissional_nome ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!linhas.length && (
                    <TableRow>
                      <TableCell
                        colSpan={CAMPOS_AVAL.length + 3}
                        className="text-center text-sm text-muted-foreground"
                      >
                        Nenhuma avaliação registrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="grafico">
            {linhas.length < 2 ? (
              <p className="p-4 text-sm text-muted-foreground">
                São necessárias pelo menos duas avaliações para mostrar a evolução.
              </p>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                <MiniLineChart
                  labels={linhas.map((l) => fmtData(l.data).slice(0, 5))}
                  series={[
                    {
                      name: "Peso (kg)",
                      color: "hsl(var(--primary))",
                      values: linhas.map((l) => (l.peso_kg == null ? null : Number(l.peso_kg))),
                    },
                    {
                      name: "IMC",
                      color: "hsl(var(--destructive))",
                      values: linhas.map((l) => (l.imc == null ? null : Number(l.imc))),
                    },
                  ]}
                  height={220}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Anexos e fotos                                                      */
/* ------------------------------------------------------------------ */

const BUCKET_ARQUIVOS = "paciente-arquivos";

type Arquivo = {
  id: string;
  tipo: "anexo" | "foto";
  caminho: string;
  nome_arquivo: string;
  mime: string | null;
  descricao: string | null;
  data: string;
  enviado_por_nome: string | null;
};

function MiniaturaFoto({ caminho, alt }: { caminho: string; alt: string }) {
  const q = useQuery({
    queryKey: ["paciente-arquivo-url", caminho],
    staleTime: 8 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from(BUCKET_ARQUIVOS).createSignedUrl(caminho, 600);
      return data?.signedUrl ?? null;
    },
  });
  return q.data ? (
    <img src={q.data} alt={alt} className="h-32 w-full rounded object-cover" loading="lazy" />
  ) : (
    <div className="h-32 w-full animate-pulse rounded bg-muted" />
  );
}

export function ArquivosPacienteDialog({
  open,
  onOpenChange,
  clinicaId,
  pacienteId,
  pacienteNome,
  tipo,
}: BaseProps & { tipo: "anexo" | "foto" }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const chave = ["paciente-arquivos", pacienteId, tipo];
  const q = useQuery({
    queryKey: chave,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from("paciente_arquivos")
        .select("id, tipo, caminho, nome_arquivo, mime, descricao, data, enviado_por_nome")
        .eq("paciente_id", pacienteId)
        .eq("tipo", tipo)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Arquivo[];
    },
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!arquivo) return toast.error("Escolha um arquivo.");
    if (tipo === "foto" && !arquivo.type.startsWith("image/"))
      return toast.error("Escolha uma imagem.");
    if (arquivo.size > 20 * 1024 * 1024) return toast.error("Arquivo maior que 20 MB.");
    setEnviando(true);
    try {
      const ext = (arquivo.name.split(".").pop() ?? "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8);
      const caminho = `${clinicaId}/${pacienteId}/${tipo}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(BUCKET_ARQUIVOS).upload(caminho, arquivo, {
        contentType: arquivo.type || undefined,
      });
      if (up.error) throw up.error;
      const { error } = await db.from("paciente_arquivos").insert({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        tipo,
        caminho,
        nome_arquivo: arquivo.name,
        mime: arquivo.type || null,
        tamanho_bytes: arquivo.size,
        descricao: descricao.trim() || null,
        data: data || hojeBR(),
        enviado_por_nome: nomeDoUsuario(user),
      });
      if (error) {
        await supabase.storage.from(BUCKET_ARQUIVOS).remove([caminho]);
        throw error;
      }
      setArquivo(null);
      setDescricao("");
      setData("");
      toast.success(tipo === "foto" ? "Foto enviada" : "Anexo enviado");
      void qc.invalidateQueries({ queryKey: chave });
    } catch (e) {
      mostrarErro(e as Error);
    } finally {
      setEnviando(false);
    }
  }

  async function abrir(a: Arquivo) {
    const { data: s, error } = await supabase.storage
      .from(BUCKET_ARQUIVOS)
      .createSignedUrl(a.caminho, 300, {
        download: a.nome_arquivo,
      });
    if (error || !s?.signedUrl) return toast.error("Não foi possível abrir o arquivo.");
    window.open(s.signedUrl, "_blank", "noopener");
  }

  async function excluir(a: Arquivo) {
    const { error } = await db.from("paciente_arquivos").delete().eq("id", a.id);
    if (error) return mostrarErro(error);
    await supabase.storage.from(BUCKET_ARQUIVOS).remove([a.caminho]);
    void qc.invalidateQueries({ queryKey: chave });
  }

  const titulo = tipo === "foto" ? "Fotos" : "Anexos";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {titulo} — {pacienteNome}
          </DialogTitle>
        </DialogHeader>
        <Card className="grid gap-2 p-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
          <div className="space-y-1">
            <Label>Arquivo</Label>
            <Input
              type="file"
              accept={tipo === "foto" ? "image/*" : undefined}
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <Button onClick={enviar} disabled={enviando}>
            <Upload className="h-4 w-4" /> Enviar
          </Button>
        </Card>
        {tipo === "foto" ? (
          <div className="grid max-h-[28rem] grid-cols-2 gap-3 overflow-auto sm:grid-cols-4">
            {(q.data ?? []).map((a) => (
              <Card key={a.id} className="space-y-1 p-2 text-xs">
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => abrir(a)}
                  title="Abrir/baixar"
                >
                  <MiniaturaFoto caminho={a.caminho} alt={a.descricao ?? a.nome_arquivo} />
                </button>
                <div className="truncate font-medium">{a.descricao || a.nome_arquivo}</div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{fmtData(a.data)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => excluir(a)}
                    aria-label="Excluir foto"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="max-h-96 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Enviado por</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{fmtData(a.data)}</TableCell>
                    <TableCell className="max-w-48 truncate">{a.nome_arquivo}</TableCell>
                    <TableCell>{a.descricao ?? "—"}</TableCell>
                    <TableCell className="text-xs">{a.enviado_por_nome ?? "—"}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="outline" onClick={() => abrir(a)}>
                        <Download className="h-3.5 w-3.5" /> Baixar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => excluir(a)}
                        aria-label="Excluir anexo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {q.data?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nada enviado ainda.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Atestado                                                            */
/* ------------------------------------------------------------------ */

export function AtestadoDialog({
  open,
  onOpenChange,
  clinicaId,
  pacienteId,
  pacienteNome,
  medicoId,
  medicoNome,
  formato,
}: BaseProps & { medicoId: string | null; medicoNome: string; formato: "a4" | "termica" }) {
  const qc = useQueryClient();
  const [dias, setDias] = useState("1");
  const [cid, setCid] = useState("");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const hoje = new Date().toLocaleDateString("pt-BR");
  const padrao = `Atesto, para os devidos fins, que ${pacienteNome} esteve sob meus cuidados profissionais nesta data, necessitando de ${dias || "1"} dia(s) de afastamento de suas atividades${cid ? `. CID: ${cid}` : ""}.`;

  async function emitir() {
    const conteudo = (texto.trim() || padrao).replace(/\n/g, "<br>");
    setSalvando(true);
    const { error } = await supabase.from("documentos_emitidos").insert({
      clinica_id: clinicaId,
      paciente_id: pacienteId,
      medico_id: medicoId,
      tipo: "atestado",
      titulo: "Atestado médico",
      conteudo,
    } as never);
    setSalvando(false);
    if (error) return mostrarErro(error);
    void qc.invalidateQueries({ queryKey: ["paciente-documentos", pacienteId] });
    imprimirHtml(
      "Atestado",
      `<h1 style="text-align:center">ATESTADO MÉDICO</h1><p>${conteudo}</p><p>${hoje}</p><br><br><p style="text-align:center">______________________________<br>${medicoNome}</p>`,
      formato,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Atestado ({formato === "termica" ? "impressão térmica" : "impressão laser A4"}) —{" "}
            {pacienteNome}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Dias de afastamento</Label>
            <Input
              inputMode="numeric"
              value={dias}
              onChange={(e) => setDias(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-1">
            <Label>CID (opcional)</Label>
            <Input value={cid} onChange={(e) => setCid(e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Texto (deixe em branco para usar o padrão)</Label>
          <Textarea
            rows={5}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={padrao}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={emitir} disabled={salvando}>
            <Printer className="h-4 w-4" /> Emitir e imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Documentos emitidos                                                 */
/* ------------------------------------------------------------------ */

export function DocumentosDialog({ open, onOpenChange, pacienteId, pacienteNome }: BaseProps) {
  const q = useQuery({
    queryKey: ["paciente-documentos", pacienteId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos_emitidos")
        .select("id, tipo, titulo, conteudo, created_at")
        .eq("paciente_id", pacienteId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Documentos — {pacienteNome}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[28rem] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Título</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{fmtData(d.created_at)}</TableCell>
                  <TableCell className="capitalize">{d.tipo}</TableCell>
                  <TableCell>{d.titulo}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        imprimirHtml(
                          d.titulo,
                          `<h1>${d.titulo}</h1>${htmlSeguro(d.conteudo ?? "")}`,
                        )
                      }
                    >
                      <Printer className="h-3.5 w-3.5" /> Reimprimir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nenhum documento emitido.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Retornos                                                            */
/* ------------------------------------------------------------------ */

export function RetornosDialog({
  open,
  onOpenChange,
  clinicaId,
  pacienteId,
  pacienteNome,
  onAbrirAgenda,
}: BaseProps & { onAbrirAgenda: () => void }) {
  const q = useQuery({
    queryKey: ["paciente-retornos", pacienteId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, inicio, procedimento, status, medicos(nome)")
        .eq("clinica_id", clinicaId)
        .eq("paciente_id", pacienteId)
        .gte("inicio", new Date().toISOString())
        .neq("status", "cancelado")
        .order("inicio")
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        inicio: string;
        procedimento: string | null;
        status: string;
        medicos: { nome: string } | null;
      }>;
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Retornos — {pacienteNome}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Próximos agendamentos do paciente nesta clínica.
        </p>
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Procedimento</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {new Date(r.inicio).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>{r.procedimento ?? "—"}</TableCell>
                  <TableCell>{r.medicos?.nome ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.status}</TableCell>
                </TableRow>
              ))}
              {q.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nenhum retorno marcado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button onClick={onAbrirAgenda}>Agendar retorno na Agenda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Triagem (somente leitura)                                           */
/* ------------------------------------------------------------------ */

export type TriagemLeitura = {
  enfermeira_nome: string | null;
  created_at: string;
  queixa_principal: string | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  freq_cardiaca: number | null;
  temperatura: number | null;
  saturacao: number | null;
  glicemia: number | null;
  peso_kg: number | null;
  altura_cm: number | null;
  imc: number | null;
  doencas: string[] | null;
  medicamentos: string | null;
  alergias: string | null;
  observacoes: string | null;
};

export function TriagemResumo({ t }: { t: TriagemLeitura | null | undefined }) {
  if (!t)
    return <p className="text-sm text-muted-foreground">Sem triagem registrada pela enfermagem.</p>;
  const sv: string[] = [];
  if (t.pa_sistolica && t.pa_diastolica) sv.push(`PA ${t.pa_sistolica}/${t.pa_diastolica}`);
  if (t.freq_cardiaca) sv.push(`FC ${t.freq_cardiaca}`);
  if (t.temperatura) sv.push(`T ${t.temperatura}°`);
  if (t.saturacao) sv.push(`SatO₂ ${t.saturacao}%`);
  if (t.glicemia) sv.push(`Glic ${t.glicemia}`);
  if (t.peso_kg) sv.push(`${t.peso_kg} kg`);
  if (t.altura_cm) sv.push(`${t.altura_cm} cm`);
  if (t.imc) sv.push(`IMC ${t.imc}`);
  const linha = (r: string, v: string | null | undefined) =>
    v ? (
      <div>
        <span className="text-xs uppercase text-muted-foreground">{r}: </span>
        {v}
      </div>
    ) : null;
  return (
    <div className="space-y-1 text-sm">
      <div className="text-xs text-muted-foreground">
        {new Date(t.created_at).toLocaleString("pt-BR")}{" "}
        {t.enfermeira_nome ? `· por ${t.enfermeira_nome}` : ""}
      </div>
      {sv.length > 0 && <div className="rounded bg-muted/50 px-2 py-1">{sv.join(" · ")}</div>}
      {linha("Queixa", t.queixa_principal)}
      {linha("Doenças", t.doencas?.join(", "))}
      {linha("Medicamentos", t.medicamentos)}
      {linha("Alergias", t.alergias)}
      {linha("Observações", t.observacoes)}
    </div>
  );
}

export function TriagemDialog({
  open,
  onOpenChange,
  pacienteNome,
  triagem,
}: Omit<BaseProps, "clinicaId" | "pacienteId"> & { triagem: TriagemLeitura | null | undefined }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Triagem — {pacienteNome}</DialogTitle>
        </DialogHeader>
        <TriagemResumo t={triagem} />
      </DialogContent>
    </Dialog>
  );
}
