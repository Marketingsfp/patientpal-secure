## Objetivo

Refinar quando o aviso **"Existem N agendamentos pendentes com este benefício no período…"** aparece, no ramo "cota ainda não consumida mas há pendentes" (`src/routes/_authenticated/app.agenda.tsx` ~L584).

## Regras

1. **Benefício de gratuidade com limite de uso** (`beneficioEscolhido.gratuito === true`):
   - Só avisa se houver **outro pendente do MESMO serviço/procedimento** do atendimento atual.
   - Se todos os pendentes forem de serviços diferentes → não avisa nada.

2. **Demais benefícios** (desconto percentual/valor fixo, não gratuito):
   - Só avisa se o número de pendentes (compartilhando a mesma cota, já filtrados por escopo/especialidade como hoje) fizer o total **esbarrar no limite**, ou seja: `usados + pendentes + 1 > limite_qtd`.
   - Se ainda cabe na cota → não avisa.

## Arquivo alterado

`src/routes/_authenticated/app.agenda.tsx` — bloco `else if (agsPendentes.length >= 1)` da função `obterInfoConvenioPaciente`.

## Implementação técnica

Substituir o bloco atual por:

```ts
} else if (agsPendentes.length >= 1) {
  const norm = (s: string | null | undefined) =>
    (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

  let pendentesRelevantes = agsPendentes;
  let deveAvisar = false;

  if (beneficioEscolhido.gratuito) {
    // Gratuidade: só interessa pendente do mesmo serviço
    const procAtual = norm(procedimentoNome);
    pendentesRelevantes = agsPendentes.filter(
      (a) => norm((a as { procedimento?: string | null }).procedimento) === procAtual
    );
    deveAvisar = pendentesRelevantes.length >= 1;
  } else {
    // Demais benefícios: só avisa se estourar o limite
    const limite = Number(beneficioEscolhido.limite_qtd) || 0;
    deveAvisar = limite > 0 && (usados + agsPendentes.length + 1) > limite;
  }

  if (deveAvisar) {
    const modo = beneficioEscolhido.excedente_modo;
    let excedenteTxt = "sairão sem o benefício";
    if (modo === "particular") excedenteTxt = "sairão pelo valor particular cheio";
    else if (modo === "percentual_particular") {
      const pct = Number(beneficioEscolhido.excedente_percentual) || 0;
      excedenteTxt = `sairão com ${pct}% de desconto sobre o particular`;
    } else if (modo === "valor_fixo") {
      const v = Number(beneficioEscolhido.excedente_valor) || 0;
      excedenteTxt = `sairão pelo valor fixo excedente de R$ ${v.toFixed(2)}`;
    } else if (modo === "bloquear") {
      excedenteTxt = "serão bloqueados pelo convênio";
    }
    const total = pendentesRelevantes.length + 1;
    avisoLimite = `Existem ${total} agendamentos pendentes com este benefício no período. Apenas ${beneficioEscolhido.limite_qtd} será cobrado com o benefício; os demais ${excedenteTxt} quando pagos.`;
  }
}
```

- `procedimento` já é retornado no `select` (L437), sem alteração de query.
- Desconto/bloqueio continuam sendo aplicados normalmente pela lógica existente — apenas o **texto informativo** deixa de aparecer.

## Fora de escopo

- Não muda o ramo `usados >= limite_qtd || esgotadoExclusivo` (cota já consumida).
- Não altera o modal "Gratuidade — usar agora/depois", nem cobranças, nem impressão.
