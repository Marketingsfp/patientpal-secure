/** Progresso do dia real: enviadas, em andamento, transferidas, concluídas e próxima chegada. */
import type { ResumoDiaReal } from "@/lib/nina/carga-dia-real";

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

export function CargaDiaRealProgresso({ resumo }: { resumo: ResumoDiaReal }) {
  return (
    <div
      className="grid gap-2 rounded-md border bg-background/60 p-3 text-sm sm:grid-cols-3 lg:grid-cols-6"
      role="status"
      data-testid="dia-real-progresso"
    >
      <div>
        <p className="text-xs text-muted-foreground">Conversas</p>
        <p className="font-medium">{resumo.conversas}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Enviadas (iniciadas)</p>
        <p className="font-medium">{resumo.iniciadas}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Em andamento</p>
        <p className="font-medium">{resumo.emAndamento}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Transferidas</p>
        <p className="font-medium">{resumo.transferidas}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Concluídas</p>
        <p className="font-medium">{resumo.concluidas}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Próxima chegada</p>
        <p className="font-medium">
          {hora(resumo.proximaChegadaEm)}
          {resumo.aguardandoLead > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">
              · {resumo.aguardandoLead} aguardando lead
            </span>
          )}
        </p>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-3 lg:col-span-6">
        {resumo.aguardando} ainda por chegar · chegadas até {hora(resumo.fimPrevistoEm)}. Use
        &quot;Encerrar teste&quot; para parar a qualquer momento.
      </p>
    </div>
  );
}
