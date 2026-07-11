## Objetivo

Antes de cobrar um paciente que tem direito a **gratuidade** pelo convênio, o sistema deve avisar e perguntar se ele quer **usar agora** ou **usar depois**. Se escolher "depois", o atendimento é cobrado como **particular** (valor cheio), sem consumir a gratuidade.

## Comportamento

Fluxos afetados (dois pontos que hoje aplicam `info.desconto.tipo === "gratuidade"` automaticamente):

1. **Salvar + Cobrar** (novo agendamento) — `submit` em `src/routes/_authenticated/app.agenda.tsx` (~L2795-2823).
2. **Pagar/Imprimir** (agendamento existente) — função de iniciar cobrança em `src/routes/_authenticated/app.agenda.tsx` (~L3046-3110), inclusive o atalho automático de `SEM COBRANÇA` que registra o lançamento zerado.

Em ambos, quando `info.desconto.tipo === "gratuidade"` (e não é orçamento — `opcoesOrc` nulo), abrir um **AlertDialog** modal antes de qualquer inserção/cobrança:

```
Gratuidade disponível
Este paciente tem direito a GRATUIDADE pelo convênio <NOME>
para este atendimento.

Deseja usar agora?

[Usar agora]   [Cobrar particular (usar depois)]   [Cancelar]
```

- **Usar agora** → mantém o comportamento atual (aplica desconto de gratuidade; se `totalOpcoes ≤ 0` e for o fluxo do agendamento existente, registra automaticamente lançamento `convenio_gratuidade` como hoje).
- **Cobrar particular (usar depois)** → descarta o desconto de gratuidade só para esta cobrança (`info.desconto = null`, `descSuffix` sem `GRATUIDADE`); segue para o `FormaPagDialog` normal com os valores particulares cheios do procedimento. Não registra uso da gratuidade, não bloqueia limites, não muda o `tipo_atendimento` do agendamento (mantém "convenio", pois o paciente segue conveniado; só esta cobrança sai como particular).
- **Cancelar** → aborta a ação (fecha sem cobrar).

Nada muda quando o desconto é `percentual`, `valor_fixo` ou quando não há desconto — o modal só aparece para `gratuidade`. Também não aparece para orçamentos (`opcoesOrc` presente), pois lá o valor já vem definido.

## Arquivo alterado

`src/routes/_authenticated/app.agenda.tsx` — único ponto de mudança.

## Implementação técnica

1. Adicionar estado local:
   ```ts
   const [gratuidadePrompt, setGratuidadePrompt] = useState<{
     convenioNome: string;
     resolve: (choice: "agora" | "depois" | "cancel") => void;
   } | null>(null);
   ```
2. Helper `perguntarGratuidade(convenioNome): Promise<"agora"|"depois"|"cancel">` que abre o modal e resolve na escolha do usuário.
3. Nos dois blocos onde `info?.desconto?.tipo === "gratuidade"` é detectado (antes de aplicar `aplicarDescontoPorForma` na L2805 e L3058):
   ```ts
   if (info?.desconto?.tipo === "gratuidade" && !opcoesOrc) {
     const escolha = await perguntarGratuidade(info.convenioNome);
     if (escolha === "cancel") return;                       // aborta
     if (escolha === "depois") {
       info = { ...info, desconto: null };                   // cobra particular
     }
   }
   ```
   Como `info` é `const` no closure, criar variável local `let infoEfetivo = info` e usá-la nas linhas seguintes (`aplicarDescontoPorForma`, cálculo do `rotulo`, `descSuffix`, `ehGratuidadeConvenio`).
4. Renderizar o `AlertDialog` no JSX raiz do componente, controlado por `gratuidadePrompt`, com três botões (`Usar agora`, `Cobrar particular (usar depois)`, `Cancelar`). Reaproveitar `AlertDialog` do shadcn já usado no arquivo (verificar import — se não existir, adicionar).
5. O atalho de auto-registro em L3089 (`if (!opcoesOrc && totalOpcoes <= 0 && (... || ehGratuidadeConvenio) && !ehLab)`) segue funcionando naturalmente: quando o operador escolhe "depois", `ehGratuidadeConvenio` fica falso porque `desconto` foi zerado, e os valores das opções voltam a ser os particulares (`totalOpcoes > 0`), então o fluxo cai no `FormaPagDialog` normal.

## Fora de escopo

- Não altera regras do convênio, limites, carência, cadastro de benefícios.
- Não persiste "usou depois" — é decisão pontual daquela cobrança. A próxima vez que o paciente aparecer, o sistema volta a oferecer a gratuidade.
- Não altera o `tipo_atendimento` do agendamento nem o campo `CONV.` da GR.
- Não muda o comportamento para `percentual`, `valor_fixo`, orçamentos ou pacientes sem convênio.

## Análise dos 4 eixos

- 💰 Financeiro: **positivo** — evita consumo indevido do benefício quando o paciente prefere pagar; e evita perda quando a recepção esqueceria de aplicar. Passa a ser decisão consciente.
- ⏱️ Operacional: +1 clique só nos casos com gratuidade; nos demais, zero impacto.
- 😊 Experiência: paciente é informado do direito antes da cobrança — transparência.
- 🛡️ Segurança/Auditoria: sem mudança de schema. Cada opção continua gerando o `fin_lancamentos` correspondente (gratuidade zerada com `forma_pagamento = 'convenio_gratuidade'` ou particular cheio com forma escolhida).
