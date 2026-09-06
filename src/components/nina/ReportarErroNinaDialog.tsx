/**
 * Reportar erro da Nina — botão de um clique (FASE 2).
 *
 * Substitui o antigo formulário no balão: um único controle, sem modal,
 * categoria ou correção. Só registra o erro na fila de Revisão de
 * aprendizados; não apaga a mensagem, não transfere e não encerra a conversa.
 *
 * O reporte usa sempre o ID da mensagem clicada e o ID da conversa a que ela
 * pertence — capturados no clique —, então trocar de lead durante o registro
 * não muda o destino do reporte.
 */
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { reportarErroRapidoMensagemNina } from "@/lib/nina/feedback-erros.functions";

export const TEXTO_REPORTE_SUCESSO = "Erro enviado para revisão.";
export const TEXTO_REPORTE_DUPLICADO = "Esta mensagem já foi enviada para revisão.";
export const TEXTO_REPORTE_FALHA = "Não foi possível registrar o erro. Tente novamente.";
export const ROTULO_REPORTE = "Reportar erro da Nina";

type Props = {
  clinicaId: string;
  /** Conversa da mensagem clicada — não a conversa selecionada no momento da resposta. */
  conversaId: string;
  mensagemId: string;
  className?: string;
};

export function ReportarErroNinaBotao({ clinicaId, conversaId, mensagemId, className }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [reportado, setReportado] = useState(false);
  const emCurso = useRef(false);
  const reportar = useServerFn(reportarErroRapidoMensagemNina);

  const clicar = async (e: React.MouseEvent) => {
    // Não deixa o clique escapar para a linha/conversa nem mexer no scroll.
    e.preventDefault();
    e.stopPropagation();
    if (emCurso.current) return;
    emCurso.current = true;
    setEnviando(true);
    // Identificadores fixados agora: trocar de lead não muda o destino.
    const alvo = { clinicaId, conversaId, mensagemId };
    try {
      const r = await reportar({ data: alvo });
      setReportado(true);
      if (r && (r as { duplicado?: boolean }).duplicado) toast.info(TEXTO_REPORTE_DUPLICADO);
      else toast.success(TEXTO_REPORTE_SUCESSO);
    } catch {
      toast.error(TEXTO_REPORTE_FALHA);
    } finally {
      emCurso.current = false;
      setEnviando(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ROTULO_REPORTE}
          title={ROTULO_REPORTE}
          disabled={enviando}
          aria-busy={enviando}
          data-reportado={reportado ? "true" : undefined}
          onClick={(e) => void clicar(e)}
          className={
            className ??
            "mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-destructive text-destructive-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          }
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{ROTULO_REPORTE}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
