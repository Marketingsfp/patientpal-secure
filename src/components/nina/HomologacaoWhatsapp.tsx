import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Send,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  obterWhatsappConfig,
  enviarMensagemWhatsapp,
  enviarTemplateWhatsapp,
  listarTemplatesWhatsapp,
} from "@/lib/whatsapp.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConsoleTesteNina } from "@/components/nina/ConsoleTesteNina";

const PREFIXO = "[TESTE]";

const CENARIOS: { id: string; label: string; texto: string }[] = [
  {
    id: "ping",
    label: "Ping simples",
    texto: "Mensagem de homologação do sistema. Nenhuma ação é necessária.",
  },
  {
    id: "confirmacao",
    label: "Confirmação de consulta",
    texto:
      "Olá! Confirmando sua consulta de amanhã às 14h30. Responda *1* para confirmar ou *2* para remarcar.",
  },
  {
    id: "financeiro",
    label: "Cobrança / Pix",
    texto:
      "Olá! Segue a cobrança da sua consulta no valor de R$ 130,00 com vencimento em 3 dias.",
  },
  {
    id: "formatacao",
    label: "Formatação WhatsApp",
    texto:
      "Teste de formatação: *negrito*, _itálico_, ~riscado~, `código` e link https://exemplo.com",
  },
];

type Log = {
  at: string;
  to: string;
  modo: "texto" | "template";
  descricao: string;
  ok: boolean;
  detalhe: string;
};

type TplItem = { name: string; language: string; status: string };

