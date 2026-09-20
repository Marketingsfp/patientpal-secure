import type { AtendimentoAnterior } from "@/lib/atendimento/resumo-retencao";
import { textoOperacional } from "@/lib/atendimento/texto-interno-apresentacao";

const dataAtendimento = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export function MensagensAnterioresResumo({
  atendimentos,
}: {
  atendimentos: AtendimentoAnterior[];
}) {
  if (!atendimentos.length) return null;
  return (
    <section
      aria-label="Mensagens anteriores"
      className="space-y-2 border-t border-purple-300/40 pt-2"
    >
      <h3 className="font-semibold">Mensagens anteriores</h3>
      {atendimentos.map((atendimento) => (
        <div
          key={atendimento.id}
          className="space-y-1 rounded bg-purple-100/60 px-2 py-1.5 dark:bg-purple-400/10"
        >
          <p className="font-semibold">
            <time dateTime={atendimento.data}>
              {dataAtendimento.format(new Date(atendimento.data))}
            </time>
          </p>
          <p>{textoOperacional(atendimento.motivo)}</p>
          {atendimento.resultado && <p>{textoOperacional(atendimento.resultado)}</p>}
          {atendimento.informado.map((texto, i) => (
            <p key={i}>{textoOperacional(texto)}</p>
          ))}
        </div>
      ))}
    </section>
  );
}
