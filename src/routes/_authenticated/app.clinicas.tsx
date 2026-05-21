import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/clinicas")({
  beforeLoad: () => {
    throw redirect({ to: "/app/unidades" });
  },
});
