import {
  linhasObservacaoIntencao,
  observacaoDaDecisao,
  PEDIDOS_JEV,
} from "@/lib/nina/jev-observacao-intencao";
import { orientacaoDaDecisaoJev } from "@/lib/nina/jev-orientacao-intencao";

export function JevObservacaoIntencao({ respostas }: { respostas: unknown }) {
  const observacao = observacaoDaDecisao(respostas);
  if (!observacao) return null;
  const orientacao = orientacaoDaDecisaoJev(respostas);
  const pedidos = Object.entries(PEDIDOS_JEV)
    .filter(([id]) => (observacao.respostas[`obs_pedido_${id}`]?.noul ?? -1) >= 0.8)
    .map(([, [rotulo]]) => rotulo);
  return (
    <details className="mt-2 min-w-64 max-w-xl rounded border border-border p-2 text-xs">
      <summary className="cursor-pointer font-medium text-primary">
        {orientacao ? "Leitura ampliada · orienta a resposta" : "Leitura ampliada · em observação"}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="font-medium">
          {orientacao
            ? "Orientação preparada para a Nina neste turno."
            : "Não aplicada ao atendimento."}
        </p>
        <p className="text-muted-foreground">
          {orientacao
            ? "Os sinais orientam a resposta e os pedidos tratados. A execução e o envio continuam sujeitos às validações do atendimento."
            : "Estimativas do JEV para revisão. Não autorizam consultar nem marcar automaticamente."}
        </p>
        {orientacao && (
          <details>
            <summary className="cursor-pointer text-primary">Ver orientação do turno</summary>
            <ul className="mt-2 max-h-64 list-disc space-y-2 overflow-y-auto pl-4">
              {orientacao.instrucoes.map((texto, i) => (
                <li key={i}>{texto}</li>
              ))}
            </ul>
          </details>
        )}
        <p>
          {pedidos.length
            ? `${pedidos.length} pedido(s) indicado(s): ${pedidos.join("; ")}.`
            : "Nenhum pedido com pontuação a partir de 80%."}
        </p>
        {observacao.ausentes.length > 0 && (
          <p className="text-muted-foreground">
            Leitura incompleta: {observacao.ausentes.length} sinal(is) sem resposta válida.
          </p>
        )}
        <dl className="max-h-80 space-y-2 overflow-y-auto">
          {linhasObservacaoIntencao(observacao).map((linha) => (
            <div key={linha.rotulo} className="border-t border-border pt-1">
              <dt className="font-medium">{linha.rotulo}</dt>
              <dd className="text-muted-foreground">{linha.valor}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground">
          Até 20%: não indicado; entre 20% e 80%: incerto; a partir de 80%: indicado.
          {orientacao
            ? " A orientação utiliza sinais a partir de 80%, preservando as verificações de agenda e confirmação."
            : " Este registro não gerou orientação adicional para a Nina."}
        </p>
      </div>
    </details>
  );
}
