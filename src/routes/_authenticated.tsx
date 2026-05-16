import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ClinicaProvider } from "@/hooks/use-clinica";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedApp,
  head: () => ({ meta: [{ title: "ClinicaOS" }] }),
});

function AuthenticatedApp() {
  return (
    <ClinicaProvider>
      <AppShell />
    </ClinicaProvider>
  );
}