import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Receipt,
  ExternalLink,
  FilePlus2,
  RefreshCw,
  Send,
  ScanLine,
  Check,
  X,
  Loader2,
  AlertCircle,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import {
  consultarNfse,
  reenviarNfse,
  extrairNfseDeImagem,
  baixarNfseArquivo,
} from "@/lib/nfse.functions";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/nfse/")({
  component: NfsePage,
  head: () => ({ meta: [{ title: "Notas Fiscais — ClinicaOS" }] }),
});

interface Emitente {
  id: string;
  nome: string;
  cnpj: string;
}
interface Row {
  id: string;
  numero: string | null;
  data_emissao: string;
  valor_servicos: number;
  status: string;
  url_pdf: string | null;
  tomador_nome: string | null;
  emitente_id: string | null;
  emitente: { nome: string; cnpj: string } | null;
  erro_mensagem: string | null;
  payload_resposta: unknown;
}

function NfsePage() {
  const { clinicaAtual } = useClinica();
  const consulta = useServerFn(consultarNfse);
  const reenviar = useServerFn(reenviarNfse);
  const extrair = useServerFn(extrairNfseDeImagem);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const [conferirOpen, setConferirOpen] = useState(false);
  const [conferirLoading, setConferirLoading] = useState(false);
  const [conferirPreview, setConferirPreview] = useState<string | null>(null);
  const [conferirExtraido, setConferirExtraido] = useState<Awaited<
    ReturnType<typeof extrair>
  > | null>(null);
  const [emitentes, setEmitentes] = useState<Emitente[]>([]);
  const [filtroEmitente, setFiltroEmitente] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState<Row | null>(null);
  const [pdfVisualizando, setPdfVisualizando] = useState<Row | null>(null);
  const baixarArquivo = useServerFn(baixarNfseArquivo);

  useEffect(() => {
    if (!clinicaAtual) return;
    void (async () => {
      const { data } = await supabase
        .from("nfse_emitentes")
        .select("id, nome, cnpj")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("nome");
      setEmitentes((data ?? []) as Emitente[]);
    })();
  }, [clinicaAtual?.clinica_id]);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("nfse")
      .select(
        "id, numero, data_emissao, valor_servicos, status, url_pdf, tomador_nome, emitente_id, erro_mensagem, payload_resposta, emitente:nfse_emitentes(nome, cnpj)",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("data_emissao", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setRows((data ?? []) as unknown as Row[]);
  };
  useEffect(() => {
    void load(); /* eslint-disable-next-line */
  }, [clinicaAtual?.clinica_id]);

  // Auto-polling: a cada 15s consulta o Focus para notas em "processando"
  // (webhook do Focus pode falhar/não estar configurado).
  useEffect(() => {
    const pendentes = rows.filter((r) => r.status === "processando").map((r) => r.id);
    if (pendentes.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      for (const id of pendentes) {
        if (cancelled) return;
        try {
          await consulta({ data: { id } });
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) await load();
    };
    const t = setInterval(() => void tick(), 15000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.id}:${r.status}`).join("|")]);

  const filtrados = useMemo(
    () =>
      rows.filter((r) => {
        if (filtroEmitente !== "todos" && r.emitente_id !== filtroEmitente) return false;
        if (filtroStatus !== "todos" && r.status !== filtroStatus) return false;
        return true;
      }),
    [rows, filtroEmitente, filtroStatus],
  );

  const onReenviar = async (id: string) => {
    setReenviando(id);
    try {
      const r = await reenviar({ data: { id } });
      if (r.ok) toast.success("Nota reenviada. Aguarde autorização.");
      else toast.error(r.error ?? "Falha ao reenviar");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReenviando(null);
    }
  };

  const onConsultar = async (id: string) => {
    try {
      await consulta({ data: { id } });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onConferirArquivo = async (file: File) => {
    setConferirLoading(true);
    setConferirExtraido(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.readAsDataURL(file);
      });
      setConferirPreview(file.type.startsWith("image/") ? dataUrl : null);
      const base64 = dataUrl.split(",")[1] ?? "";
      const r = await extrair({
        data: { arquivo_base64: base64, mime: file.type || "image/jpeg" },
      });
      setConferirExtraido(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConferirLoading(false);
    }
  };

  const notaMatch = useMemo(() => {
    if (!conferirExtraido?.numero) return null;
    const numTxt = String(conferirExtraido.numero).replace(/\D/g, "");
    return rows.find((r) => (r.numero ?? "").replace(/\D/g, "") === numTxt) ?? null;
  }, [conferirExtraido, rows]);

  const totais = useMemo(() => {
    const porEmitente = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const r of filtrados) {
      const k = r.emitente?.nome ?? "Sem emitente";
      const cur = porEmitente.get(k) ?? { nome: k, qtd: 0, valor: 0 };
      cur.qtd += 1;
      cur.valor += Number(r.valor_servicos) || 0;
      porEmitente.set(k, cur);
    }
    return Array.from(porEmitente.values());
  }, [filtrados]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Notas Fiscais (NFS-e)
          </h1>
          <p className="text-sm text-muted-foreground">
            Emissão e controle de notas fiscais de serviço.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setConferirOpen(true);
              setConferirExtraido(null);
              setConferirPreview(null);
            }}
          >
            <ScanLine className="h-4 w-4 mr-2" /> Conferir por imagem
          </Button>
          <Button asChild>
            <Link to="/app/nfse/testar">
              <FilePlus2 className="h-4 w-4 mr-2" /> Emitir NFS-e
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Emitente</label>
          <Select value={filtroEmitente} onValueChange={setFiltroEmitente}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os emitentes</SelectItem>
              {emitentes.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome} — {e.cnpj}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="processando">Processando</SelectItem>
              <SelectItem value="emitida">Emitida</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {totais.length > 0 && (
          <div className="ml-auto flex gap-2 text-xs">
            {totais.map((t) => (
              <div key={t.nome} className="rounded-md bg-muted px-3 py-1.5">
                <div className="font-medium">{t.nome}</div>
                <div className="text-muted-foreground">
                  {t.qtd} nota{t.qtd !== 1 ? "s" : ""} ·{" "}
                  {t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {emitidasComPdf.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              DANFSE — últimas emitidas ({emitidasComPdf.length})
            </div>
            <div className="text-xs text-muted-foreground">Pré-visualização dos PDFs</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {emitidasComPdf.map((r) => (
              <div
                key={r.id}
                className="border rounded-md overflow-hidden bg-muted/20 flex flex-col"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40 text-xs">
                  <div className="truncate">
                    <span className="font-medium">Nº {r.numero ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {r.tomador_nome ?? "—"} ·{" "}
                      {Number(r.valor_servicos).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={() => setPdfVisualizando(r)}
                      title="Ampliar"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <a
                      href={r.url_pdf!}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir em nova aba"
                      className="inline-flex items-center px-2 rounded hover:bg-accent text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
                <PdfPreview
                  nfseId={r.id}
                  baixar={baixarArquivo}
                  className="w-full h-[480px] bg-white"
                  title={`DANFSE ${r.numero ?? r.id}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-44">Emitente</TableHead>
              <TableHead className="w-24">Número</TableHead>
              <TableHead className="w-28">Emissão</TableHead>
              <TableHead>Tomador</TableHead>
              <TableHead className="w-32 text-right">Valor</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-40 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhuma nota.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.emitente ? (
                      <div>
                        <div className="font-medium text-sm">{r.emitente.nome}</div>
                        <div className="text-xs text-muted-foreground">{r.emitente.cnpj}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>{r.numero ?? "—"}</TableCell>
                  <TableCell>{new Date(r.data_emissao).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{r.tomador_nome ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {Number(r.valor_servicos).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        r.status === "emitida"
                          ? "bg-green-500/10 text-green-700"
                          : r.status === "erro"
                            ? "bg-red-500/10 text-red-700"
                            : r.status === "cancelada"
                              ? "bg-gray-500/10 text-gray-700"
                              : "bg-amber-500/10 text-amber-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {r.url_pdf && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Visualizar DANFSE"
                            onClick={() => setPdfVisualizando(r)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <a
                            href={r.url_pdf}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir em nova aba"
                            className="text-primary inline-flex items-center px-2 py-1 rounded hover:bg-accent"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </>
                      )}
                      {(r.status === "processando" || r.status === "erro") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Consultar status"
                          onClick={() => void onConsultar(r.id)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {r.status === "erro" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Ver detalhes do erro"
                          onClick={() => setErroDetalhe(r)}
                        >
                          <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      )}
                      {r.status === "erro" && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Reenviar nota"
                          disabled={reenviando === r.id}
                          onClick={() => void onReenviar(r.id)}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          {reenviando === r.id ? "Reenviando…" : "Reenviar"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={conferirOpen} onOpenChange={setConferirOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-4 w-4" /> Conferir NFS-e por imagem
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onConferirArquivo(f);
                }}
                className="text-sm"
              />
              {conferirLoading && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Extraindo dados…
                </span>
              )}
            </div>

            {conferirExtraido && (
              <div className="grid md:grid-cols-2 gap-4">
                {conferirPreview && (
                  <div className="border rounded-md overflow-hidden bg-muted/30 max-h-[400px] flex items-center justify-center">
                    <img
                      src={conferirPreview}
                      alt="NFS-e"
                      className="max-h-[400px] object-contain"
                    />
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div className="font-medium">Dados extraídos</div>
                  {(() => {
                    const fields: Array<[string, unknown, unknown]> = [
                      ["Número", conferirExtraido.numero, notaMatch?.numero],
                      [
                        "Data emissão",
                        conferirExtraido.data_emissao,
                        notaMatch
                          ? new Date(notaMatch.data_emissao).toISOString().slice(0, 10)
                          : null,
                      ],
                      [
                        "Valor",
                        conferirExtraido.valor_servicos != null
                          ? Number(conferirExtraido.valor_servicos).toFixed(2)
                          : null,
                        notaMatch ? Number(notaMatch.valor_servicos).toFixed(2) : null,
                      ],
                      ["Descrição", conferirExtraido.descricao_servicos, null],
                      [
                        "Emitente CNPJ",
                        conferirExtraido.emitente_cnpj,
                        notaMatch?.emitente?.cnpj?.replace(/\D/g, "") ?? null,
                      ],
                      [
                        "Emitente",
                        conferirExtraido.emitente_nome,
                        notaMatch?.emitente?.nome ?? null,
                      ],
                      ["Tomador CPF/CNPJ", conferirExtraido.tomador_cpf_cnpj, null],
                      ["Tomador", conferirExtraido.tomador_nome, notaMatch?.tomador_nome ?? null],
                    ];
                    return fields.map(([label, extr, sys]) => {
                      const e = extr == null || extr === "" ? "—" : String(extr);
                      const s = sys == null || sys === "" ? null : String(sys);
                      const match =
                        s != null && String(extr ?? "").replace(/\D/g, "").length > 0
                          ? String(extr).replace(/\D/g, "") === s.replace(/\D/g, "") ||
                            String(extr).toLowerCase().includes(s.toLowerCase()) ||
                            s.toLowerCase().includes(String(extr).toLowerCase())
                          : null;
                      return (
                        <div
                          key={label}
                          className="grid grid-cols-[140px_1fr_auto] gap-2 items-start py-1 border-b last:border-0"
                        >
                          <div className="text-xs text-muted-foreground pt-0.5">{label}</div>
                          <div>
                            <div className="break-words">{e}</div>
                            {s != null && s !== e && (
                              <div className="text-xs text-muted-foreground">Sistema: {s}</div>
                            )}
                          </div>
                          {match != null &&
                            (match ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <X className="h-4 w-4 text-red-600" />
                            ))}
                        </div>
                      );
                    });
                  })()}
                  <div className="pt-2 text-xs">
                    {notaMatch ? (
                      <span className="text-green-700">
                        ✓ Nota nº {notaMatch.numero} encontrada no sistema.
                      </span>
                    ) : (
                      <span className="text-amber-700">
                        Nenhuma nota com esse número foi encontrada no sistema.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConferirOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!erroDetalhe} onOpenChange={(o) => !o && setErroDetalhe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" /> Detalhes do erro
            </DialogTitle>
          </DialogHeader>
          {erroDetalhe &&
            (() => {
              const body = erroDetalhe.payload_resposta as
                | {
                    status?: string;
                    codigo?: string;
                    mensagem?: string;
                    mensagem_sefaz?: string;
                    erros?: Array<{
                      codigo?: string;
                      mensagem?: string;
                      correcao?: string;
                      campo?: string;
                    }>;
                  }
                | null
                | undefined;
              const erros = Array.isArray(body?.erros) ? body!.erros! : [];
              return (
                <div className="space-y-3 text-sm max-h-[60vh] overflow-auto">
                  {erroDetalhe.erro_mensagem && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                      <div className="text-xs font-medium uppercase tracking-wide text-red-700">
                        Mensagem
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words">
                        {erroDetalhe.erro_mensagem}
                      </div>
                    </div>
                  )}
                  {(body?.status || body?.codigo) && (
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      {body?.status && (
                        <>
                          <div className="text-xs text-muted-foreground">Status</div>
                          <div>{body.status}</div>
                        </>
                      )}
                      {body?.codigo && (
                        <>
                          <div className="text-xs text-muted-foreground">Código</div>
                          <div>{body.codigo}</div>
                        </>
                      )}
                      {body?.mensagem_sefaz && (
                        <>
                          <div className="text-xs text-muted-foreground">SEFAZ/Prefeitura</div>
                          <div className="whitespace-pre-wrap break-words">
                            {body.mensagem_sefaz}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {erros.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Erros retornados
                      </div>
                      {erros.map((er, i) => (
                        <div key={i} className="rounded-md border bg-muted/40 p-3 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            {er.codigo && (
                              <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5 font-mono">
                                {er.codigo}
                              </span>
                            )}
                            {er.campo && (
                              <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
                                campo: {er.campo}
                              </span>
                            )}
                          </div>
                          {er.mensagem && (
                            <div className="whitespace-pre-wrap break-words">{er.mensagem}</div>
                          )}
                          {er.correcao && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Correção:</span> {er.correcao}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <details className="rounded-md border bg-muted/30 p-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Retorno completo (JSON)
                    </summary>
                    <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(
                        body ?? { erro_mensagem: erroDetalhe.erro_mensagem },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </div>
              );
            })()}
          <DialogFooter>
            {erroDetalhe && (
              <Button
                variant="outline"
                onClick={() => {
                  const txt = JSON.stringify(
                    erroDetalhe.payload_resposta ?? erroDetalhe.erro_mensagem,
                    null,
                    2,
                  );
                  void navigator.clipboard.writeText(txt).then(() => toast.success("Copiado"));
                }}
              >
                Copiar JSON
              </Button>
            )}
            <Button variant="ghost" onClick={() => setErroDetalhe(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pdfVisualizando} onOpenChange={(o) => !o && setPdfVisualizando(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> DANFSE Nº {pdfVisualizando?.numero ?? "—"}
              {pdfVisualizando?.tomador_nome && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {pdfVisualizando.tomador_nome}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {pdfVisualizando?.url_pdf && (
            <PdfPreview
              nfseId={pdfVisualizando.id}
              baixar={baixarArquivo}
              className="w-full h-[75vh] bg-white border rounded"
              title={`DANFSE ${pdfVisualizando.numero ?? ""}`}
            />
          )}
          <DialogFooter>
            {pdfVisualizando?.url_pdf && (
              <a href={pdfVisualizando.url_pdf} target="_blank" rel="noreferrer">
                <Button variant="outline">
                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir em nova aba
                </Button>
              </a>
            )}
            <Button variant="ghost" onClick={() => setPdfVisualizando(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PdfPreview({
  nfseId,
  baixar,
  className,
  title,
}: {
  nfseId: string;
  baixar: (args: {
    data: { nfseId: string; tipo: "pdf" | "xml" };
  }) => Promise<{ base64: string; mime: string }>;
  className?: string;
  title?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    let criada: string | null = null;
    setUrl(null);
    setErro(null);
    void (async () => {
      try {
        const r = await baixar({ data: { nfseId, tipo: "pdf" } });
        if (cancelado) return;
        const bin = atob(r.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: r.mime });
        criada = URL.createObjectURL(blob);
        setUrl(criada);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Falha ao carregar PDF");
      }
    })();
    return () => {
      cancelado = true;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [nfseId, baixar]);
  if (erro)
    return (
      <div
        className={`${className ?? ""} flex items-center justify-center text-xs text-destructive p-4`}
      >
        {erro}
      </div>
    );
  if (!url)
    return (
      <div
        className={`${className ?? ""} flex items-center justify-center text-xs text-muted-foreground`}
      >
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando PDF…
      </div>
    );
  return <iframe src={url} title={title} className={className} />;
}
