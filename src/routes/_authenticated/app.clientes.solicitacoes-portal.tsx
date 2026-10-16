import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/_authenticated/app/clientes/solicitacoes-portal")({
  component: Pagina,
  head: () => ({ meta: [{ title: "Pedidos da Área do Paciente — ClinicaOS" }] }),
});

const ROTULO: Record<string, string> = {
  telefone: "Telefone",
  email: "E-mail",
  cep: "CEP",
  logradouro: "Rua",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "UF",
};

type Solic = {
  id: string;
  paciente_id: string;
  criado_em: string;
  dados_novos: Record<string, string>;
  dados_anteriores: Record<string, string | null>;
  pacientes: { nome: string | null } | null;
};

function Pagina() {
  const { clinicaAtual, modoTodas } = useClinica();
  const clinicaId = modoTodas ? null : (clinicaAtual?.clinica_id ?? null);
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const chave = ["portal-solicitacoes", clinicaId];
  const { data, isLoading } = useQuery({
    queryKey: chave,
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_solicitacoes_cadastro")
        .select("id, paciente_id, criado_em, dados_novos, dados_anteriores, pacientes(nome)")
        .eq("clinica_id", clinicaId as string)
        .eq("status", "pendente")
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as unknown as Solic[];
    },
  });

  const decidir = async (s: Solic, aprovar: boolean) => {
    setOcupado(s.id);
    const { error } = await supabase.rpc("portal_decidir_solicitacao", { _id: s.id, _aprovar: aprovar });
    setOcupado(null);
    if (error) return mostrarErro(error);
    toast.success(aprovar ? "Cadastro atualizado." : "Pedido recusado.");
    void qc.invalidateQueries({ queryKey: chave });
    void qc.invalidateQueries({ queryKey: ["portal-solic-paciente", s.paciente_id] });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Inbox className="h-6 w-6 text-primary" /> Pedidos da Área do Paciente
      </h1>
      <p className="text-sm text-muted-foreground">
        Atualizações de contato pedidas pelos pacientes. Confira com o paciente antes de aprovar.
      </p>
      {!clinicaId && <p className="text-sm text-muted-foreground">Escolha uma unidade.</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido aguardando.</p>}
      {data?.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to="/app/clientes/$pacienteId/visualizar"
              params={{ pacienteId: s.paciente_id }}
              className="font-medium text-primary hover:underline"
            >
              {s.pacientes?.nome ?? "Paciente"}
            </Link>
            <span className="text-xs text-muted-foreground">
              {new Date(s.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </span>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">Campo</th>
                <th>Atual</th>
                <th>Pedido</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(s.dados_novos).map(([k, v]) => (
                <tr key={k} className="border-t">
                  <td className="py-1">{ROTULO[k] ?? k}</td>
                  <td className="text-muted-foreground">{s.dados_anteriores[k] || "—"}</td>
                  <td className="font-medium">{v || "(apagar)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={ocupado === s.id} onClick={() => decidir(s, true)}>Aprovar</Button>
            <Button size="sm" variant="outline" disabled={ocupado === s.id} onClick={() => decidir(s, false)}>Recusar</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