export function HomologacaoWhatsapp() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const podeEscrever = usePodeEscrever("nina");

  const obter = useServerFn(obterWhatsappConfig);
  const enviarTexto = useServerFn(enviarMensagemWhatsapp);
  const enviarTpl = useServerFn(enviarTemplateWhatsapp);
  const listarTpls = useServerFn(listarTemplatesWhatsapp);

  const [cfg, setCfg] = useState<{
    ativo: boolean;
    display_phone_number: string;
    has_access_token: boolean;
    phone_number_id: string;
  } | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [numero, setNumero] = useState("");
  const [modo, setModo] = useState<"texto" | "template">("texto");
  const [cenario, setCenario] = useState(CENARIOS[0]!.id);
  const [texto, setTexto] = useState(CENARIOS[0]!.texto);
  const [templates, setTemplates] = useState<TplItem[]>([]);
  const [tplName, setTplName] = useState("");
  const [tplParams, setTplParams] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = (await obter({ data: { clinicaId } })) as any;
      setCfg({
        ativo: Boolean(r.ativo),
        display_phone_number: r.display_phone_number ?? "",
        has_access_token: Boolean(r.has_access_token),
        phone_number_id: r.phone_number_id ?? "",
      });
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, obter]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarTemplates = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const r = (await listarTpls({ data: { clinicaId } })) as any;
      const items: TplItem[] = (r.templates ?? []).map((t: any) => ({
        name: t.name,
        language: t.language,
        status: t.status,
      }));
      setTemplates(items);
      const aprovado = items.find((t) => t.status === "APPROVED");
      if (aprovado && !tplName) setTplName(`${aprovado.name}|${aprovado.language}`);
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, listarTpls, tplName]);

  useEffect(() => {
    if (modo === "template" && templates.length === 0) void carregarTemplates();
  }, [modo, templates.length, carregarTemplates]);

  const pronto = Boolean(cfg?.phone_number_id && cfg?.has_access_token);

  const registrar = (log: Log) => setLogs((prev) => [log, ...prev].slice(0, 30));

  const enviar = async () => {
    if (!clinicaId) return;
    const to = numero.replace(/\D/g, "");
    if (to.length < 10) {
      toast.error("Informe o número com DDI e DDD. Ex: 5511987654321");
      return;
    }
    setEnviando(true);
    const agora = new Date().toLocaleString("pt-BR");
    try {
      if (modo === "texto") {
        const corpo = `${PREFIXO} ${texto.trim()}`;
        await enviarTexto({ data: { clinicaId, to, text: corpo } });
        registrar({
          at: agora,
          to,
          modo: "texto",
          descricao: CENARIOS.find((c) => c.id === cenario)?.label ?? "Texto livre",
          ok: true,
          detalhe: corpo.slice(0, 120),
        });
        toast.success("Mensagem de teste enviada.");
      } else {
        const [name, language] = tplName.split("|");
        if (!name) {
          toast.error("Selecione um template aprovado.");
          setEnviando(false);
          return;
        }
        const params = tplParams
          .split("|")
          .map((p) => p.trim())
          .filter(Boolean);
        await enviarTpl({
          data: { clinicaId, to, name, language: language || "pt_BR", params },
        });
        registrar({
          at: agora,
          to,
          modo: "template",
          descricao: `${name} (${language})`,
          ok: true,
          detalhe: params.join(" | ") || "sem variáveis",
        });
        toast.success("Template de teste enviado.");
      }
    } catch (e: any) {
      registrar({
        at: agora,
        to,
        modo,
        descricao: modo === "texto" ? "Texto livre" : tplName,
        ok: false,
        detalhe: String(e?.message ?? e).slice(0, 200),
      });
      mostrarErro(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <ConsoleTesteNina />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                Homologação do WhatsApp
              </CardTitle>
              <CardDescription>
                Envia mensagens de teste reais pelo número oficial da clínica
                {cfg?.display_phone_number ? ` (${cfg.display_phone_number})` : ""}. Todo envio é
                prefixado com <strong>{PREFIXO}</strong> para ficar rastreável.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void carregar()}>
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="text-sm text-muted-foreground">Verificando configuração…</div>
          ) : pronto ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Configuração pronta para homologação.
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" /> Preencha Phone Number ID e Access Token na aba
              Configuração antes de testar.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enviar teste</CardTitle>
          <CardDescription>
            Fora da janela de 24h o WhatsApp só entrega mensagens de template aprovado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Número de destino (DDI + DDD)</Label>
              <Input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="5511987654321"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo de envio</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as "texto" | "template")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="texto">Texto livre (janela de 24h)</SelectItem>
                  <SelectItem value="template">Template aprovado (HSM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {modo === "texto" ? (
            <>
              <div className="space-y-1">
                <Label>Cenário</Label>
                <Select
                  value={cenario}
                  onValueChange={(v) => {
                    setCenario(v);
                    const c = CENARIOS.find((x) => x.id === v);
                    if (c) setTexto(c.texto);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CENARIOS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Mensagem</Label>
                <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Será enviado como: <span className="font-mono">{PREFIXO} {texto.slice(0, 60)}…</span>
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Template</Label>
                  <Button variant="ghost" size="sm" onClick={() => void carregarTemplates()}>
                    Recarregar
                  </Button>
                </div>
                <Select value={tplName} onValueChange={setTplName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template aprovado" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((t) => t.status === "APPROVED")
                      .map((t) => (
                        <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                          {t.name} ({t.language})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Variáveis do corpo (separadas por |)</Label>
                <Input
                  value={tplParams}
                  onChange={(e) => setTplParams(e.target.value)}
                  placeholder="Maria | 20/05 às 14h"
                />
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void enviar()} disabled={!pronto || enviando || !podeEscrever}>
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar teste
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico desta sessão</CardTitle>
          <CardDescription>Registros locais dos testes feitos agora nesta tela.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum teste enviado ainda.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((l, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={l.ok ? "default" : "destructive"}>
                        {l.ok ? "Enviado" : "Falhou"}
                      </Badge>
                      <span className="font-medium">{l.descricao}</span>
                      <Badge variant="outline">{l.modo}</Badge>
                    </div>
                    <p className="truncate text-muted-foreground">{l.detalhe}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>{l.to}</div>
                    <div>{l.at}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
