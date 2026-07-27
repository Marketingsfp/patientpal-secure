## O que foi confirmado no banco (Policlínica Menino Jesus)

Consultei os registros de hoje (27/07/2026) e a duplicação é real:

- Dois recebimentos de R$ 175,00 para QUEDIMA SUELEN — 14:12:23 e 14:13:20.
- Dois contratos criados pelo mesmo fluxo — **#20261930** (14:12:25) e **#20261931** (14:13:23), ambos com 12 parcelas e 3 marcadas como já pagas.

Ou seja: o fluxo inteiro (recebimento + contrato + parcelas) rodou duas vezes, com cerca de 1 minuto de intervalo.

## Causa (diagnóstico)

Classificação: **erro de código / fluxo de tela**, sem envolver regra de negócio.

A tela de pagamento avulso não limpa os dados quando é fechada e não trava novos envios depois de concluir. Assim, ao reabrir (ou ao clicar novamente em "Continuar para o recebimento"), o formulário continua inteiro preenchido e a tela "Nova Receita" aparece de novo — e um segundo salvamento gera outro lançamento e outro contrato. Não há hoje nenhuma proteção contra repetir o mesmo pagamento.

## O que será feito

1. **Limpar a tela ao abrir/fechar**: paciente, dependentes, mês de referência, parcelas já pagas, convênio, valor e a etapa de recebimento voltam ao estado inicial sempre que o pagamento avulso abre. Nada de dados "fantasmas" de um pagamento anterior.
2. **Trava contra envio duplo**: o botão "Continuar para o recebimento" e o salvamento passam a ser bloqueados enquanto o processamento estiver em andamento e depois que o pagamento for concluído com sucesso. Se o mesmo fluxo tentar rodar de novo, ele é ignorado.
3. **Aviso de possível repetição**: antes de gravar, o sistema verifica se já existe contrato criado pelo pagamento avulso para o mesmo paciente e mesmo mês de referência no dia. Se existir, mostra confirmação explícita ("já existe um pagamento avulso hoje para este paciente — deseja mesmo criar outro?") em vez de duplicar em silêncio.
4. **Fechamento confiável**: a tela "Nova Receita" e a tela do avulso são fechadas antes da impressão da GR, para que uma falha ou demora na impressão não deixe a tela aberta e reaproveitável.

Escopo: apenas o diálogo de pagamento avulso do Cartão Benefícios (frontend). Não altera valores de convênio, faixas, regras de mensalidade nem o restante do faturamento.

## Limpeza dos dados duplicados

Como o pagamento realmente entrou duas vezes no caixa, proponho:

- Estornar/cancelar o **segundo lançamento** de R$ 175,00 (14:13:20), mantendo o primeiro.
- Excluir o contrato duplicado **#20261931** e suas parcelas, mantendo o **#20261930**.

Antes de executar, confirmo com você qual dos dois deve ficar. Se preferir, posso apenas relatar e deixar a exclusão para o time fazer manualmente.

## Detalhes técnicos

- Arquivo: `src/components/cartao-beneficios/pagamento-avulso-dialog.tsx`.
- `useEffect` de reset ligado à prop `open` (limpa todos os estados do formulário e `lancOpen`).
- `useRef` de guarda (`processandoRef` / `concluidoRef`) envolvendo `onSavedWithData` e `criarContratoEParcelas`, liberado apenas em novo `open`.
- Checagem prévia em `contratos_assinatura` (paciente_id + clinica_id + `created_at::date = hoje` + observação de avulso) para o aviso de repetição.
- Ordem ajustada: fechar diálogos e só então chamar `printGuiaMensalidade`.
- Sem mudanças em banco além da limpeza pontual acima.
