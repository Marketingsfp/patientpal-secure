/**
 * Layout com as abas do Cartão Benefícios e do Cartão Terapêutico.
 *
 * As telas são as mesmas nos dois módulos; muda o produto do convênio e o
 * módulo de permissão. "Sem convênio" só existe no Benefícios, porque é lá
 * que ficam os contratos antigos sem convênio gravado.
 */
import { Link, useLocation } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  HeartHandshake,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { rotuloProduto, type ProdutoCartao } from "@/lib/cartao/produto";

const abasBeneficios = [
  { to: "/app/cartao-beneficios/contratos", label: "Vendas", icon: FileSignature },
  { to: "/app/cartao-beneficios/convenios", label: "Convênios", icon: ShieldCheck },
  { to: "/app/cartao-beneficios/dependentes", label: "Dependentes", icon: Users },
  { to: "/app/cartao-beneficios/conferencia", label: "Conferência", icon: ClipboardCheck },
  { to: "/app/cartao-beneficios/sem-convenio", label: "Sem convênio", icon: AlertTriangle },
  { to: "/app/cartao-beneficios/relatorios", label: "Relatórios (BI)", icon: BarChart3 },
  { to: "/app/cartao-beneficios/importar", label: "Importar planilha", icon: Upload },
] as const;

const abasTerapeutico = [
  { to: "/app/cartao-terapeutico/contratos", label: "Vendas", icon: FileSignature },
  { to: "/app/cartao-terapeutico/convenios", label: "Convênios", icon: ShieldCheck },
  { to: "/app/cartao-terapeutico/dependentes", label: "Dependentes", icon: Users },
  { to: "/app/cartao-terapeutico/conferencia", label: "Conferência", icon: ClipboardCheck },
  { to: "/app/cartao-terapeutico/relatorios", label: "Relatórios (BI)", icon: BarChart3 },
  { to: "/app/cartao-terapeutico/importar", label: "Importar planilha", icon: Upload },
] as const;

export function CartaoLayout({
  produto,
  children,
}: {
  produto: ProdutoCartao;
  children: ReactNode;
}) {
  const loc = useLocation();
  const abas = produto === "terapeutico" ? abasTerapeutico : abasBeneficios;
  const Icone = produto === "terapeutico" ? HeartHandshake : CreditCard;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icone className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{rotuloProduto(produto)}</h1>
      </div>
      <nav className="flex gap-1 border-b">
        {abas.map((t) => {
          const active = loc.pathname === t.to || loc.pathname.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
