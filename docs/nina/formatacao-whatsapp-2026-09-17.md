# Mensagens da Nina para leitura no celular

Mudança de linguagem e experiência do paciente, sem alteração de catálogo, preços, agenda, critérios ou permissões.

## Antes e depois

A v27 pedia clareza e associação correta entre os fatos, mas não definia uma estrutura visual para vários profissionais. A instrução LING-02 define blocos completos por profissional: nome, dias e horários, valores por forma de pagamento, modalidade, unidade e condições pertinentes. Cada dia fica associado ao seu horário; recorrências e exceções acompanham o dia correspondente.

Os preços próprios de cada profissional ficam dentro do respectivo bloco. Valores ou orientações cadastrados para um procedimento inteiro são identificados como comuns, sem criar diferenças por executante. Escalas habituais são distinguidas de vagas consultadas na agenda. Informações importantes não são cortadas para caber em uma tela.

O WhatsApp recebe texto com quebras de linha e destaque por asterisco simples, sem tabelas ou colunas. Não foi criado pós-processador, divisão automática em várias mensagens ou motor de avaliação. Os templates de confirmação existentes já usam campos em linhas separadas e foram preservados.

## Publicação

Em Arquitetura, a v27 foi preservada integralmente e recebeu apenas a nova LING-02 antes da CONV-05. Foi salvo o rascunho v28 e publicada a **v29 em 17/09/2026 às 16:12**, com alcance de todas as clínicas, incluindo atendimento real e homologação. Após publicar, a interface confirmou ausência de rascunho e o texto integral esperado, com 29.211 caracteres.

`src/lib/nina/prompt/formatacao-whatsapp.ts` registra a mesma regra para o fallback de código. Ela não é concatenada como instrução oculta ao prompt publicado. A limitação antiga de cinco profissionais no fallback foi substituída pela apresentação dos profissionais pertinentes em blocos completos, coerente com a publicação atual.

## Verificação

- 28 testes existentes passaram: contrato do catálogo, composição do prompt e resposta direta em produção/homologação com dependências simuladas.
- `bun run typecheck` e `git diff --check` passaram.
- A prévia `previa-formatacao-celular.html` contém três exemplos fictícios: consulta com dois médicos e preços diferentes; vagas da agenda; procedimento com valores comuns aos executantes. Os três foram conferidos nas larguras de 360, 390 e 430 pixels, sem transbordamento horizontal da mensagem. Houve conferência visual do exemplo de consulta.

A prévia é ilustrativa e não reproduz todos os aparelhos ou ajustes de fonte do WhatsApp. Não é uma resposta gerada pelo modelo. Os testes locais verificam os dados e a montagem da resposta; não foi realizado um teste de aderência do modelo real à v29. Nenhuma mensagem foi enviada a pacientes e nenhum agendamento ou catálogo foi alterado nesta mudança.

O prompt publicado vale nas próximas execuções sem depender da publicação do site. O fallback e a documentação precisam seguir o fluxo normal de envio ao GitHub e implantação do código. Respostas antigas não são reformatadas retroativamente.
