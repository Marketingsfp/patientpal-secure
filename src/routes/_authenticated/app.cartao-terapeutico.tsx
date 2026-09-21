import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { CartaoLayout } from "@/components/cartao/layout";

export const Route = createFileRoute("/_authenticated/app/cartao-terapeutico")({
  beforeLoad: ({ location }) => {
    if (
      location.pathname === "/app/cartao-terapeutico" ||
      location.pathname === "/app/cartao-terapeutico/"
    ) {
      throw redirect({ to: "/app/cartao-terapeutico/contratos" });
    }
  },
  component: CartaoTerapeuticoLayout,
  head: () => ({ meta: [{ title: "Cartão Terapêutico — ClinicaOS" }] }),
});

function CartaoTerapeuticoLayout() {
  return (
    <CartaoLayout produto="terapeutico">
      <Outlet />
    </CartaoLayout>
  );
}
