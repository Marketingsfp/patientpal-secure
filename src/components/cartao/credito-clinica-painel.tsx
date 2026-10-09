import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mostrarErro } from "@/lib/traduzir-erro";
import { useAlcadasNominais } from "@/hooks/use-alcadas";
import { temAlcadaNominal } from "@/lib/autorizacao-supervisor";
import {
  carregarCreditoClinica,
  carregarRevisoesCredito,
  FORMAS_PAGAR_CREDITO,
  pagarCobrancaCredito,
  revisarLimiteCredito,
  type CreditoClinica,
  type RevisaoCredito,
} from "@/lib/cartao/credito-clinica";

const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
const fmtD = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const BANDEIRAS = ["Visa", "Mastercard", "Elo", "Hipercard", "American Express", "Diners", "Outra"];

/**
 * Quadro "Crédito na clínica" do contrato: limite, usado, disponível, situação
 * (carência / atraso), revisão de 6 meses e histórico de revisões. Some quando
 * o titular não tem crédito (convênio sem limite).
 */
export function CreditoClinicaPainel({
  pacienteId,
  clinicaId,
  contratoId,
  versao,
}: {
  pacienteId: string;
  clinicaId: string;
  contratoId: string;
  /** Muda quando a tela recarrega as parcelas, para o quadro acompanhar. */
  versao: string;
}) {
  const [credito, setCredito] = useState<CreditoClinica | null>(null);
  const [revisoes, setRevisoes] = useState<RevisaoCredito[]>([]);
  const [revisarAberto, setRevisarAberto] = useState(false);
  const { alcadas } = useAlcadasNominais();
  const podeRevisar = temAlcadaNominal("credito_clinica", alcadas);

  const carregar = useCallback(async () => {
    const c = await carregarCreditoClinica(pacienteId, clinicaId);
    // O titular pode ter mais de um contrato: o quadro vale só para o que
    // carrega o crédito.
    setCredito(c && c.contratoId === contratoId ? c : null);
    if (c && c.contratoId === contratoId) setRevisoes(await carregarRevisoesCredito(contratoId));
  }, [pacienteId, clinicaId, contratoId]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  if (!credito) return null;

  const situacao = credito.apto ? (
    <Badge className="bg-emerald-600">Liberado</Badge>
  ) : credito.motivo === "atraso" ? (
    <Badge variant="destructive">Bloqueado — cobrança em atraso</Badge>
  ) : (
    <Badge variant="outline">
      Libera após 6 mensalidades pagas (faltam {credito.faltamMensalidades})
    </Badge>
  );

  return (
    <div className="rounded-md border border-rose-200 bg-rose-50/60 dark:bg-rose-950/20 p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4" /> Crédito na clínica (só o titular) {situacao}
        </div>
        {podeRevisar && (
          <Button size="sm" variant="outline" onClick={() => setRevisarAberto(true)}>
            Revisar limite
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Limite</div>
          <div className="font-bold">{BRL(credito.limite)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Usado (em aberto)</div>
          <div className="font-bold text-rose-700">{BRL(credito.usado)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Disponível</div>
          <div className="font-bold text-emerald-700">{BRL(credito.disponivel)}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Próxima revisão do limite: <strong>{fmtD(credito.proximaRevisao)}</strong>
        {credito.revisaoPendente && (
          <Badge variant="destructive" className="ml-2">
            Revisão pendente
          </Badge>
        )}
        {credito.revisaoPendente && !podeRevisar && (
          <span className="ml-1">— peça a quem tem a liberação "Revisar Crédito na clínica".</span>
        )}
      </div>
      {revisoes.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Histórico de revisões ({revisoes.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {revisoes.map((r) => (
              <li key={r.id}>
                {fmtD(r.criadoEm)}: {r.limiteAnterior == null ? "—" : BRL(r.limiteAnterior)} →{" "}
                <strong>{BRL(r.limiteNovo)}</strong> — {r.observacao}
              </li>
            ))}
          </ul>
        </details>
      )}
      <RevisarLimiteDialog
        open={revisarAberto}
        onOpenChange={setRevisarAberto}
        contratoId={contratoId}
        limiteAtual={credito.limite}
        onRevisado={() => void carregar()}
      />
    </div>
  );
}

function RevisarLimiteDialog({
  open,
  onOpenChange,
  contratoId,
  limiteAtual,
  onRevisado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratoId: string;
  limiteAtual: number;
  onRevisado: () => void;
}) {
  const [limite, setLimite] = useState(String(limiteAtual));
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setLimite(String(limiteAtual));
      setMotivo("");
    }
  }, [open, limiteAtual]);

  const salvar = async () => {
    const v = Number(limite);
    if (!Number.isFinite(v) || v < 0) return toast.error("Informe um limite válido.");
    if (!motivo.trim()) return toast.error("Escreva o motivo da revisão.");
    setSalvando(true);
    try {
      await revisarLimiteCredito(contratoId, v, motivo.trim());
      toast.success("Limite do crédito revisado");
      onOpenChange(false);
      onRevisado();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revisar limite do Crédito na clínica</DialogTitle>
          <DialogDescription>
            Limite atual: {BRL(limiteAtual)}. Confira o histórico de uso e de pagamento do titular
            antes de decidir. A próxima revisão fica para daqui a 6 meses.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Novo limite</Label>
            <CurrencyInput value={limite} onChange={setLimite} />
          </div>
          <div>
            <Label>Motivo *</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: pagou tudo em dia, uso frequente — aumento para R$ 500"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar revisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Recebimento da cobrança do crédito no contrato. Entra na gaveta do caixa de
 * quem recebe (que precisa estar aberto hoje), mas não vira receita de novo.
 */
export function PagarCobrancaCreditoDialog({
  cobranca,
  onOpenChange,
  onPago,
}: {
  cobranca: { id: string; valor: number; vencimento: string } | null;
  onOpenChange: (v: boolean) => void;
  onPago: () => void;
}) {
  const [forma, setForma] = useState<string>("dinheiro");
  const [bandeira, setBandeira] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (cobranca) {
      setForma("dinheiro");
      setBandeira("");
    }
  }, [cobranca]);

  const ehCartao = forma === "debito" || forma === "credito";

  const receber = async () => {
    if (!cobranca) return;
    if (ehCartao && !bandeira) return toast.error("Selecione a bandeira do cartão.");
    setSalvando(true);
    try {
      await pagarCobrancaCredito(cobranca.id, forma, ehCartao ? bandeira : null);
      toast.success("Cobrança do crédito recebida — entrou no seu caixa de hoje");
      onOpenChange(false);
      onPago();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!cobranca} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receber cobrança do Crédito na clínica</DialogTitle>
          <DialogDescription>
            {cobranca
              ? `${BRL(cobranca.valor)} — vencimento ${fmtD(cobranca.vencimento)}. Entra no seu caixa de hoje, mas não conta como faturamento de novo: os atendimentos já foram faturados no dia em que o crédito foi usado.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Forma</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAR_CREDITO.map((f) => (
                  <SelectItem key={f.forma} value={f.forma}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {ehCartao && (
            <div>
              <Label>Bandeira *</Label>
              <Select value={bandeira} onValueChange={setBandeira}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {BANDEIRAS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void receber()} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Receber {cobranca ? BRL(cobranca.valor) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
