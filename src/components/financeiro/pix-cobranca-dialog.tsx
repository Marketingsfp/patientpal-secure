import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Loader2, QrCode, TriangleAlert } from "lucide-react";
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
import { buscarPixDaClinica, type MotivoPixIndisponivel } from "@/lib/pix/chave-clinica";

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

/** Texto de orientação para cada motivo de o QR não sair. */
const AVISO: Record<MotivoPixIndisponivel, { titulo: string; detalhe: string }> = {
  "coluna-ausente": {
    titulo: "O campo da chave PIX ainda não existe no banco",
    detalhe:
      "Falta aplicar a atualização do banco que cria os campos de PIX da clínica. Enquanto isso, o pagamento por PIX continua funcionando normalmente — só não sai o QR Code.",
  },
  "nao-configurado": {
    titulo: "A chave PIX da clínica ainda não foi cadastrada",
    detalhe:
      "Cadastre a chave em Unidades › editar a clínica › Recebimento por PIX. Sem ela não há como gerar o QR Code.",
  },
  erro: {
    titulo: "Não foi possível ler a chave PIX da clínica",
    detalhe: "Tente de novo. Se continuar, siga o pagamento sem o QR Code.",
  },
};

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
  const [motivo, setMotivo] = useState<MotivoPixIndisponivel | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Monta a cobrança toda vez que o diálogo abre. Não guarda entre aberturas
  // porque valor e parcela mudam a cada pagamento.
  useEffect(() => {
    if (!open) {
      setPayload(null);
      setQr("");
      setMotivo(null);
      setCopiado(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    void (async () => {
      const { pix, motivo: falha } = await buscarPixDaClinica(clinicaId);
      if (cancelado) return;
      if (!pix) {
        setMotivo(falha);
        setCarregando(false);
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
      if (!texto) {
        // Chave existe, mas falta nome ou cidade da clínica no cadastro.
        setMotivo("nao-configurado");
        setCarregando(false);
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
  }, [open, clinicaId, valor, txid, descricao]);

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
        ) : motivo ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <TriangleAlert className="h-4 w-4" />
              {AVISO[motivo].titulo}
            </div>
            <p className="text-muted-foreground">{AVISO[motivo].detalhe}</p>
          </div>
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
