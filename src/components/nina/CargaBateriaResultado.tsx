/** Relatório da bateria por profissional: uma linha por cenário, com o que a Nina fez. */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mostrarErro } from "@/lib/traduzir-erro";
import type { relatorioBateria } from "@/lib/nina/carga-bateria";
import { devolverVagasTesteCarga } from "@/lib/nina/carga.functions";

type Relatorio = ReturnType<typeof relatorioBateria>;

const ROTULO_RESULTADO = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  inconclusivo: "Inconclusivo",
} as const;
const ROTULO_SITUACAO = {
  aguardando: "Aguardando",
  conversando: "Conversando",
  verificado: "Verificado",
  devolvido: "Concluído",
} as const;
const ROTULO_PRECO = {
  citado: "citou o preço publicado",
  divergente: "citou outro valor",
  nao_citado: "não citou preço",
  sem_preco_no_catalogo: "sem preço no catálogo",
} as const;

const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "—";

export function CargaBateriaResultado({
  clinicaId,
  cargaId,
  relatorio,
  encerrado,
  onAtualizar,
}: {
  clinicaId: string;
  cargaId: string;
  relatorio: Relatorio;
  encerrado: boolean;
  onAtualizar: () => Promise<unknown>;
}) {
  const devolver = useServerFn(devolverVagasTesteCarga);
  const [devolvendo, setDevolvendo] = useState(false);
  const t = relatorio.totais;
  const devolverVagas = async () => {
    setDevolvendo(true);
    try {
      const r = await devolver({ data: { clinicaId, cargaId } });
      if (r.pendentes)
        toast.error(`${r.pendentes} vaga(s) de teste continuam ocupadas. Confira na Agenda.`);
      else toast.success(`${r.devolvidas} vaga(s) de teste devolvida(s) à agenda.`);
      await onAtualizar();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setDevolvendo(false);
    }
  };
  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="font-medium">Bateria por profissional</p>
      <div className="grid gap-2 text-sm sm:grid-cols-5">
        <div>Aprovados: {t.aprovados}</div>
        <div>Reprovados: {t.reprovados}</div>
        <div>Inconclusivos: {t.inconclusivos}</div>
        <div>Em andamento: {t.emAndamento}</div>
        <div>Tokens da Luna: {relatorio.tokensLuna}</div>
      </div>
      {t.vagasPendentes > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-sm">
          <span>
            {t.vagasPendentes} vaga(s) da agenda real ainda estão com agendamento de teste.
            {!encerrado && " Elas são devolvidas no fim de cada cenário."}
          </span>
          {encerrado && (
            <Button
              size="sm"
              variant="outline"
              disabled={devolvendo}
              onClick={() => void devolverVagas()}
            >
              {devolvendo ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="mr-2 h-4 w-4" />
              )}
              Devolver vagas
            </Button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3">Lead</th>
              <th className="py-2 pr-3">Profissional e consulta</th>
              <th className="py-2 pr-3">Perfil do paciente</th>
              <th className="py-2 pr-3">Esperado</th>
              <th className="py-2 pr-3">Resultado</th>
              <th className="py-2 pr-3">Mensagens · tempo médio</th>
              <th className="py-2">Vaga</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.linhas.map((l) => (
              <tr key={l.cenarioId} className="border-b align-top last:border-0">
                <td className="py-2 pr-3">{l.leadIndice ?? "—"}</td>
                <td className="py-2 pr-3">
                  <p className="font-medium">{l.medicoNome}</p>
                  <p className="text-xs text-muted-foreground">{l.consulta}</p>
                </td>
                <td className="py-2 pr-3">{l.variacao}</td>
                <td className="py-2 pr-3">{l.esperadoRotulo}</td>
                <td className="space-y-1 py-2 pr-3">
                  <Badge
                    variant={
                      l.resultado === "reprovado"
                        ? "destructive"
                        : l.resultado === "aprovado"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {l.resultado ? ROTULO_RESULTADO[l.resultado] : ROTULO_SITUACAO[l.situacao]}
                  </Badge>
                  {l.agendamentos.map((a, i) => (
                    <p key={i} className="text-xs">
                      Agendado para {dataHora(a.inicio)}
                    </p>
                  ))}
                  {l.preco && (
                    <p className="text-xs text-muted-foreground">{ROTULO_PRECO[l.preco]}</p>
                  )}
                  {[...l.motivos, ...l.observacoes].map((m) => (
                    <p key={m} className="text-xs text-muted-foreground">
                      {m}
                    </p>
                  ))}
                  {l.fim && <p className="text-xs text-muted-foreground">Fim: {l.fim}</p>}
                </td>
                <td className="py-2 pr-3">
                  {l.mensagensEnviadas} ·{" "}
                  {l.latenciaMediaMs == null ? "—" : `${Math.round(l.latenciaMediaMs / 1000)} s`}
                </td>
                <td className="py-2">
                  {l.vagasDevolvidas == null
                    ? "—"
                    : l.vagasDevolvidas
                      ? `${l.vagasDevolvidas} devolvida(s)`
                      : "nenhuma ocupada"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        O resultado vem do que ficou registrado: agendamento com o profissional do cenário, preço
        publicado, encaminhamento e erros técnicos. Revise as conversas no console da homologação
        pelo número do lead.
      </p>
    </div>
  );
}
