## Objetivo
Na página `/app/odontologia`, deixar as abas **Prontuário** e **Orçamento** sempre visíveis (não esconder até selecionar paciente) e mover o campo de busca de paciente para dentro de cada aba, de forma independente entre elas.

Escopo: alteração global (todas as clínicas), sem feature flag. Apenas frontend — nenhuma alteração de banco, RPC ou regra de negócio.

## Alterações

**`src/routes/_authenticated/app.odontologia.tsx`** (único arquivo alterado):

1. Renderizar `<Tabs>` sempre — remover o `{pacienteId && (...)}` que hoje envolve as abas.
2. Remover o `<Card>` do filtro de paciente que hoje fica acima das abas.
3. Dentro de **cada** `<TabsContent>` (`prontuario` e `orcamento`), incluir no topo um card com `PatientSearchInput` próprio, com estado independente:
   - Aba Prontuário: usa os estados atuais `pacienteId` / `pacienteSel` (mantém a lógica de carregamento de odontograma/prontuário já existente).
   - Aba Orçamento: novos estados locais `pacienteIdOrc` / `pacienteSelOrc` — o `OrcamentoTab` passa a receber esse par.
4. Em cada aba, o conteúdo (odontograma/cards/histórico na aba Prontuário; `OrcamentoTab` na aba Orçamento) só renderiza quando houver paciente selecionado naquela aba; caso contrário mostra um placeholder discreto ("Selecione um paciente para começar.").
5. Nenhuma mudança em `OrcamentoTab`, `Odontograma`, RPCs ou tabelas.

## Fora do escopo
- Sincronizar o paciente entre as abas (o usuário escolheu explicitamente filtros independentes).
- Qualquer mudança de regra de negócio, permissão ou banco.

## Validação
- Abrir `/app/odontologia` sem paciente: abas visíveis, cada uma com seu campo de busca.
- Selecionar paciente A na aba Prontuário e paciente B na aba Orçamento: cada aba mantém o seu.
- Voltar à aba Prontuário: seleção anterior preservada.
- Perfis sem permissão de escrita continuam com campos desabilitados.
