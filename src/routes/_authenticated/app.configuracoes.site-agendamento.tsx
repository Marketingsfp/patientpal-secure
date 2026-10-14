import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listarSiteAgendamento,
  salvarSiteAgendamento,
} from "@/lib/integracoes/site-agendamento.functions";

export const Route = createFileRoute("/_authenticated/app/configuracoes/site-agendamento")({
  component: Pagina,
  head: () => ({ meta: [{ title: "Agendamento pelo site — ClinicaOS" }] }),
});

type Linha = Awaited<ReturnType<typeof listarSiteAgendamento>>[number];

function Pagina() {
  const listar = useServerFn(listarSiteAgendamento);
  const { data, isLoading, error } = useQuery({
    queryKey: ["site-agendamento"],
    queryFn: () => listar(),
  });
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Agendamento pelo site</h1>
        <p className="text-sm text-muted-foreground">
          Controla o formulário de agendamento do site institucional. Desligado, o site passa a
          mostrar que o agendamento está indisponível. Não afeta agendamentos já existentes nem a
          agenda da recepção.
        </p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar.</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Somente administradores da clínica podem alterar esta configuração.
        </p>
      )}
      {data?.map((l) => <CartaoClinica key={l.clinicaId} linha={l} />)}
    </div>
  );
}

function CartaoClinica({ linha }: { linha: Linha }) {
  const salvar = useServerFn(salvarSiteAgendamento);
  const qc = useQueryClient();
  const [ativo, setAtivo] = useState(linha.ativo);
  const [motivo, setMotivo] = useState(linha.motivo);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setAtivo(linha.ativo);
    setMotivo(linha.motivo);
  }, [linha.ativo, linha.motivo]);

  const alterado = ativo !== linha.ativo || motivo !== linha.motivo;

  async function onSalvar() {
    setSalvando(true);
    try {
      await salvar({ data: { clinicaId: linha.clinicaId, ativo, motivo } });
      toast.success("Configuração salva.");
      await qc.invalidateQueries({ queryKey: ["site-agendamento"] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">{linha.nome}</CardTitle>
        <div className="flex items-center gap-3">
          <Badge variant={ativo ? "default" : "secondary"}>{ativo ? "Ligado" : "Desligado"}</Badge>
          <Switch checked={ativo} onCheckedChange={setAtivo} aria-label="Ligar ou desligar" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)"
          maxLength={500}
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {linha.atualizadoEm
              ? `Última alteração: ${new Date(linha.atualizadoEm).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}${linha.atualizadoPor ? ` por ${linha.atualizadoPor}` : ""}`
              : "Nunca alterado (ligado por padrão)."}
          </p>
          <Button onClick={onSalvar} disabled={!alterado || salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
