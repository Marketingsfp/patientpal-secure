import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/funcionarios")({
  component: FuncionariosPage,
  head: () => ({ meta: [{ title: "Funcionários — ClinicaOS" }] }),
});

function FuncionariosPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funcionários</h1>
        <p className="text-sm text-muted-foreground">
          Gestão de funcionários da clínica.
        </p>
      </div>
      <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">
        Em construção.
      </div>
    </div>
  );
}