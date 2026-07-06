import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check, ChevronRight, Search, User, Stethoscope, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STEPS = [
  { key: "paciente", label: "Paciente", Icon: User },
  { key: "servico", label: "Serviço", Icon: Stethoscope },
  { key: "horario", label: "Horário", Icon: Clock },
  { key: "confirmar", label: "Confirmação", Icon: CheckCircle2 },
] as const;

type StepKey = typeof STEPS[number]["key"];

/**
 * Wizard visual — Fase A. Não cria agendamento real ainda (isso entra na Fase E).
 * Objetivo: validar a experiência de criação em 4 passos, sem formulário tradicional.
 */
export function NovoAgendamentoWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [stepIdx, setStepIdx] = useState(0);
  const step: StepKey = STEPS[stepIdx].key;
  const [paciente, setPaciente] = useState<string | null>(null);
  const [servico, setServico] = useState<string | null>(null);
  const [duracao, setDuracao] = useState<number>(30);
  const [horario, setHorario] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const reset = () => { setStepIdx(0); setPaciente(null); setServico(null); setHorario(null); setBusca(""); };

  const pacientesMock = ["Ana Beatriz Costa", "Carlos Eduardo Lima", "Marina Souza", "Pedro Henrique Alves"]
    .filter((p) => p.toLowerCase().includes(busca.toLowerCase()));

  const servicosMock = [
    { nome: "Consulta cardiológica", cor: "#4F46E5" },
    { nome: "Ecocardiograma", cor: "#0EA5E9" },
    { nome: "Coleta laboratorial", cor: "#10B981" },
    { nome: "Retorno", cor: "#8B5CF6" },
  ];

  const slotsMock = ["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30"];

  const canNext =
    (step === "paciente" && !!paciente) ||
    (step === "servico" && !!servico) ||
    (step === "horario" && !!horario) ||
    step === "confirmar";

  const finish = () => {
    toast.info("Fase A: wizard visual — a criação real do agendamento entra na Fase E.");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-[720px] p-0 gap-0 rounded-3xl border-slate-200 bg-white overflow-hidden">
        <VisuallyHidden.Root>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>Assistente em 4 passos para criar um novo agendamento.</DialogDescription>
        </VisuallyHidden.Root>
        <div className="px-8 pt-8 pb-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500">
            Passo {stepIdx + 1} de {STEPS.length}
          </div>
          <h2
            className="mt-1 text-2xl font-semibold text-slate-900"
            style={{ fontFamily: "'Inter Tight', Inter, sans-serif", letterSpacing: "-0.01em" }}
          >
            {step === "paciente" && "Quem é o paciente?"}
            {step === "servico" && "Qual o serviço?"}
            {step === "horario" && "Quando será?"}
            {step === "confirmar" && "Tudo certo?"}
          </h2>

          {/* Progresso */}
          <div className="mt-5 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 rounded-full flex-1 transition-all",
                  i <= stepIdx ? "bg-indigo-500" : "bg-slate-100",
                )}
              />
            ))}
          </div>
        </div>

        <div className="px-8 py-6 min-h-[380px]">
          {step === "paciente" && (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome, CPF ou telefone…"
                  className="pl-10 h-11 rounded-xl bg-slate-50 border-slate-200"
                />
              </div>
              <div className="mt-4 space-y-1">
                {pacientesMock.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPaciente(p)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors",
                      paciente === p ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50",
                    )}
                  >
                    <Avatar className="h-9 w-9 border border-slate-200">
                      <AvatarFallback className="bg-slate-50 text-slate-500 text-xs font-semibold">
                        {p.split(" ").slice(0, 2).map((s) => s[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">{p}</div>
                      <div className="text-[11px] text-slate-500">Cadastro visual · Fase A</div>
                    </div>
                    {paciente === p && <Check className="h-4 w-4 text-indigo-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "servico" && (
            <div className="grid grid-cols-2 gap-3">
              {servicosMock.map((s) => (
                <button
                  key={s.nome}
                  type="button"
                  onClick={() => setServico(s.nome)}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all",
                    servico === s.nome
                      ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <div className="h-2 w-8 rounded-full mb-3" style={{ background: s.cor }} />
                  <div className="text-sm font-semibold text-slate-900">{s.nome}</div>
                  <div className="text-[11px] text-slate-500 mt-1">30 min · padrão</div>
                </button>
              ))}
              <div className="col-span-2 mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Duração</div>
                <div className="flex gap-2">
                  {[15, 30, 45, 60, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuracao(d)}
                      className={cn(
                        "px-3 h-8 rounded-lg text-xs font-semibold border transition-colors",
                        duracao === d
                          ? "bg-slate-900 text-white border-slate-900"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {d}min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "horario" && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Hoje</div>
              <div className="grid grid-cols-5 gap-2">
                {slotsMock.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHorario(h)}
                    className={cn(
                      "h-11 rounded-xl border text-sm font-semibold tabular-nums transition-all",
                      horario === h
                        ? "bg-indigo-500 text-white border-indigo-500"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-slate-400">Slots de exemplo · a integração com a disponibilidade real entra na Fase E.</p>
            </div>
          )}

          {step === "confirmar" && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-6 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Paciente</span><span className="font-semibold text-slate-900">{paciente}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Serviço</span><span className="font-semibold text-slate-900">{servico}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Duração</span><span className="font-semibold text-slate-900 tabular-nums">{duracao} min</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Horário</span><span className="font-semibold text-slate-900 tabular-nums">{horario}</span></div>
              <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-200">
                Este resumo é apenas visual (Fase A). O agendamento real será criado pela Fase E, reutilizando as funções atuais.
              </p>
            </div>
          )}
        </div>

        <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
          <button
            type="button"
            onClick={() => (stepIdx === 0 ? onOpenChange(false) : setStepIdx((i) => i - 1))}
            className="text-sm text-slate-500 hover:text-slate-900 font-medium"
          >
            {stepIdx === 0 ? "Cancelar" : "Voltar"}
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => (stepIdx === STEPS.length - 1 ? finish() : setStepIdx((i) => i + 1))}
            className={cn(
              "inline-flex items-center gap-1.5 h-10 px-5 rounded-xl text-sm font-semibold transition-all",
              canNext ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-400 cursor-not-allowed",
            )}
          >
            {stepIdx === STEPS.length - 1 ? "Confirmar" : "Continuar"}
            {stepIdx < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}