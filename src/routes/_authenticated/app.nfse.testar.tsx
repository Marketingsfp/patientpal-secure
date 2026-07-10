import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { emitirNfse, consultarNfse } from "@/lib/nfse.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";

export const Route = createFileRoute("/_authenticated/app/nfse/testar")({
  component: TestarNfse,
  head: () => ({ meta: [{ title: "Emitir NFS-e (teste) — ClinicaOS" }] }),
});

interface Emitente {
  id: string;
  nome: string;
  cnpj: string;
  focus_ambiente: string;
  descricao_servico_padrao: string | null;
}

function TestarNfse() {
  const { clinicaAtual } = useClinica();
  const emit = useServerFn(emitirNfse);
  const consulta = useServerFn(consultarNfse);

  const [emitentes, setEmitentes] = useState<Emitente[]>([]);
  const [emitenteId, setEmitenteId] = useState("");
  const [nome, setNome] = useState("Cliente Teste");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [valor, setValor] = useState("1.00");
  const [descricao, setDescricao] = useState("Consulta médica — teste de emissão");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{
    id: string;
    ref?: string;
    ok: boolean;
    error?: string;
    focus?: unknown;
  } | null>(null);
  const [notaId, setNotaId] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<{
    status: string | null;
    numero?: string | null;
    url_pdf?: string | null;
    erro?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!clinicaAtual) return;
    void (async () => {
      const { data } = await supabase
        .from("nfse_emitentes")
        .select("id, nome, cnpj, focus_ambiente, descricao_servico_padrao")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true);
      const list = (data ?? []) as Emitente[];
      setEmitentes(list);
      if (list[0] && !emitenteId) {
        setEmitenteId(list[0].id);
        if (list[0].descricao_servico_padrao) setDescricao(list[0].descricao_servico_padrao);
      }
    })();
  }, [clinicaAtual?.clinica_id]); // eslint-disable-line

  const onEmitir = async () => {
    if (!emitenteId) return toast.error("Selecione um emitente");
    if (!nome.trim()) return toast.error("Informe o nome do tomador");
    const cpfLimpo = (cpf || "").replace(/\D/g, "");
    if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
      return toast.error("CPF/CNPJ do tomador é obrigatório (11 ou 14 dígitos).");
    }
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) return toast.error("Valor inválido");

    setLoading(true);
    setResultado(null);
    setStatusInfo(null);
    try {
      const r = await emit({
        data: {
          emitenteId,
          valorServicos: valorNum,
          descricaoServicos: descricao,
          tomador: { nome, cpfCnpj: cpfLimpo, email: email || undefined },
        },
      });
      setResultado(r);
      setNotaId(r.id);
      if (r.ok) {
        toast.success("Nota enviada ao Focus. Aguarde autorização da prefeitura.");
        // Faz um polling de consulta após alguns segundos
        setTimeout(() => void onConsultar(r.id), 4000);
      } else {
        toast.error(r.error ?? "Erro ao enviar");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onConsultar = async (idOverride?: string) => {
    const id = idOverride ?? notaId;
    if (!id) return;
    try {
      const r = await consulta({ data: { id } });
      const { data: nota } = await supabase
        .from("nfse")
        .select("status, numero, url_pdf, erro_mensagem, focus_status")
        .eq("id", id)
        .single();
      setStatusInfo({
        status: nota?.focus_status ?? r.status,
        numero: nota?.numero,
        url_pdf: nota?.url_pdf,
        erro: nota?.erro_mensagem,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> Emitir NFS-e (teste)
        </h1>
        <p className="text-sm text-muted-foreground">
          Use esta tela para validar a integração com o Focus NFe.{" "}
          <Link to="/app/configuracoes/nfse" className="text-primary underline">
            Cadastrar emitente
          </Link>
        </p>
      </div>

      {emitentes.length === 0 ? (
        <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-300 p-4 text-sm">
          Nenhum emitente cadastrado.{" "}
          <Link to="/app/configuracoes/nfse" className="text-primary underline font-medium">
            Cadastre um agora
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <Label>Emitente (CNPJ)</Label>
            <Select value={emitenteId} onValueChange={setEmitenteId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {emitentes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome} — {e.cnpj}{" "}
                    <span className="text-xs opacity-60">({e.focus_ambiente})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <div className="space-y-1">
              <Label>Nome do tomador</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <CurrencyInput value={valor} onChange={setValor} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>CPF/CNPJ *</Label>
              <Input
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="só números (11 ou 14 dígitos)"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>E-mail (opcional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descrição dos serviços</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onEmitir}
              disabled={
                loading ||
                !(
                  (cpf || "").replace(/\D/g, "").length === 11 ||
                  (cpf || "").replace(/\D/g, "").length === 14
                )
              }
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…
                </>
              ) : (
                "Emitir NFS-e"
              )}
            </Button>
            {notaId && (
              <Button variant="outline" onClick={() => void onConsultar()}>
                <RefreshCw className="h-4 w-4 mr-2" /> Consultar status
              </Button>
            )}
          </div>
        </div>
      )}

      {resultado && (
        <div
          className={`rounded-lg border p-4 text-sm ${resultado.ok ? "bg-green-50 border-green-300 dark:bg-green-950/20" : "bg-red-50 border-red-300 dark:bg-red-950/20"}`}
        >
          <p className="font-medium mb-1">
            {resultado.ok ? "✅ Enviada ao Focus NFe" : "❌ Falhou"}
          </p>
          {resultado.ref && <p className="font-mono text-xs">ref: {resultado.ref}</p>}
          {resultado.error && <p className="text-destructive">{resultado.error}</p>}
        </div>
      )}

      {statusInfo && (
        <div className="rounded-lg border bg-card p-4 text-sm space-y-1">
          <p>
            <strong>Status Focus:</strong>{" "}
            <span className="font-mono">{statusInfo.status ?? "—"}</span>
          </p>
          {statusInfo.numero && (
            <p>
              <strong>Número NFS-e:</strong> {statusInfo.numero}
            </p>
          )}
          {statusInfo.url_pdf && (
            <p>
              <a
                href={statusInfo.url_pdf}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline inline-flex items-center gap-1"
              >
                Abrir DANFSe (PDF) <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}
          {statusInfo.erro && (
            <p className="text-destructive">
              <strong>Erro:</strong> {statusInfo.erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
