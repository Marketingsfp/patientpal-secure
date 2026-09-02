import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  RefreshCw,
  Trash2,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import {
  listarBasesKb,
  enviarBaseKb,
  reprocessarBaseKb,
  excluirBaseKb,
  testarBaseKb,
} from "@/lib/nina/kb.functions";

type Base = {
  id: string;
  titulo: string | null;
  arquivo_nome: string | null;
  arquivo_tipo: string | null;
  arquivo_tamanho: number | null;
  versao: number;
  status: string;
  registros_total: number | null;
  linhas_lidas: number | null;
  erros: string[] | null;
  validacao: any;
  enviado_por_nome: string | null;
  processado_em: string | null;
  ativada_em: string | null;
  created_at: string;
};

function tamanho(bytes?: number | null) {
  if (!bytes) return "—";
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function dataHora(v?: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR") : "—";
}

function corStatus(s: string) {
  if (s === "ATIVA") return "default";
  if (s === "ERRO") return "destructive";
  return "secondary";
}

/**
 * Nina → Base de conhecimentos.
 * Envio da planilha oficial (TAP), processamento, versões e homologação.
 * As permissões são conferidas no servidor: aqui a UI apenas reflete.
 */
export function BaseConhecimento() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const ehAdmin = ["admin", "gestor"].includes(String(clinicaAtual?.role ?? ""));

  const listarFn = useServerFn(listarBasesKb);
  const enviarFn = useServerFn(enviarBaseKb);
  const reprocessarFn = useServerFn(reprocessarBaseKb);
  const excluirFn = useServerFn(excluirBaseKb);
  const testarFn = useServerFn(testarBaseKb);

  const [bases, setBases] = useState<Base[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [resultado, setResultado] = useState<any>(null);
  const [testando, setTestando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = (await listarFn({ data: { clinicaId } })) as { bases: Base[] };
      setBases(r.bases ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, listarFn]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ativa = bases.find((b) => b.status === "ATIVA") ?? null;

  async function enviarArquivo(file: File) {
    if (!clinicaId) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo maior que 20 MB.");
      return;
    }
    setOcupado(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192)
        bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      const r = (await enviarFn({
        data: { clinicaId, nomeArquivo: file.name, conteudoBase64: btoa(bin) },
      })) as any;
      if (r?.status === "ATIVA")
        toast.success(`Base v${r.versao} ativada com ${r.registros_total} registros.`);
      else toast.error(`Falha ao processar: ${(r?.erros ?? []).join(" | ") || "verifique o arquivo"}`);
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setOcupado(true);
    try {
      await fn();
      toast.success(msg);
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    if (!clinicaId || pergunta.trim().length < 2) return;
    setTestando(true);
    setResultado(null);
    try {
      setResultado(await testarFn({ data: { clinicaId, pergunta: pergunta.trim() } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" /> Base de conhecimentos da Nina
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {ehAdmin && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void enviarArquivo(f);
                  }}
                />
                <Button size="sm" onClick={() => inputRef.current?.click()} disabled={ocupado}>
                  <Upload className="mr-2 h-4 w-4" />
                  {ativa ? "Substituir planilha" : "Enviar planilha"}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            A planilha oficial (ex.: <strong>TAP — Tabela de Atendimentos e Preços</strong>) vira a
            fonte de verdade da Nina para especialidades, exames, preços, dias e preparos. Formatos
            aceitos: .xlsx, .xls e .csv, até 20 MB. A base anterior continua no ar até a nova ser
            validada.
          </p>
          {ativa ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Ativa · v{ativa.versao}
                </Badge>
                <span className="font-medium">{ativa.arquivo_nome}</span>
                <span className="text-muted-foreground">
                  {ativa.registros_total ?? 0} registros · {tamanho(ativa.arquivo_tamanho)} ·
                  ativada em {dataHora(ativa.ativada_em)}
                </span>
              </div>
              {Array.isArray(ativa.validacao?.avisos) && ativa.validacao.avisos.length > 0 && (
                <div className="mt-2 flex items-start gap-2 text-amber-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{ativa.validacao.avisos.slice(0, 4).join(" · ")}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
              Nenhuma base ativa. A Nina segue usando apenas o cadastro do sistema.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4" /> Testar conhecimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Ex.: quanto custa ultrassom de tireoide?"
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void testar();
              }}
            />
            <Button onClick={() => void testar()} disabled={testando || !ehAdmin}>
              {testando ? "Consultando…" : "Perguntar"}
            </Button>
          </div>
          {resultado && (
            <div className="space-y-3">
              <Textarea readOnly value={resultado.resposta ?? ""} className="min-h-24" />
              <div className="text-xs text-muted-foreground">
                Fonte: {resultado.base ? `base v${resultado.base.versao}` : "nenhuma base ativa"} ·
                {resultado.encontrado
                  ? ` ${resultado.registros?.length ?? 0} registro(s)`
                  : " nada encontrado"}
                {resultado.ambiguo ? " · resultado ambíguo" : ""}
              </div>
              {(resultado.registros ?? []).slice(0, 6).map((r: any) => (
                <div key={r.id} className="rounded-md border p-2 text-xs">
                  <div className="font-medium">{r.procedimento ?? r.categoria ?? "—"}</div>
                  <div className="text-muted-foreground">
                    {[
                      r.medico && `Médico: ${r.medico}`,
                      r.dia && `Dia: ${r.dia}`,
                      r.horario && `Horário: ${r.horario}`,
                      r.preco_dinheiro != null && `Dinheiro/PIX: R$ ${r.preco_dinheiro}`,
                      r.preco_cartao != null && `Cartão: R$ ${r.preco_cartao}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Origem: {r.aba_origem ?? "—"} · linha {r.linha_origem ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de versões</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {bases.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma planilha enviada ainda.</p>
          )}
          {bases.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={corStatus(b.status) as any}>{b.status}</Badge>
                  <span className="font-medium">v{b.versao}</span>
                  <span className="truncate">{b.arquivo_nome}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {b.registros_total ?? 0} registros · enviado por {b.enviado_por_nome ?? "—"} ·{" "}
                  {dataHora(b.created_at)}
                  {b.erros?.length ? ` · erro: ${b.erros[0]}` : ""}
                </div>
              </div>
              {ehAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado}
                    onClick={() =>
                      void acao(
                        () => reprocessarFn({ data: { clinicaId: clinicaId!, baseId: b.id } }),
                        "Base reprocessada.",
                      )
                    }
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Reprocessar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={ocupado}
                    onClick={() =>
                      void acao(
                        () => excluirFn({ data: { clinicaId: clinicaId!, baseId: b.id } }),
                        "Base excluída.",
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
