import type { ButtonHTMLAttributes } from "react";
import { Badge } from "@/components/ui/badge";
import { BadgeConversaNova } from "./BadgeConversaNova";
import { BadgeEspera } from "./BadgeEspera";
import { tituloConversa, type ConversaComNome } from "@/lib/atendimento/rotulo-conversa";
import { tiposDeBadgeDoCard } from "@/lib/atendimento/badge-nina";
import type { ConversaNova } from "@/lib/atendimento/conversa-nova";

export type ConversaCardData = ConversaComNome &
  ConversaNova & {
    ultima_msg_em?: string | null;
    nao_lidas?: number | null;
    handoff_motivo?: string | null;
  };

/** Mesmo card na Inbox operacional e na simulação local. */
export function InboxConversationCard({
  conversa: c,
  selecionada,
  meuId,
  nomeUsuario,
  esperaDesde,
  previa,
  simulada = false,
  ...eventos
}: {
  conversa: ConversaCardData;
  selecionada: boolean;
  meuId: string | null;
  nomeUsuario: (id: string | null | undefined) => string;
  esperaDesde?: string | null;
  previa?: string;
  simulada?: boolean;
} & Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "onMouseEnter" | "onMouseLeave" | "onFocus" | "onBlur"
>) {
  const fmtData = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");
  return (
    <button
      type="button"
      data-testid="item-conversa"
      data-conversa-id={c.id}
      aria-current={selecionada ? "true" : undefined}
      {...eventos}
      className={`oszap-conversation relative w-full border-b border-atd-border py-1.5 pl-3 pr-2 text-left transition-colors hover:bg-atd-blue-hover ${
        selecionada
          ? "bg-atd-blue-soft before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-atd-blue before:content-['']"
          : "bg-atd-surface"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm truncate flex-1" title={tituloConversa(c)}>
          {tituloConversa(c)}
        </span>
        <BadgeConversaNova conversa={simulada ? { ...c, is_teste: false } : c} />
        {Number(c.nao_lidas ?? 0) > 0 && (
          <Badge className="bg-atd-blue text-atd-on-strong text-xs px-1.5 py-0">
            {Number(c.nao_lidas ?? 0)}
          </Badge>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
        {/* Lista canônica e já deduplicada por chave semântica. */}
        {tiposDeBadgeDoCard(c, meuId).map((tipo) => {
          // Cards mais limpos: sem status nem aviso de timeout (o cabeçalho da conversa mantém o status).
          if (tipo === "status" || tipo === "timeout-nina") return null;
          if (tipo === "sem-responsavel")
            return (
              <Badge key={tipo} className="bg-atd-danger text-atd-on-strong text-[11px]">
                Sem responsável
              </Badge>
            );
          if (tipo === "nina")
            return (
              <Badge
                key={tipo}
                className="bg-atd-ai-bg text-atd-ai-ink text-[11px] border border-atd-ai/30"
              >
                ✦ Nina
              </Badge>
            );
          return (
            <Badge
              key={tipo}
              className="text-[11px] bg-muted text-muted-foreground border border-border"
            >
              {nomeUsuario(c.atribuida_user_id)}
            </Badge>
          );
        })}
        {(c.is_teste || simulada) && (
          <Badge
            className="bg-atd-warn-bg text-atd-warn-ink text-[11px] font-bold tracking-wide border border-atd-warn"
            data-testid="etiqueta-teste"
          >
            {simulada ? "SIMULAÇÃO" : "TESTE"}
          </Badge>
        )}
        <BadgeEspera desde={esperaDesde} />
      </div>
      {previa && (
        <div className="mt-1 truncate text-xs leading-4 text-muted-foreground" title={previa}>
          {previa}
        </div>
      )}
      <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtData(c.ultima_msg_em)}</div>
    </button>
  );
}
