import { useEffect, useState } from "react";
import {
  CalendarClock,
  CreditCard,
  FileText,
  Percent,
  Printer,
  Save,
  Search,
  Stethoscope,
  User,
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

function Grupo({
  icone,
  titulo,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-slate-50/50 rounded-xl p-4 border space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icone}
        {titulo}
      </div>
      {children}
    </section>
  );
}

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
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="bg-gradient-to-b from-slate-50 to-transparent px-6 pt-6 pb-5 text-left space-y-1">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {editando ? "Editar Agendamento" : "Novo Agendamento"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Preencha os dados do atendimento. Campos podem ser preenchidos a
            partir de um orçamento existente.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4 space-y-4 max-h-[65vh] overflow-y-auto">
          <Grupo icone={<FileText className="h-3.5 w-3.5" />} titulo="Orçamento">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="orcamento">Nº do orçamento</Label>
                <Input
                  id="orcamento"
                  placeholder="Ex.: 2026-00841"
                  value={form.orcamento ?? ""}
                  onChange={(e) => set("orcamento", e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" className="shrink-0">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
            </div>
          </Grupo>

          <Grupo icone={<User className="h-3.5 w-3.5" />} titulo="Paciente">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="paciente">Paciente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="paciente"
                    className="pl-9"
                    placeholder="Buscar por nome, CPF ou prontuário…"
                    value={form.paciente ?? ""}
                    onChange={(e) => set("paciente", e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title="Cadastrar novo paciente"
                aria-label="Cadastrar novo paciente"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de atendimento</Label>
              <Select
                value={form.tipoAtendimento}
                onValueChange={(v) =>
                  set("tipoAtendimento", v as "convenio" | "particular")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="convenio">Convênio</SelectItem>
                  <SelectItem value="particular">Particular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Grupo>

          <Grupo
            icone={<CalendarClock className="h-3.5 w-3.5" />}
            titulo="Agendamento"
          >
            <div className="space-y-1.5">
              <Label>Médico ou Exame</Label>
              <Select
                value={form.profissional}
                onValueChange={(v) => set("profissional", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o médico ou exame" />
                </SelectTrigger>
                <SelectContent>
                  {PROFISSIONAIS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dataHora">Data e hora</Label>
                <Input
                  id="dataHora"
                  type="datetime-local"
                  value={form.dataHora ?? ""}
                  onChange={(e) => set("dataHora", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Serviço</Label>
                <Select
                  value={form.servico}
                  onValueChange={(v) => set("servico", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICOS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Grupo>

          <Grupo
            icone={<Stethoscope className="h-3.5 w-3.5" />}
            titulo="Observações"
          >
            <Textarea
              rows={3}
              placeholder="Preparo, restrições, informações para a recepção…"
              value={form.observacoes ?? ""}
              onChange={(e) => set("observacoes", e.target.value)}
            />
          </Grupo>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-background/95 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" className="sm:w-auto">
            <Percent className="h-4 w-4" />
            Aplicar desconto
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline">
              <CreditCard className="h-4 w-4" />
              Pagar + NFS-e
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Printer className="h-4 w-4" />
              Pagar/Imprimir
            </Button>
            <Button type="button">
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}