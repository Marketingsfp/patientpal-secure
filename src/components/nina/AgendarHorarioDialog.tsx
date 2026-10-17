/**
 * Janela de agendamento do horário vago, por cima do OS Zap (16/10/2026).
 *
 * Mesma aparência e mesmos campos principais da janela "Novo agendamento" da
 * Agenda do ClinicaOS, sem cobrança (Pagar/Imprimir, NFS-e e Desconto ficam na
 * Agenda). Serviços e médicos vêm das mesmas listas da Agenda (`refs-cache`);
 * quem grava é o motor do sistema, pelo painel que abre esta janela.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
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
import {
  getMedicoProcedimentosAgenda,
  getMedicosAgenda,
  getProcedimentosAgenda,
} from "@/lib/agenda/refs-cache";

export type DadosAgendamentoHorario = {
  procedimento: string;
  formaPagamentoPrevista: string | null;
  observacoes: string;
};

/** Mesmas opções da Agenda do ClinicaOS. */
const FORMAS_PAGAMENTO = [
  { valor: "nao_informado", rotulo: "Não informada (definir na cobrança)" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "PIX" },
  { valor: "cartao_credito", rotulo: "Cartão de Crédito" },
  { valor: "cartao_debito", rotulo: "Cartão de Débito" },
];

const campoLeitura = "bg-muted/40 text-foreground cursor-default";

export function AgendarHorarioDialog({
  aberto,
  onFechar,
  clinicaId,
  pacienteNome,
  medicoId,
  medicoNome,
  quando,
  ordemChegada,
  avisoDuplicidade,
  semNascimento,
  salvando,
  erro,
  onSalvar,
}: {
  aberto: boolean;
  onFechar: () => void;
  clinicaId: string;
  pacienteNome: string;
  medicoId: string | null;
  medicoNome: string;
  /** Data e hora já formatadas (dd/mm/aaaa às hh:mm). */
  quando: string;
  ordemChegada: boolean;
  avisoDuplicidade: string | null;
  semNascimento: boolean;
  salvando: boolean;
  erro: string | null;
  onSalvar: (dados: DadosAgendamentoHorario) => void;
}) {
  const [servicos, setServicos] = useState<Array<{ value: string; label: string }>>([]);
  const [somenteDoMedico, setSomenteDoMedico] = useState(false);
  const [procedimento, setProcedimento] = useState("");
  const [forma, setForma] = useState("nao_informado");
  const [observacoes, setObservacoes] = useState("");

  // Cada horário abre a janela limpa.
  useEffect(() => {
    if (!aberto) return;
    setProcedimento("");
    setForma("nao_informado");
    setObservacoes("");
  }, [aberto, medicoId, quando]);

  // Mesma regra da Agenda: serviços configurados para o médico; sem eles, o
  // serviço principal; sem nenhum dos dois, todos os serviços da clínica.
  useEffect(() => {
    if (!aberto) return;
    let vale = true;
    void Promise.all([
      getProcedimentosAgenda(clinicaId),
      getMedicoProcedimentosAgenda(clinicaId),
      getMedicosAgenda(clinicaId),
    ])
      .then(([procs, vinculos, medicos]) => {
        if (!vale) return;
        const porId = new Map(procs.map((p) => [p.id, p.nome]));
        const doMedico = vinculos
          .filter((v) => v.medico_id === medicoId)
          .map((v) => porId.get(v.procedimento_id))
          .filter((n): n is string => !!n);
        const med = medicos.find((m) => m.id === medicoId);
        const padrao =
          med && !med.procedimento_padrao_em_branco && med.procedimento_padrao_id
            ? (porId.get(med.procedimento_padrao_id) ?? "")
            : "";
        const nomes = doMedico.length ? doMedico : padrao ? [padrao] : procs.map((p) => p.nome);
        setSomenteDoMedico(doMedico.length > 0 || !!padrao);
        setServicos([...new Set(nomes)].map((n) => ({ value: n, label: n })));
        if (padrao) setProcedimento((atual) => atual || padrao);
      })
      .catch(() => {
        if (vale) setServicos([]);
      });
    return () => {
      vale = false;
    };
  }, [aberto, clinicaId, medicoId]);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !salvando && onFechar()}>
      <DialogContent
        data-os-zap="true"
        // O foco automático rolava a janela durante a animação e escondia o Paciente.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[85vh] w-[95vw] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl sm:max-w-2xl"
      >
        <DialogHeader className="space-y-0 border-b px-6 pb-2 pt-3">
          <DialogTitle className="text-sm font-semibold tracking-tight">
            Novo agendamento
          </DialogTitle>
          <p className="text-[12px] leading-tight text-muted-foreground">
            Preencha os dados abaixo. Campos com * são obrigatórios.
          </p>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            if (!procedimento || ordemChegada || salvando) return;
            onSalvar({
              procedimento,
              formaPagamentoPrevista: forma === "nao_informado" ? null : forma,
              observacoes: observacoes.trim(),
            });
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Paciente <span className="text-rose-500">*</span>
              </Label>
              <Input readOnly value={pacienteNome} className={campoLeitura} />
              <p className="text-[12px] text-muted-foreground">
                Paciente vinculado a esta conversa.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Forma de pagamento prevista</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger aria-label="Forma de pagamento prevista">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f.valor} value={f.valor}>
                      {f.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">
                Registra como o paciente pretende pagar. A forma real ainda é definida na cobrança.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Médico ou Exame <span className="text-rose-500">*</span>
              </Label>
              <Input readOnly value={medicoNome} className={campoLeitura} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Data consulta/exame <span className="text-rose-500">*</span>
              </Label>
              <Input readOnly value={quando} className={campoLeitura} />
            </div>
            {ordemChegada ? (
              <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                Atendimento por ordem de chegada: não há horário marcado. Oriente o paciente a
                comparecer no período de atendimento do profissional.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Serviço <span className="text-rose-500">*</span>
                </Label>
                {somenteDoMedico && (
                  <p className="text-[12px] text-muted-foreground">
                    Mostrando apenas serviços configurados para este médico.
                  </p>
                )}
                <SearchableSelect
                  options={servicos}
                  value={procedimento}
                  onChange={setProcedimento}
                  placeholder="— Selecione —"
                  searchPlaceholder="Buscar serviço…"
                  emptyText="Nenhum serviço encontrado."
                  disabled={salvando}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status</Label>
              <Input readOnly value="AGENDADO" className={campoLeitura} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Observações</Label>
              <Textarea
                aria-label="Observações"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
            {avisoDuplicidade && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                {avisoDuplicidade}
              </p>
            )}
            {semNascimento && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                O cadastro do paciente está sem data de nascimento; a agenda pode recusar.
              </p>
            )}
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 border-t px-6 py-3">
            <Button type="button" variant="outline" disabled={salvando} onClick={onFechar}>
              Cancelar
            </Button>
            {!ordemChegada && (
              <Button type="submit" disabled={!procedimento || salvando}>
                {salvando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
