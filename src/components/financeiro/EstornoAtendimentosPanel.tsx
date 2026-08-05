import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Undo2, ShieldAlert } from "lucide-react";
import { brl } from "@/lib/financeiro/format";

/**
 * Estorno de Atendimento
 * ----------------------
 * Componente de UI puro: recebe a lista de atendimentos por props e delega
 * a persistência ao caller via `onEstornar`. Não define mocks nem estados
 * iniciais fixos — o caller conecta com o backend real e passa os dados.
 *
 * Impacto duplo esperado no handler do caller:
 *   1. Regra Médica     → status_medico     = "cancelado"
 *   2. Regra Financeira → status_financeiro = "reembolsado"
 *   3. Deduz o valor do faturamento do dia (refletido no painel).
 */

export type StatusMedico =
  | "agendado"
  | "em_atendimento"
  | "realizado"
  | "cancelado";

export type StatusFinanceiro =
  | "pendente"
  | "pago"
  | "reembolsado"
  | "cancelado";

export interface AtendimentoEstornavel {
  id: string;
  paciente_nome: string;
  medico_nome: string;
  valor: number;
  status_medico: StatusMedico;
  status_financeiro: StatusFinanceiro;
  data?: string;
}

export interface EstornoPayload {
  atendimento_id: string;
  motivo: string;
  valor: number;
}

export type EstornoHandler = (payload: EstornoPayload) => Promise<void>;

interface Props {
  atendimentos: AtendimentoEstornavel[];
  onEstornar: EstornoHandler;
  faturamentoDia?: number;
  loading?: boolean;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const statusMedicoLabel: Record<StatusMedico, { label: string; variant: BadgeVariant }> = {
  agendado: { label: "Agendado", variant: "outline" },
  em_atendimento: { label: "Em atendimento", variant: "secondary" },
  realizado: { label: "Realizado", variant: "default" },
  cancelado: { label: "Cancelado", variant: "destructive" },
};

const statusFinanceiroLabel: Record<StatusFinanceiro, { label: string; variant: BadgeVariant }> = {
  pendente: { label: "Pendente", variant: "outline" },
  pago: { label: "Pago", variant: "default" },
  reembolsado: { label: "Reembolsado", variant: "destructive" },
  cancelado: { label: "Cancelado", variant: "secondary" },
};

export function EstornoAtendimentosPanel({
  atendimentos,
  onEstornar,
  faturamentoDia,
  loading,
}: Props) {
  const [alvo, setAlvo] = useState<AtendimentoEstornavel | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [deducoes, setDeducoes] = useState<Record<string, number>>({});

  const faturamentoBase = useMemo(() => {
    if (typeof faturamentoDia === "number") return faturamentoDia;
    return atendimentos
      .filter((a) => a.status_financeiro === "pago")
      .reduce((acc, a) => acc + Number(a.valor ?? 0), 0);
  }, [atendimentos, faturamentoDia]);

  const faturamentoAtual = useMemo(
    () => faturamentoBase - Object.values(deducoes).reduce((acc, v) => acc + v, 0),
    [faturamentoBase, deducoes],
  );

  const podeEstornar = (a: AtendimentoEstornavel) =>
    a.status_financeiro === "pago" && a.status_medico !== "cancelado";

  const abrir = (a: AtendimentoEstornavel) => {
    setAlvo(a);
    setMotivo("");
  };

  const fechar = () => {
    if (saving) return;
    setAlvo(null);
    setMotivo("");
  };

  const confirmar = async () => {
    if (!alvo) return;
    const txt = motivo.trim();
    if (txt.length < 5) {
      toast.error("Descreva o motivo (mínimo 5 caracteres).");
      return;
    }
    setSaving(true);
    try {
      await onEstornar({
        atendimento_id: alvo.id,
        motivo: txt,
        valor: Number(alvo.valor ?? 0),
      });
      setDeducoes((prev) => ({ ...prev, [alvo.id]: Number(alvo.valor ?? 0) }));
      toast.success("Atendimento estornado com sucesso.");
      setAlvo(null);
      setMotivo("");
    } catch (err) {
      toast.error(
        `Não foi possível estornar: ${(err as Error).message ?? "erro desconhecido"}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Estorno de atendimentos</h2>
          <p className="text-sm text-muted-foreground">
            O estorno reflete simultaneamente nas áreas médica e financeira.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Faturamento do dia
          </p>
          <p className="text-2xl font-semibold tabular-nums">{brl(faturamentoAtual)}</p>
        </div>
      </header>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Médico</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status médico</TableHead>
              <TableHead>Status financeiro</TableHead>
              <TableHead className="w-[120px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando atendimentos…
                </TableCell>
              </TableRow>
            )}
            {!loading && atendimentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum atendimento disponível para estorno.
                </TableCell>
              </TableRow>
            )}
            {atendimentos.map((a) => {
              const estornado = a.id in deducoes;
              const sm = estornado ? statusMedicoLabel.cancelado : statusMedicoLabel[a.status_medico];
              const sf = estornado ? statusFinanceiroLabel.reembolsado : statusFinanceiroLabel[a.status_financeiro];
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.paciente_nome}</TableCell>
                  <TableCell>{a.medico_nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(a.valor)}</TableCell>
                  <TableCell><Badge variant={sm.variant}>{sm.label}</Badge></TableCell>
                  <TableCell><Badge variant={sf.variant}>{sf.label}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrir(a)}
                      disabled={estornado || !podeEstornar(a)}
                    >
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                      {estornado ? "Estornado" : "Estornar"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!alvo} onOpenChange={(v) => (!v ? fechar() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Confirmar estorno
            </DialogTitle>
            <DialogDescription>
              Esta ação atualiza o status médico e o status financeiro deste atendimento
              e deduz o valor do faturamento do dia.
            </DialogDescription>
          </DialogHeader>

          {alvo && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-0.5">
                <div><span className="text-muted-foreground">Paciente:</span> <strong>{alvo.paciente_nome}</strong></div>
                <div><span className="text-muted-foreground">Médico:</span> {alvo.medico_nome}</div>
                <div><span className="text-muted-foreground">Valor:</span> <strong>{brl(alvo.valor)}</strong></div>
              </div>
              <div>
                <Label htmlFor="motivo-estorno">Motivo do estorno (obrigatório)</Label>
                <Textarea
                  id="motivo-estorno"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Descreva o motivo do estorno…"
                  rows={4}
                  maxLength={1000}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {motivo.trim().length}/1000 — mínimo de 5 caracteres.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={saving}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={confirmar}
              disabled={saving || motivo.trim().length < 5}
            >
              {saving ? "Estornando…" : "Confirmar estorno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
