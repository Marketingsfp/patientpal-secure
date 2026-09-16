import { ArrowDown } from "lucide-react";

/** Resumo do mesmo núcleo chamado pelo WhatsApp e pelo console de testes. */
export function FluxoDiretoNina() {
  const passos = [
    ["1. Reunir a mensagem", "Agrupar mensagens do paciente e carregar a conversa."],
    ["2. Carregar as instruções", "Usar o System Prompt publicado na aba Arquitetura."],
    ["3. Consultar as informações", "Carregar a base publicada e executar as ferramentas necessárias."],
    ["4. Gerar a resposta", "O modelo responde com as instruções, o contexto e os retornos das consultas. Se pedir outra ferramenta, recebe o resultado e continua."],
    ["5. Preparar e registrar", "Finalizar o texto e registrar a execução, sem nota, revisão de confiança ou bloqueio por pontuação."],
  ];
  return (
    <section aria-label="Fluxo de resposta direta da Nina" className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">Fluxo da Nina — resposta direta</h2>
        <p className="text-sm text-muted-foreground">O mesmo fluxo atende o WhatsApp real e a homologação.</p>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p><strong>Atendimento real:</strong> mensagem recebida pelo WhatsApp.</p>
        <p><strong>Homologação:</strong> mensagem enviada pelo console de testes.</p>
      </div>
      <ol className="space-y-3">
        {passos.map(([titulo, descricao]) => (
          <li key={titulo} className="flex gap-3 text-sm">
            <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div><p className="font-medium">{titulo}</p><p className="text-muted-foreground">{descricao}</p></div>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
        <p><strong>Saída real:</strong> entregar pelo WhatsApp e registrar o retorno do envio.</p>
        <p><strong>Saída de homologação:</strong> exibir na conversa de teste, sem envio ao paciente ou atribuição a atendente real.</p>
      </div>
      <p className="text-xs text-muted-foreground">Pedidos de atendimento humano e falhas técnicas continuam com seus fluxos próprios. Agendamento mantém as regras de cadastro, disponibilidade e gravação; entrega mantém a prevenção de duplicidade e o watchdog.</p>
    </section>
  );
}
