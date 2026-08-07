import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Stethoscope, Users, ArrowRight } from "lucide-react";
import { setSubsystem, SUBSYSTEMS, type SubsystemId } from "@/lib/subsystem";

export const Route = createFileRoute("/_authenticated/app/")({
  component: PortalLauncher,
});

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

function PortalLauncher() {
  const navigate = useNavigate();

  const abrir = (id: SubsystemId) => {
    setSubsystem(id);
    navigate({ to: SUBSYSTEMS[id].home });
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-10 bg-muted/30">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Escolha o seu portal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você pode trocar de portal a qualquer momento pelo cabeçalho ou pelo menu do seu perfil.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {PORTAIS.map((portal) => {
            const Icon = portal.icon;
            return (
              <button
                key={portal.id}
                type="button"
                onClick={() => abrir(portal.id)}
                className="group text-left rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </span>
                <h2 className="mt-4 text-lg font-semibold">{SUBSYSTEMS[portal.id].label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{portal.descricao}</p>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {portal.itens.map((item) => (
                    <li
                      key={item}
                      className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  Entrar
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
