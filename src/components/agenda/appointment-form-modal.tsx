import { useEffect, useState } from "react";
import {
  CreditCard,
  FileText,
  Percent,
  Printer,
  Save,
  Search,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AppointmentFormData = {
  orcamento?: string;
  paciente?: string;
  tipoAtendimento?: "convenio" | "particular";
  profissional?: string;
  dataHora?: string;
  dataPagamento?: string;
  servico?: string;
  observacoes?: string;
};

export interface AppointmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: AppointmentFormData | null;
}

const PROFISSIONAIS = [
  "Dra. Rosângela Lima — Clínica Geral",
  "Dr. Paulo Andrade — Ortopedia",
  "Dra. Helena Prado — Ginecologia",
  "Laboratório de Análises",
  "Raio-X",
  "Ultrassonografia",
  "Tomografia",
  "Ressonância Magnética",
];

const SERVICOS = [
  "Consulta clínica geral",
  "Retorno",
  "Hemograma completo",
  "Glicemia em jejum",
  "Raio-X de tórax",
  "Ultrassonografia abdominal",
  "Tomografia de crânio",
  "Curativo / Enfermagem",
];

function Campo({
  label,
  obrigatorio,
  ajuda,
  htmlFor,
  children,
}: {
  label: string;
  obrigatorio?: boolean;
  ajuda?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-semibold text-slate-700"
      >
        {label}
        {obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {ajuda && <p className="text-[11px] text-slate-500">{ajuda}</p>}
    </div>
  );
}

const inputCls = "h-10 rounded-lg";

export function AppointmentFormModal({
  isOpen,
  onClose,
  initialData,
}: AppointmentFormModalProps) {
  const editando = Boolean(initialData);
  const [form, setForm] = useState<AppointmentFormData>(initialData ?? {});

  useEffect(() => {
    if (isOpen) setForm(initialData ?? {});
  }, [isOpen, initialData]);

  function set<K extends keyof AppointmentFormData>(
    campo: K,
    valor: AppointmentFormData[K],
  ) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden"
        onPointerDownOutside={undefined}
        onInteractOutside={undefined}
        onEscapeKeyDown={undefined}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b border-slate-100 px-6 py-5 text-left space-y-1">
          <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
            {editando ? "Editar agendamento" : "Novo agendamento"}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-slate-500">
            Atualize os dados do atendimento, o profissional responsável e as
            informações de pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 max-h-[68vh] overflow-y-auto">
          {/* Orçamento — banner opcional */}
          <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label
                  htmlFor="orcamento"
                  className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-indigo-500" />
                  Nº do orçamento
                </Label>
                <Input
                  id="orcamento"
                  className={`${inputCls} bg-white`}
                  placeholder="Ex.: 2026-00841"
                  value={form.orcamento ?? ""}
                  onChange={(e) => set("orcamento", e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg shrink-0 bg-white"
              >
                <Search className="h-4 w-4" />
                Buscar
              </Button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Opcional — informe o número para preencher paciente e serviços
              automaticamente.
            </p>
          </div>

          <div className="space-y-5 mt-5">
            <Campo label="Paciente" obrigatorio htmlFor="paciente">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    id="paciente"
                    className={`${inputCls} pl-9`}
                    placeholder="Buscar por nome, CPF ou prontuário…"
                    value={form.paciente ?? ""}
                    onChange={(e) => set("paciente", e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg shrink-0"
                  title="Cadastrar novo paciente"
                  aria-label="Cadastrar novo paciente"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            </Campo>

            <div className="grid grid-cols-2 gap-4">
              <Campo label="Médico ou exame" obrigatorio>
                <Select
                  value={form.profissional}
                  onValueChange={(v) => set("profissional", v)}
                >
                  <SelectTrigger className={inputCls}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFISSIONAIS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              <Campo label="Serviço" obrigatorio>
                <Select
                  value={form.servico}
                  onValueChange={(v) => set("servico", v)}
                >
                  <SelectTrigger className={inputCls}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICOS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Campo
                label="Data consulta/exame"
                obrigatorio
                htmlFor="dataHora"
                ajuda="Data e horário do atendimento."
              >
                <Input
                  id="dataHora"
                  type="datetime-local"
                  className={inputCls}
                  value={form.dataHora ?? ""}
                  onChange={(e) => set("dataHora", e.target.value)}
                />
              </Campo>
              <Campo
                label="Data de pagamento"
                htmlFor="dataPagamento"
                ajuda="Deixe em branco para pagamento no atendimento."
              >
                <Input
                  id="dataPagamento"
                  type="date"
                  className={inputCls}
                  value={form.dataPagamento ?? ""}
                  onChange={(e) => set("dataPagamento", e.target.value)}
                />
              </Campo>
            </div>

            <Campo label="Tipo de atendimento" obrigatorio>
              <Select
                value={form.tipoAtendimento}
                onValueChange={(v) =>
                  set("tipoAtendimento", v as "convenio" | "particular")
                }
              >
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="convenio">Convênio</SelectItem>
                  <SelectItem value="particular">Particular</SelectItem>
                </SelectContent>
              </Select>
            </Campo>

            <Campo
              label="Observações"
              htmlFor="observacoes"
              ajuda="Preparo, restrições e informações para a recepção."
            >
              <Textarea
                id="observacoes"
                rows={3}
                className="rounded-lg"
                placeholder="Digite as observações do atendimento…"
                value={form.observacoes ?? ""}
                onChange={(e) => set("observacoes", e.target.value)}
              />
            </Campo>
          </div>
        </div>

        <div className="sticky bottom-0 border-t bg-slate-50/50 px-6 py-4 backdrop-blur flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg text-slate-700"
          >
            <Percent className="h-4 w-4" />
            Desconto
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
            >
              <CreditCard className="h-4 w-4" />
              Pagar + NFS-e
            </Button>
            <Button
              type="button"
              className="h-10 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Printer className="h-4 w-4" />
              Pagar/Imprimir
            </Button>
            <Button
              type="button"
              className="h-10 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}