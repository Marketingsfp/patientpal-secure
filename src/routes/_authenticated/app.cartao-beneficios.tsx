import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { CartaoLayout } from "@/components/cartao/layout";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios")({
  beforeLoad: ({ location }) => {
    if (
      location.pathname === "/app/cartao-beneficios" ||
      location.pathname === "/app/cartao-beneficios/"
    ) {
      throw redirect({ to: "/app/cartao-beneficios/contratos" });
    }
  },
  component: CartaoBeneficiosLayout,
  head: () => ({ meta: [{ title: "Cartão Benefícios — ClinicaOS" }] }),
});

function CartaoBeneficiosLayout() {
  return (
    <CartaoLayout produto="beneficios">
      <Outlet />
    </CartaoLayout>
  );
}
