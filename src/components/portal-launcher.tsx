import { Stethoscope, Users, ArrowRight } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SUBSYSTEMS, type SubsystemId } from "@/lib/subsystem";
import { cn } from "@/lib/utils";

const PORTAIS: Array<{
  id: SubsystemId;
  icon: typeof Stethoscope;
  descricao: string;
  itens: string[];
}> = [
  {
    id: "recepcao",
    icon: Stethoscope,
    descricao: "Operação clínica do dia a dia: atendimento, recepção e financeiro.",
    itens: ["Agenda", "Check-in", "Caixa", "Pacientes", "Repasses"],
  },
  {
    id: "gestao-pessoas",
    icon: Users,
    descricao: "Gestão da equipe: jornada, cadastro e rotinas de RH.",
    itens: ["Marcação de ponto", "Funcionários", "Férias", "Holerites", "Treinamentos"],
  },
];

/** UI do seletor de portais, reaproveitada na rota /app e no overlay. */
export function PortalLauncher({
  onPick,
  className,
}: {
  onPick: (id: SubsystemId) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full max-w-none min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 sm:px-8 lg:px-12 py-14 overflow-hidden bg-linear-to-b from-slate-50 via-white to-slate-100",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-indigo-400/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-16 h-[30rem] w-[30rem] rounded-full bg-sky-400/20 blur-[130px]" />
        <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-300/20 blur-[110px]" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgb(15_23_42/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_23_42/0.04)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <div className="relative w-full max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 backdrop-blur-sm">
            Bem-vindo de volta
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Escolha o seu{" "}
            <span className="bg-linear-to-r from-indigo-600 via-violet-600 to-sky-600 bg-clip-text text-transparent">
              portal
            </span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-500 max-w-xl mx-auto leading-relaxed">
            Você pode trocar de portal a qualquer momento pelo cabeçalho ou pelo menu do seu perfil.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
          {PORTAIS.map((portal) => {
            const Icon = portal.icon;
            return (
              <button
                key={portal.id}
                type="button"
                onClick={() => onPick(portal.id)}
                className="group relative overflow-hidden text-left rounded-3xl border border-slate-200/80 bg-white/90 p-7 shadow-xl backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/15 hover:border-indigo-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-linear-to-br from-indigo-400/20 to-sky-400/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                />
                <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 via-violet-500 to-sky-500 text-white shadow-lg shadow-indigo-500/30 transition-transform duration-500 group-hover:scale-105">
                  <Icon className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <h2 className="relative mt-5 text-xl font-semibold tracking-tight text-slate-900">
                  {SUBSYSTEMS[portal.id].label}
                </h2>
                <p className="relative mt-1.5 text-sm leading-relaxed text-slate-500">{portal.descricao}</p>
                <ul className="relative mt-5 flex flex-wrap gap-2">
                  {portal.itens.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-1 text-[11px] font-medium tracking-wide text-slate-600 transition-colors duration-300 group-hover:border-indigo-200 group-hover:bg-indigo-50/70 group-hover:text-indigo-700"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                <span className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-indigo-500/35">
                  Entrar
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overlay: mantém a tela atual (Agenda etc.) montada por baixo.       */
/* ------------------------------------------------------------------ */

let aberto = false;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function abrirSeletorPortais() {
  aberto = true;
  emit();
}
export function fecharSeletorPortais() {
  aberto = false;
  emit();
}
export function useSeletorPortaisAberto() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => aberto,
    () => false,
  );
}
