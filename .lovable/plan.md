## Problema

Ao salvar um serviço (com valor variável ou não), o backend rejeita com 23514 → "Um dos valores informados está fora do intervalo permitido".

Causa: o Select "Fluxo de atendimento" em `app.procedimentos.tsx` está enviando chaves que **não existem** no CHECK constraint do banco.

| Valor enviado hoje       | Valor aceito no banco          |
| ------------------------ | ------------------------------ |
| `consulta_padrao`        | `consulta_medica`              |
| `exame_com_laudo`        | `exame_agendado`               |
| `exame_sem_laudo`        | `equipamento`                  |
| `procedimento_enfermagem`| `procedimento_ambulatorial`    |
| `laboratorio`            | `lab_agendado`                 |
| `entrega_domiciliar`     | `domiciliar`                   |
| `balcao`                 | `venda_balcao`                 |

O bug não é do valor variável — qualquer cadastro que passe pelo Select falha. Só apareceu agora porque outros fluxos anteriores não estavam usando esse campo.

## Correção

Alterar somente `src/routes/_authenticated/app.procedimentos.tsx`:

1. Trocar cada `SelectItem value="..."` do bloco "Fluxo de atendimento" para o valor canônico do banco (coluna esquerda → coluna direita da tabela acima). Os rótulos exibidos ao usuário continuam idênticos.
2. Atualizar o default do form (`fluxo_atendimento: "consulta_padrao"`) para `"consulta_medica"`.
3. Atualizar o fallback ao abrir edição (`p.fluxo_atendimento ?? "consulta_padrao"`) para `"consulta_medica"`.

Sem migração — o banco já está correto. Sem alteração em outras telas.

## Verificação

- Cadastrar um novo serviço com "Valor variável" ligado e fluxo "Consulta padrão (com médico)" → salva sem erro.
- Cadastrar um serviço normal com preço → continua salvando.
- Editar um serviço existente e trocar o fluxo → salva sem erro.