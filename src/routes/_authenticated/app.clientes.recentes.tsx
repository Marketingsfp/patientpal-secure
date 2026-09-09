/**
 * Tela "Cadastros recentes".
 *
 * A supervisão precisa bater o olho nas últimas fichas criadas e ver se a
 * numeração está andando de um em um. Como a clínica numera as pastas em dois
 * lugares ao mesmo tempo — o arquivo físico e o contador do sistema —, um
 * desvio na sequência é o primeiro sinal de que os dois se desencontraram.
 *
 * A lista sai do banco pela função `pacientes_cadastros_recentes`, que junta o
 * paciente com o registro de criação no histórico para saber quem cadastrou.
 * A tabela `pacientes` não guarda esse dado.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { prontuarioExibicao, prontuarioForaDaEstante } from "@/lib/prontuario";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/clientes/recentes")({
  component: CadastrosRecentesPage,
  head: () => ({ meta: [{ title: "Cadastros recentes — ClinicaOS" }] }),
});

/** Perfis que enxergam a tela. A conferência de verdade está no banco. */
const PERFIS_COM_ACESSO = ["admin", "gestor", "supervisor", "recepcao"];

const QUANTIDADES = [50, 100, 300] as const;

interface Linha {
  paciente_id: string;
  nome: string;
  codigo_prontuario: string | null;
  criado_em: string;
  atendente: string | null;
}

function CadastrosRecentesPage() {
  const { clinicaAtual, loading: loadingClinica } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const podeVer = PERFIS_COM_ACESSO.includes(clinicaAtual?.role ?? "");

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [quantidade, setQuantidade] = useState<number>(100);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    const { data, error } = await (supabase as any).rpc("pacientes_cadastros_recentes", {
      _clinica_id: clinicaId,
      _limite: quantidade,
    });
    if (error) {
      toast.error("Não foi possível carregar os cadastros recentes.");
      setLinhas([]);
    } else {
      setLinhas((data ?? []) as Linha[]);
    }
    setCarregando(false);
  }, [clinicaId, quantidade]);

  useEffect(() => {
    if (loadingClinica || !clinicaId) return;
    void carregar();
  }, [carregar, clinicaId, loadingClinica]);

  if (loadingClinica) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!podeVer) {
    return (
      <div className="p-4 md:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            Esta tela é da gestão e da recepção.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/clientes">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" /> Cadastros recentes
            </h1>
            <p className="text-sm text-muted-foreground">
              As últimas fichas criadas, da mais nova para a mais antiga. Confira se a numeração
              está andando de um em um.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {QUANTIDADES.map((q) => (
            <Button
              key={q}
              size="sm"
              variant={q === quantidade ? "default" : "outline"}
              onClick={() => setQuantidade(q)}
            >
              {q}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Prontuário</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-[180px]">Cadastrado em</TableHead>
                <TableHead className="w-[220px]">Atendente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando && linhas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-6">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!carregando && linhas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-6">
                    Nenhum cadastro encontrado.
                  </TableCell>
                </TableRow>
              )}
              {linhas.map((l) => {
                const fora = prontuarioForaDaEstante({
                  codigo_prontuario: l.codigo_prontuario,
                  created_at: l.criado_em,
                });
                return (
                  <TableRow key={l.paciente_id}>
                    <TableCell className="font-mono tabular-nums">
                      <div className="flex items-center gap-2">
                        {prontuarioExibicao({ codigo_prontuario: l.codigo_prontuario }) ?? "—"}
                        {fora && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-sans font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                            fora da faixa
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/app/clientes/$pacienteId/visualizar"
                        params={{ pacienteId: l.paciente_id }}
                        className="text-primary hover:underline"
                      >
                        {l.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {new Date(l.criado_em).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.atendente ?? "não identificado"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        O atendente vem do histórico do sistema. Cadastros que vieram da importação do sistema
        antigo não têm usuário e aparecem como "não identificado".
      </p>
    </div>
  );
}
