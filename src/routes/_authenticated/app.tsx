import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
  head: () => ({ meta: [{ title: "Dashboard — ClinicaOS" }] }),
});

function AppLayout() {
  return <Outlet />;
}
