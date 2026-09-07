/**
 * Modal de auditoria da conversa (somente leitura).
 *
 * Usado pelo botão "Ver conversa" da Revisão de aprendizados: abre sobre a
 * própria página, sem trocar de rota e sem levar para Conversas WhatsApp.
 * A conversa é carregada pelo conversa_id do reporte.
 *
 * Não envia mensagem, não resolve, não reabre, não transfere, não altera
 * responsável, não marca leitura e não mexe em contadores de não lidos.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@tanstack/react-start";
import { lerConversaAuditoria } from "@/lib/nina/feedback-conversa.functions";
import { ConversationSystemEvent, type ConversaEvento } from "./ConversationSystemEvent";

type Mensagem = {
  id: string;
  direction: string | null;
  body: string | null;
  tipo: string | null;
  enviada_por: string | null;
  recebida_em: string;
  media_url: string | null;
  media_mime: string | null;
};

type Dados = {
  conversa: {
    id: string;
    titulo: string;
    numero: string | null;
    status: string | null;
    is_teste: boolean;
    protocolo: string | null;
    atendente_nome: string | null;
  };
  mensagens: Mensagem[];
  mensagemEncontrada: boolean | null;
  eventos: ConversaEvento[];
};

/** Timestamp real persistido, sempre DD/MM/AAAA HH:mm:ss. */
function fmtHora(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Autoria explícita: não depender só do lado do balão. */
function autorDe(m: Mensagem, atendenteNome: string | null) {
  const por = (m.enviada_por ?? "").toLowerCase();
  if (por === "sistema") return "Sistema";
  if (por === "nina" || por === "ia" || por === "bot") return "Nina";
  if (por === "humano" || por === "atendente")
    return atendenteNome ? `Atendente — ${atendenteNome}` : "Atendente";
  if (por === "paciente") return "Paciente";
  return m.direction === "out" ? "Nina" : "Paciente";
}

/** Código curto e legível para IDs longos (erro, conversa, mensagem). */
function curto(id: string | null | undefined) {
  if (!id) return null;
  return id.slice(0, 8).toUpperCase();
}

export function ConversaAuditoriaDialog({
  clinicaId,
  conversaId,
  mensagemId,
  erroId,
  reportadoEm,
  aberto,
  onOpenChange,
}: {
  clinicaId: string | null;
  conversaId: string | null;
  mensagemId: string | null;
  /** Id do reporte, exibido no cabeçalho da auditoria. */
  erroId?: string | null;
  /** Quando o erro foi reportado (≠ data da mensagem da Nina). */
  reportadoEm?: string | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const ler = useServerFn(lerConversaAuditoria);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const alvoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto || !clinicaId || !conversaId) return;
    let vivo = true;
    setCarregando(true);
    setErro(null);
    setDados(null);
    void (async () => {
      try {
        const r = (await ler({
          data: { clinicaId, conversaId, mensagemId: mensagemId ?? null },
        })) as unknown as Dados;
        if (vivo) setDados(r);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível abrir a conversa.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [aberto, clinicaId, conversaId, mensagemId, ler]);

  useEffect(() => {
    if (!dados) return;
    const t = setTimeout(() => {
      alvoRef.current?.scrollIntoView({ block: "center" });
    }, 60);
    return () => clearTimeout(t);
  }, [dados]);

  // Mensagens e eventos em uma única linha do tempo, por horário.
  const timeline = dados
    ? [
        ...dados.mensagens.map((m) => ({ t: m.recebida_em, kind: "msg" as const, msg: m })),
        ...dados.eventos.map((ev) => ({ t: ev.created_at, kind: "evento" as const, ev })),
      ].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
    : [];

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {dados?.conversa.titulo ?? "Conversa"}
            <Badge variant="outline">Somente leitura</Badge>
            {dados?.conversa.is_teste && <Badge variant="secondary">Homologação</Badge>}
          </DialogTitle>
          <DialogDescription>
            Auditoria da conversa exata do erro reportado. Nenhuma ação de atendimento é
            possível aqui.
          </DialogDescription>
        </DialogHeader>

        {carregando && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando conversa…
          </div>
        )}
        {erro && <p className="py-6 text-center text-sm text-destructive">{erro}</p>}

        {dados && !carregando && !erro && (
          <>
            {mensagemId && dados.mensagemEncontrada === false && (
              <div className="rounded-md border border-atd-warn bg-atd-warn-bg px-3 py-2 text-xs text-atd-warn-ink">
                A mensagem reportada não está mais disponível nesta conversa. O histórico é
                exibido sem destaque.
              </div>
            )}
            <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-md bg-atd-bg p-3">
              {timeline.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">Sem mensagens.</p>
              )}
              {timeline.map((item) => {
                if (item.kind === "evento") {
                  return <ConversationSystemEvent key={`ev-${item.ev.id}`} evento={item.ev} />;
                }
                const m = item.msg;
                const out = m.direction === "out";
                const destacada = mensagemId === m.id;
                const autor = autorDe(m, dados.conversa.atendente_nome);
                if (m.enviada_por === "sistema") {
                  return (
                    <div
                      key={m.id}
                      ref={destacada ? alvoRef : undefined}
                      data-msg-id={m.id}
                      className={`flex justify-center ${
                        destacada ? "rounded-xl bg-destructive/10 px-1 py-1 ring-2 ring-destructive" : ""
                      }`}
                    >
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg border border-atd-blue/20 bg-atd-blue-tint px-3 py-2 text-center text-xs text-atd-blue-ink">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                          Sistema
                        </div>
                        {m.body}
                        <div className="mt-1 text-[10px] opacity-70">{fmtHora(m.recebida_em)}</div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={m.id}
                    ref={destacada ? alvoRef : undefined}
                    data-msg-id={m.id}
                    className={`flex flex-col gap-1 ${out ? "items-end" : "items-start"} ${
                      destacada
                        ? "rounded-xl bg-destructive/10 px-1 py-1 ring-2 ring-destructive"
                        : ""
                    }`}
                  >
                    {destacada && (
                      <span className="inline-flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" /> MENSAGEM REPORTADA
                      </span>
                    )}
                    <div
                      className={`max-w-[68%] break-words rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        out
                          ? "rounded-br-sm bg-atd-go text-atd-on-strong"
                          : "rounded-bl-sm border border-atd-border bg-atd-surface text-atd-ink"
                      }`}
                    >
                      <div
                        className={`mb-1 text-[11px] font-semibold ${out ? "text-atd-on-strong/90" : "text-atd-ink-soft"}`}
                      >
                        {autor}
                      </div>
                      {m.media_url && (
                        <a
                          href={m.media_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block underline"
                        >
                          Anexo {m.media_mime ? `(${m.media_mime})` : ""}
                        </a>
                      )}
                      <div className="whitespace-pre-wrap">{m.body || `[${m.tipo}]`}</div>
                      <div
                        className={`mt-1 text-[11px] ${out ? "text-atd-on-strong/80" : "text-atd-ink-soft"}`}
                      >
                        {fmtHora(m.recebida_em)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
