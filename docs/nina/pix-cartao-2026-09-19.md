# Pix e cartão na Nina — 19/09/2026

Regra de negócio informada pela clínica: Pix sempre usa o mesmo preço do cartão.
A Nina deve apresentar ambos juntos, como `Pix/cartão: R$ X,XX`, também quando a
pergunta menciona apenas um deles. Dinheiro permanece separado. Parcelamento
publicado é uma condição do cartão; não implica parcelamento de Pix.

## Base e prompt publicados

- Clínica revisada: Policlínica Menino Jesus, São João de Meriti.
- Revisados e publicados pelo Chrome: 207 exames/procedimentos e 41 cadastros
  de consultas/profissionais. Os campos de cartão e os rótulos correspondentes
  nas descrições públicas passaram a `Pix/cartão`.
- Os valores e as condições de cada linha foram preservados. Cada formulário
  foi comparado antes da publicação: somente os rótulos previstos mudaram.
  Campos sem valor continuaram sem valor.
- Prompt v38 publicado em 19/09/2026 às 12:06, com alcance de todas as clínicas.
  FAT-02 e LING-02 agora determinam Pix/cartão juntos nas informações, opções
  de agenda, frases de abertura, resumos e confirmações. As versões anteriores
  foram preservadas.

## Código

- O catálogo normaliza rótulos antigos de cartão ao salvar e ao produzir o
  conhecimento enviado à Nina, preservando condições, observações e valores.
- O resumo de preços identifica Pix/cartão mesmo quando dinheiro tem o mesmo
  valor ou está ausente; preço desconhecido não vira zero.
- Formulários, exemplos de cadastro, instruções de edição com IA, ferramentas
  e prompts de fallback seguem a mesma regra.
- Nenhuma tabela financeira, cobrança, recebimento ou histórico de paciente foi
  alterado. A mudança é na informação comercial do catálogo da Nina.

## Verificações

- 157 testes passaram em 10 arquivos de catálogo, contrato e formas de pagamento.
- A verificação de tipos passou; lint dos arquivos novos passou.
- Testes cobrem registros antigos, condições distintas por modalidade, valores
  ausentes, preços iguais, preservação de dinheiro e reconhecimento de Pix/cartão
  como ambos os meios de pagamento.
- Homologação, Paciente Teste 10, sessão 23, prompt v38: pergunta somente sobre
  Pix no eletrocardiograma às 12:07 recebeu `Pix/cartão: R$ 60,00`, com dinheiro
  a R$ 51,00. Pergunta somente sobre cartão na cardiologia adulta com Dr. Alex
  Louza às 12:08 recebeu `Pix/cartão: R$ 145,00`, com dinheiro a R$ 120,00.
  Não houve mensagem ao WhatsApp ou agendamento real; o teste foi resolvido e
  reiniciado ao final, preservando o histórico.

As publicações da base e do prompt têm efeito imediato. A normalização adicional
no código depende da publicação da versão correspondente do aplicativo.
