import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInputBR } from "@/components/ui/date-input-br";

interface Parcela {
  id: string;
  numero_parcela: number;
  vencimento: string; // ISO yyyy-MM-dd
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parcelas: Parcela[];
  /**
   * Recebe as parcelas que realmente mudaram de data no banco, para a tela
   * que abriu o diálogo atualizar a grade imediatamente — sem depender de um
   * recarregamento que pode ser mascarado por rascunhos de edição.
   */
  onDone: (atualizadas: Array<{ id: string; vencimento: string }>) => void | Promise<void>;
}

const fmtBR = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

function addDays(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function addMonths(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + meses, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, last);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function RecalcularVencimentosDialog({ open, onOpenChange, parcelas, onDone }: Props) {
  const elegiveis = useMemo(
    () =>
      parcelas
        .filter((p) => Number(p.numero_parcela) > 0)
        .sort((a, b) => a.numero_parcela - b.numero_parcela),
    [parcelas],
  );

  const primeiraPendente = useMemo(
    () => elegiveis.find((p) => p.status !== "pago") ?? elegiveis[0],
    [elegiveis],
  );

  const [parcelaId, setParcelaId] = useState<string>("");
  const [novoVenc, setNovoVenc] = useState<string>("");
  const [intervaloTipo, setIntervaloTipo] = useState<"dias" | "meses">("meses");
  const [intervaloValor, setIntervaloValor] = useState<string>("1");
  const [cascatear, setCascatear] = useState<boolean>(true);
  const [salvando, setSalvando] = useState(false);

  // Preenche os campos ao abrir. As dependências são os VALORES da primeira
  // parcela pendente, não o objeto: `parcelas` chega como array recriado a cada
  // render da tela de contratos, então depender do objeto refazia o preenchimento
  // (apagando a data que o operador acabou de digitar) sempre que a tela
  // renderizasse de novo com o diálogo aberto.
  const basePendenteId = primeiraPendente?.id ?? "";
  const basePendenteVenc = primeiraPendente?.vencimento ?? "";
  useEffect(() => {
    if (!open) return;
    setParcelaId(basePendenteId);
    setNovoVenc(basePendenteVenc);
    setIntervaloTipo("meses");
    setIntervaloValor("1");
    setCascatear(true);
    setSalvando(false);
  }, [open, basePendenteId, basePendenteVenc]);

  const parcelaSelecionada = elegiveis.find((p) => p.id === parcelaId) ?? null;

  // Preview: recalcula vencimentos a partir da parcela escolhida.
  const preview = useMemo(() => {
    if (!parcelaSelecionada || !novoVenc)
      return [] as Array<Parcela & { novoVencimento: string; alterado: boolean }>;
    const idx = elegiveis.findIndex((p) => p.id === parcelaSelecionada.id);
    const intervalo = Math.max(1, Number(intervaloValor) || 0);
    const afetadas = cascatear ? elegiveis.slice(idx) : [elegiveis[idx]];
    let anterior = novoVenc;
    return afetadas.map((p, i) => {
      let venc: string;
      if (i === 0) {
        venc = novoVenc;
      } else {
        venc =
          intervaloTipo === "meses" ? addMonths(anterior, intervalo) : addDays(anterior, intervalo);
      }
      anterior = venc;
      return { ...p, novoVencimento: venc, alterado: venc !== p.vencimento };
    });
  }, [parcelaSelecionada, novoVenc, intervaloTipo, intervaloValor, cascatear, elegiveis]);

  const totalAlteradas = preview.filter((p) => p.alterado).length;

  const confirmar = async () => {
    if (!parcelaSelecionada || !novoVenc) {
      toast.error("Escolha a parcela inicial e o novo vencimento.");
      return;
    }
    const aAtualizar = preview.filter((p) => p.alterado);
    if (aAtualizar.length === 0) {
      toast.info("Nada a alterar.");
      return;
    }
    setSalvando(true);
    try {
      // Executa updates em paralelo — cada linha vai isoladamente ao banco,
      // mas o efeito prático (todas as parcelas afetadas atualizadas) é
      // apresentado atomicamente ao usuário via toast único.
      // `.select("id")` para saber quais linhas realmente mudaram: o UPDATE em
      // contrato_mensalidades passa por RLS e, para um perfil sem escrita no
      // módulo, o banco não devolve erro — apenas não altera nada. Sem esta
      // checagem a tela dizia "parcelas recalculadas" e as datas continuavam
      // as antigas.
      const results = await Promise.all(
        aAtualizar.map((p) =>
          supabase
            .from("contrato_mensalidades")
            .update({ vencimento: p.novoVencimento })
            .eq("id", p.id)
            .select("id"),
        ),
      );
      const erro = results.find((r) => r.error)?.error;
      if (erro) {
        mostrarErro(erro);
        return;
      }
      const gravadas = aAtualizar
        .filter((_, i) => (results[i].data ?? []).length > 0)
        .map((p) => ({ id: p.id, vencimento: p.novoVencimento }));
      if (gravadas.length === 0) {
        toast.error(
          "Nada foi alterado: seu perfil não tem permissão para editar as parcelas deste contrato. Peça a um administrador ou gestor.",
        );
        return;
      }
      if (gravadas.length < aAtualizar.length) {
        toast.warning(
          `${gravadas.length} de ${aAtualizar.length} parcela(s) recalculada(s) — as demais não puderam ser alteradas.`,
        );
      } else {
        toast.success(`${gravadas.length} parcela(s) recalculada(s).`);
      }
      onOpenChange(false);
      await onDone(gravadas);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Recalcular vencimentos
          </DialogTitle>
          <DialogDescription>
            Escolha a parcela inicial e o novo vencimento. As parcelas seguintes serão reescalonadas
            de acordo com o intervalo escolhido.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>A partir da parcela</Label>
            <Select value={parcelaId} onValueChange={setParcelaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar parcela..." />
              </SelectTrigger>
              <SelectContent>
                {elegiveis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    Parcela {p.numero_parcela} — venc. {fmtBR(p.vencimento)}
                    {p.status === "pago" ? " (paga)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Novo primeiro vencimento</Label>
            <DateInputBR value={novoVenc} onChange={(e) => setNovoVenc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Intervalo</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={intervaloValor}
                onChange={(e) => setIntervaloValor(e.target.value)}
                className="w-20"
              />
              <Select
                value={intervaloTipo}
                onValueChange={(v) => setIntervaloTipo(v as "dias" | "meses")}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dias">Dias</SelectItem>
                  <SelectItem value="meses">Meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox checked={cascatear} onCheckedChange={(v) => setCascatear(!!v)} />
          <span>
            Aplicar a partir da parcela
            {parcelaSelecionada ? ` ${parcelaSelecionada.numero_parcela}` : ""} (reescalona todas as
            seguintes)
          </span>
        </label>

        {preview.length > 0 ? (
          <div className="border rounded-md max-h-[300px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Parcela</th>
                  <th className="text-left px-3 py-2 font-medium">Vencimento atual</th>
                  <th className="text-left px-3 py-2 font-medium">Novo vencimento</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-1.5">{p.numero_parcela}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{fmtBR(p.vencimento)}</td>
                    <td
                      className={
                        p.alterado
                          ? "px-3 py-1.5 font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/30"
                          : "px-3 py-1.5 text-muted-foreground"
                      }
                    >
                      {fmtBR(p.novoVencimento)}
                    </td>
                    <td className="px-3 py-1.5 text-xs capitalize text-muted-foreground">
                      {p.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={salvando || totalAlteradas === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Confirmar ({totalAlteradas})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
