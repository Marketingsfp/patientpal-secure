import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { rotuloRole } from "@/lib/equipe/marcacao-gestao";

/** Título do cartão conforme o perfil de quem está logado. */
const PAINEL_POR_ROLE: Record<string, string> = {
  admin: "Painel Administrativo",
  gestor: "Painel da Gestão",
  supervisor: "Painel da Supervisão",
  financeiro: "Painel do Financeiro",
  medico: "Painel do Médico",
  enfermeiro: "Painel da Enfermagem",
  recepcao: "Painel da Recepção",
  caixa: "Painel do Caixa",
  telefonia: "Painel da Telefonia",
};

/** "segunda-feira, 28 de setembro de 2026" */
const dataPorExtenso = (d: Date) =>
  d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** "MARIA DAS GRACAS" → "Maria" — o nome do cadastro costuma vir em caixa alta. */
const primeiroNome = (nome: string) => {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR") : "";
};

export function BannerBoasVindas() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();

  // Mesmo nome que o menu lateral mostra: primeiro o cadastro em `profiles`,
  // depois os metadados do login e, por último, o início do e-mail.
  const perfil = useQuery({
    queryKey: ["perfil-nome", user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", user!.id)
        .maybeSingle();
      return (data?.nome as string | null) ?? null;
    },
  });

  const nomeCompleto =
    perfil.data ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (user?.email ? user.email.split("@")[0] : "");
  const nome = primeiroNome(nomeCompleto);

  const role = clinicaAtual?.role ?? "";
  const painel = PAINEL_POR_ROLE[role] ?? (role ? `Painel — ${rotuloRole(role)}` : "Painel");

  return (
    <section className="mb-6 rounded-2xl bg-primary text-primary-foreground px-5 py-5 md:px-7 md:py-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-[11px] md:text-xs font-semibold uppercase tracking-widest opacity-90">
            <ShieldCheck className="h-4 w-4" />
            {painel}
          </p>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Olá{nome ? `, ${nome}` : ""}! 👋
          </h2>
          <p className="text-sm opacity-90">
            {dataPorExtenso(new Date())} — visão geral da clínica.
          </p>
        </div>
        <Link
          to="/app/agenda"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start md:self-auto rounded-lg bg-primary-foreground/15 px-4 py-2 text-sm font-medium ring-1 ring-primary-foreground/30 transition-colors hover:bg-primary-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
        >
          Ver todos os agendamentos
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
