import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  detalhesDaMensagemNina,
  type SaidaMensagemView,
} from "@/lib/nina/saida-mensagem.functions";
import { type MensagemInspecao, mensagemNinaInspecionavel } from "@/lib/nina/inspecao-mensagem";
import { ReportarErroNinaBotao } from "./ReportarErroNinaDialog";
import { DetalhesMensagemNina } from "./DetalhesMensagemNina";

type Props = {
  clinicaId: string;
  conversaId: string;
  mensagem: MensagemInspecao;
  saida: SaidaMensagemView | "falha" | undefined;
  parte: "reporte" | "detalhes";
};

/** Mesmo controle de inspeção nos dois ambientes, sem selo de confiança. */
export function InspecaoMensagemNina({ clinicaId, conversaId, mensagem, saida, parte }: Props) {
  const queryClient = useQueryClient();
  const mensagemId = String(mensagem.id ?? "");
  const foraEscopo =
    (mensagem.clinica_id && mensagem.clinica_id !== clinicaId) ||
    (mensagem.conversa_id && mensagem.conversa_id !== conversaId) ||
    (saida &&
      saida !== "falha" &&
      (saida.clinicaId !== clinicaId ||
        saida.conversaId !== conversaId ||
        saida.mensagemId !== mensagemId));
  const noEscopo =
    saida &&
    saida !== "falha" &&
    saida.clinicaId === clinicaId &&
    saida.conversaId === conversaId &&
    saida.mensagemId === mensagemId
      ? saida
      : undefined;
  const elegivel = noEscopo ? noEscopo.inspecionavel : mensagemNinaInspecionavel(mensagem);
  const candidata =
    mensagem.direction === "out" &&
    mensagem.status !== "system" &&
    (mensagem.enviada_por === "nina" || mensagem.enviada_por === "sistema");
  if (foraEscopo || !candidata || (noEscopo && !elegivel)) return null;
  if (parte === "reporte")
    return elegivel ? (
      <ReportarErroNinaBotao
        clinicaId={clinicaId}
        conversaId={conversaId}
        mensagemId={mensagemId}
        execucaoId={noEscopo?.execucaoId ?? null}
      />
    ) : null;
  return (
    <span className="flex items-center gap-2" data-inspecao-nina={mensagemId}>
      {saida === "falha" && (
        <>
        <span className="text-muted-foreground">Falha ao carregar</span>
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: ["nina-saidas-mensagens", clinicaId, conversaId],
            })
          }
        >
          Tentar novamente
        </button>
        </>
      )}
      {elegivel && (
        <DetalhesMensagemBotao
          clinicaId={clinicaId}
          conversaId={conversaId}
          mensagemId={mensagemId}
        />
      )}
    </span>
  );
}

function DetalhesMensagemBotao(alvo: {
  clinicaId: string;
  conversaId: string;
  mensagemId: string;
}) {
  const carregar = useServerFn(detalhesDaMensagemNina);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [dados, setDados] = useState<Awaited<ReturnType<typeof carregar>> | null>(null);
  const pedido = useRef(0);
  useEffect(() => {
    pedido.current++;
    setAberto(false);
    setDados(null);
    return () => {
      pedido.current++;
    };
  }, [alvo.clinicaId, alvo.conversaId, alvo.mensagemId]);
  async function abrir() {
    const atual = ++pedido.current;
    setAberto(true);
    setCarregando(true);
    setFalhou(false);
    setDados(null);
    try {
      const r = await carregar({ data: alvo });
      if (pedido.current === atual) setDados(r);
    } catch {
      if (pedido.current === atual) setFalhou(true);
    } finally {
      if (pedido.current === atual) setCarregando(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="underline underline-offset-2 hover:opacity-80"
        onClick={() => void abrir()}
      >
        Detalhes técnicos
      </button>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) pedido.current++;
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes técnicos da mensagem</DialogTitle>
            <DialogDescription>
              Mensagem selecionada, consultas, geração e entrega registradas pelo sistema.
            </DialogDescription>
          </DialogHeader>
          {carregando && <p role="status">Carregando os registros desta mensagem…</p>}
          {!carregando && falhou && (
            <p role="alert" className="text-destructive">
              Não foi possível carregar os detalhes. Feche este painel e tente novamente.
            </p>
          )}
          {!carregando && dados?.leitura && (
            <DetalhesMensagemNina leitura={dados.leitura} registros={dados} />
          )}
          {!carregando && dados && !dados.leitura && (
            <p>Não foi possível vincular os registros técnicos à mensagem selecionada.</p>
          )}
          {!carregando && dados?.runtimeAtual && (
            <p className="border-t pt-2 text-xs text-muted-foreground">
              Versão atual do servidor: {dados.runtimeAtual}. A versão que gerou esta mensagem
              aparece em “Versão do núcleo neste turno”.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
