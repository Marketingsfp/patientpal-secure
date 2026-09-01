import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { montarPayloadPix } from "@/lib/pix/br-code";
import { buscarPixDaClinica } from "@/lib/pix/chave-clinica";

/**
 * Diálogo que mostra o QR Code PIX de uma cobrança.
 *
 * IMPORTANTE — este diálogo NÃO recebe dinheiro nem dá baixa sozinho. Ele só
 * desenha o código que o paciente lê no aplicativo do banco. A confirmação do
 * recebimento continua sendo um ato de quem está no balcão: o botão
 * "Confirmar recebimento" apenas chama de volta quem abriu o diálogo, que
 * segue pelo caminho normal de baixa (lançamento financeiro, movimento de
 * caixa e GR). Nenhuma regra de cobrança é repetida aqui.
 *
 * O QR Code é um conforto, não uma exigência. Quando a clínica não tem chave
 * PIX cadastrada — ou o código não pode ser montado por qualquer outro motivo
 * — o diálogo não trava nem enche a tela de aviso: ele segue direto para a
 * baixa, do mesmo jeito que as outras formas de pagamento. Quem recebe o PIX
 * pela maquininha ou pela chave do banco não precisa do código na tela.
 *
 * O sistema não tem integração com banco: não há como saber automaticamente
 * que o PIX caiu. Por isso o texto da tela pede para conferir o comprovante
 * antes de confirmar.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string;
  /** Valor exato da parcela, já com encargos se houver. */
  valor: number;
  /** Ex.: "Mensalidade Contrato #20262655 - 08/2026". */
  descricao: string;
  /** Identificador para conciliar o PIX com a parcela (ver `txidMensalidade`). */
  txid: string;
  /** Linha de contexto no topo (paciente, contrato, parcela). */
  subtitulo?: string;
  /** Chamado quando o operador confirma que o dinheiro caiu. */
  onConfirmar: () => void;
  /** Desabilita a confirmação para quem não tem permissão de escrita. */
  podeConfirmar?: boolean;
}

const BRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PixCobrancaDialog({
  open,
  onOpenChange,
  clinicaId,
  valor,
  descricao,
  txid,
  subtitulo,
  onConfirmar,
  podeConfirmar = true,
}: Props) {
  const [carregando, setCarregando] = useState(false);
  const [payload, setPayload] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");
  const [semCodigo, setSemCodigo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Guardado em ref porque quem chama costuma passar uma função nova a cada
  // render — no array de dependências ela reiniciaria o efeito sem parar.
  const onConfirmarRef = useRef(onConfirmar);
  onConfirmarRef.current = onConfirmar;
  // Só segue direto para a baixa uma vez por abertura do diálogo.
  const seguiuDiretoRef = useRef(false);

  // Monta a cobrança toda vez que o diálogo abre. Não guarda entre aberturas
  // porque valor e parcela mudam a cada pagamento.
  useEffect(() => {
    if (!open) {
      setPayload(null);
      setQr("");
      setSemCodigo(false);
      setCopiado(false);
      seguiuDiretoRef.current = false;
      return;
    }
    let cancelado = false;
    setCarregando(true);
    void (async () => {
      // Sem QR Code o pagamento não para: vai direto para a tela de baixa, que
      // é o mesmo caminho das outras formas de pagamento.
      const seguirSemCodigo = () => {
        if (cancelado) return;
        setCarregando(false);
        setSemCodigo(true);
        if (!podeConfirmar || seguiuDiretoRef.current) return;
        seguiuDiretoRef.current = true;
        onConfirmarRef.current();
      };

      const { pix } = await buscarPixDaClinica(clinicaId);
      if (cancelado) return;
      if (!pix) {
        seguirSemCodigo();
        return;
      }
      const { payload: texto } = montarPayloadPix({
        chave: pix.chave,
        beneficiario: pix.beneficiario,
        cidade: pix.cidade,
        valor,
        txid,
        descricao,
      });
      // Chave existe, mas falta nome ou cidade da clínica no cadastro.
      if (!texto) {
        seguirSemCodigo();
        return;
      }
      const imagem = await QRCode.toDataURL(texto, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
      }).catch(() => "");
      if (cancelado) return;
      setPayload(texto);
      setQr(imagem);
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [open, clinicaId, valor, txid, descricao, podeConfirmar]);

  // O aviso de "copiado" some sozinho; sem isso ele fica preso na tela.
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  const copiar = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopiado(true);
    } catch {
      // Navegador sem permissão de área de transferência: seleciona o texto
      // para o operador copiar com Ctrl+C.
      const campo = document.getElementById("pix-copia-e-cola") as HTMLTextAreaElement | null;
      campo?.select();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Pagamento por PIX
          </DialogTitle>
          <DialogDescription>
            {subtitulo ? <span className="block">{subtitulo}</span> : null}
            <span className="block font-semibold text-foreground">{BRL(valor)}</span>
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando o código…
          </div>
        ) : semCodigo ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Receba o PIX pelo caminho de sempre e confirme aqui embaixo.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center">
              {qr ? (
                <img
                  src={qr}
                  alt="QR Code do PIX para pagamento da mensalidade"
                  className="h-[240px] w-[240px] rounded-md border bg-white p-2"
                />
              ) : null}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              O paciente lê este código no aplicativo do banco. O dinheiro cai direto na conta da
              clínica.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="pix-copia-e-cola" className="text-xs font-medium">
                PIX copia e cola
              </label>
              <textarea
                id="pix-copia-e-cola"
                readOnly
                value={payload ?? ""}
                rows={3}
                className="w-full resize-none rounded-md border bg-muted/30 p-2 font-mono text-[10px] leading-tight"
              />
              <Button
                type="button"
                variant={copiado ? "default" : "outline"}
                className={`w-full ${copiado ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                onClick={() => void copiar()}
              >
                {copiado ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copiado com sucesso!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar código PIX
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={!podeConfirmar}
            title={
              podeConfirmar
                ? "Só confirme depois de ver o comprovante do paciente"
                : "Você não tem permissão para dar baixa em mensalidades."
            }
            onClick={onConfirmar}
          >
            <Check className="mr-2 h-4 w-4" />
            Confirmar recebimento e dar baixa
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            O sistema não recebe aviso do banco. Confira o comprovante antes de confirmar.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Voltar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
