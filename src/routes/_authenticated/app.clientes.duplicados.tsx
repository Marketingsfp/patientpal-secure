import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/clientes/duplicados")({
  head: () => ({
    meta: [{ title: "Pacientes duplicados — conferência" }],
  }),
  component: DuplicadosPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <p className="text-destructive mb-3">Erro: {String(error)}</p>
      <Button onClick={() => reset()}>Tentar novamente</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

type Grupo = {
  clinica_id: string;
  tipo: "cpf" | "telefone" | "nome_dn";
  chave: string;
  qtd: number;
  ids: string[];
  pacientes: Array<{
    id: string;
    nome: string;
    cpf: string | null;
    telefone: string | null;
    data_nascimento: string | null;
    codigo_prontuario: string | null;
    created_at: string;
  }>;
};

const TIPO_LABEL: Record<Grupo["tipo"], string> = {
  cpf: "Mesmo CPF",
  telefone: "Mesmo telefone",
  nome_dn: "Mesmo nome + nascimento",
};

function DuplicadosPage() {
  const { clinicaIds } = useClinica();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<"" | Grupo["tipo"]>("");

  useEffect(() => {
    if (clinicaIds.length === 0) return;
    setLoading(true);
    supabase
      .rpc("listar_duplicados_pacientes", {
        _clinica_ids: clinicaIds,
        _tipo: tipo || undefined,
        _limite: 200,
      })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setGrupos((data ?? []) as unknown as Grupo[]);
        setLoading(false);
      });
  }, [clinicaIds, tipo]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Possíveis pacientes duplicados</h1>
          <p className="text-sm text-muted-foreground">
            Somente alerta. O sistema não faz merge automático — abra cada cadastro para conferir e
            ajustar manualmente.
          </p>
        </div>
        <select
          className="border rounded px-2 py-1 text-sm bg-background"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "" | Grupo["tipo"])}
        >
          <option value="">Todos</option>
          <option value="cpf">Mesmo CPF</option>
          <option value="telefone">Mesmo telefone</option>
          <option value="nome_dn">Mesmo nome + nascimento</option>
        </select>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!loading && grupos.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum grupo suspeito encontrado.</p>
      )}
      <div className="grid gap-3">
        {grupos.map((g, i) => (
          <Card key={`${g.tipo}-${g.chave}-${i}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{TIPO_LABEL[g.tipo]}</Badge>
                <CardTitle className="text-base font-mono">{g.chave}</CardTitle>
                <span className="text-xs text-muted-foreground">{g.qtd} cadastros</span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y">
                {g.pacientes.map((p) => (
                  <div key={p.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        CPF: {p.cpf ?? "—"} • Tel: {p.telefone ?? "—"} • Nasc.:{" "}
                        {p.data_nascimento?.split("-").reverse().join("/") ?? "—"}
                        {p.codigo_prontuario ? ` • Prontuário ${p.codigo_prontuario}` : ""}
                      </div>
                    </div>
                    <Link
                      to="/app/clientes/$pacienteId/editar"
                      params={{ pacienteId: p.id }}
                      className="text-xs underline whitespace-nowrap"
                    >
                      Abrir cadastro
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
