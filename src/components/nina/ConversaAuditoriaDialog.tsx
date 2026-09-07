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
import {
  autorDe,
  curto,
  fmtHora,
  localizarMensagem,
  montarTimeline,
  type MensagemAuditoria as Mensagem,
} from "@/lib/nina/conversa-auditoria";


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
  const timeline = dados ? montarTimeline(dados.mensagens, dados.eventos) : [];

  // Data real da mensagem reportada (≠ data em que o erro foi reportado).
  // Localização sempre por id — nunca por texto.
  const dataMensagem = dados
    ? (localizarMensagem(dados.mensagens, mensagemId)?.recebida_em ?? null)
    : null;

  // CASO 1 — sem conversa vinculada: nunca cair na "primeira conversa do lead".
  const semVinculo = !conversaId;

  const linhaInfo = (rotulo: string, valor: string | null | undefined) =>
    valor ? (
      <div className="flex gap-1">
        <span className="text-muted-foreground">{rotulo}:</span>
        <span className="font-medium">{valor}</span>
      </div>
    ) : null;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Conversa relacionada ao erro
            <Badge variant="outline">Somente leitura</Badge>
            {dados?.conversa.is_teste && <Badge variant="secondary">Homologação</Badge>}
          </DialogTitle>
          <DialogDescription>
            Auditoria da conversa exata do erro reportado. Nenhuma ação de atendimento é
            possível aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-2">
          {linhaInfo("Paciente", dados?.conversa.titulo ?? null)}
          {linhaInfo("Erro", erroId ? `#${curto(erroId)}` : null)}
          {linhaInfo("Conversa", curto(conversaId))}
          {linhaInfo("Mensagem reportada", curto(mensagemId))}
          {linhaInfo("Data da mensagem", dataMensagem ? fmtHora(dataMensagem) : null)}
          {linhaInfo("Erro reportado em", reportadoEm ? fmtHora(reportadoEm) : null)}
          {linhaInfo("Protocolo", dados?.conversa.protocolo ?? null)}
        </div>

        {semVinculo && (
          <p className="rounded-md border border-atd-warn bg-atd-warn-bg px-3 py-4 text-center text-sm text-atd-warn-ink">
            Não foi possível localizar a conversa exata vinculada a este reporte.
          </p>
        )}

        {!semVinculo && carregando && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando conversa…
          </div>
        )}
        {!semVinculo && erro && (
          <p className="rounded-md border border-atd-warn bg-atd-warn-bg px-3 py-4 text-center text-sm text-atd-warn-ink">
            Não foi possível localizar a conversa exata vinculada a este reporte.
          </p>
        )}

        {dados && !carregando && !erro && (
          <>
            {mensagemId && dados.mensagemEncontrada === false && (
              <div className="rounded-md border border-atd-warn bg-atd-warn-bg px-3 py-2 text-xs text-atd-warn-ink">
                Conversa localizada, mas a mensagem original do reporte não foi encontrada.
                Nenhuma outra mensagem é destacada por aproximação.
              </div>
            )}
            {!mensagemId && (
              <div className="rounded-md border border-atd-warn bg-atd-warn-bg px-3 py-2 text-xs text-atd-warn-ink">
                Vínculo histórico exato indisponível: este reporte não guardou a mensagem
                específica. A conversa é exibida sem destaque.
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
