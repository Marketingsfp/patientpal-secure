## Diagnóstico

A paciente "MARIA BATALHA DA SILVA OLIVEIRA" existe **duas vezes** na tabela `pacientes` (mesmo CPF `79217117749`, mesma data de nascimento `11/02/1964`):

| id | cpf | telefone | email | endereço |
|---|---|---|---|---|
| `c6e0a881…` | `792.171.177-49` (com pontuação) | vazio | vazio | vazio |
| `23ffd434…` | `79217117749` (sem pontuação) | `21988540962` | vazio | vazio |

O agendamento da agenda está vinculado ao primeiro cadastro (o "vazio"), por isso o modal "Informações do cliente" mostra Telefone/Email/Endereço como `—`. Os dados existem, mas no cadastro duplicado.

Esse padrão deve se repetir com vários pacientes (várias pessoas atualizando o sistema criaram cadastros em paralelo, alguns com CPF formatado e outros não).

## Plano

Ajustar **apenas** a função `abrirInfoPaciente` em `src/routes/_authenticated/app.agenda.tsx` (modal "Informações do cliente") para, quando o cadastro vinculado ao agendamento tiver campos vazios, buscar os dados que faltam em outros cadastros do mesmo paciente e exibi-los — sem alterar nada no banco.

Fluxo:

1. Carrega o paciente atual (`pacienteId`) como já faz hoje.
2. Se **qualquer** dos campos `telefone`, `email`, `cep`, `logradouro`, `numero`, `bairro`, `cidade`, `estado`, `foto_url` estiver vazio, dispara uma busca de "irmãos" na mesma `clinica_id`:
   - Primeiro por **CPF normalizado** (só dígitos) — pega o CPF do paciente atual, remove tudo que não é dígito, e procura outros pacientes cuja versão normalizada do CPF bata. (Implementado no client: traz candidatos com `select` filtrado por `data_nascimento` igual + `nome` igual para limitar o set, e filtra em JS por CPF normalizado.)
   - Se o paciente atual não tiver CPF, faz fallback por `nome` (uppercase, trim) + `data_nascimento` iguais.
3. Para cada campo vazio do paciente atual, preenche **na exibição** com o primeiro valor não-vazio encontrado entre os irmãos.
4. Renderiza o modal com o objeto mesclado.

Nada é gravado: o banco continua igual, é apenas leitura adicional para a tela.

## Fora de escopo

- **Não** vou deduplicar nem mesclar registros no banco (isso é um mutirão à parte, com risco de mexer em agendamentos, financeiro, prontuário).
- **Não** vou mudar a tela de cadastro/edição de cliente nem a busca de pacientes em outros lugares.
- **Não** vou mexer em relatórios, financeiro ou regra de preço.

## Detalhes técnicos

Arquivo: `src/routes/_authenticated/app.agenda.tsx`, função `abrirInfoPaciente` (≈ linhas 462–474).

Pseudocódigo do trecho novo, dentro da função:

```ts
const base = data as any;
const camposVazios = ["telefone","email","cep","logradouro","numero","bairro","cidade","estado","foto_url"]
  .filter(k => !base?.[k]);

if (base && camposVazios.length > 0) {
  const cpfDigits = (base.cpf ?? "").replace(/\D/g, "");
  let irmaosQ = supabase.from("pacientes")
    .select("id,cpf,telefone,email,cep,logradouro,numero,bairro,cidade,estado,foto_url")
    .eq("clinica_id", clinicaAtual.clinica_id)
    .neq("id", base.id);

  if (cpfDigits.length >= 11 && base.data_nascimento) {
    irmaosQ = irmaosQ.eq("data_nascimento", base.data_nascimento);
  } else {
    irmaosQ = irmaosQ.ilike("nome", base.nome).eq("data_nascimento", base.data_nascimento);
  }

  const { data: irmaos } = await irmaosQ.limit(20);
  const match = (irmaos ?? []).filter(p => {
    if (cpfDigits.length >= 11) return (p.cpf ?? "").replace(/\D/g, "") === cpfDigits;
    return true;
  });

  for (const k of camposVazios) {
    if (!base[k]) {
      const v = match.map(p => (p as any)[k]).find(Boolean);
      if (v) base[k] = v;
    }
  }
}

setPacInfo(base);
```

`clinicaAtual` já está disponível no escopo (usado em outras consultas do arquivo).

## Arquivos a alterar

- `src/routes/_authenticated/app.agenda.tsx` — apenas a função `abrirInfoPaciente`.

Sem migrations. Sem alteração de tipos. Sem mudança no banco.
