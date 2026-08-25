# Diagnóstico — especialidade nova não aparece para Recepção/Caixa (25/08/2026)

## Resumo

1. **RLS não é a causa.** Recepção e Caixa têm permissão de leitura em todas as
   tabelas envolvidas. Verificado direto no banco de produção.
2. **O problema é cache no navegador.** A alteração é gravada no banco, mas o
   navegador da recepcionista não tem como ficar sabendo que ela aconteceu —
   o aviso de "recarregue o catálogo" só funciona dentro do mesmo computador.

---

## 1) RLS — verificado, está liberado

Políticas de SELECT hoje em produção:

| Tabela | Quem pode ler |
|---|---|
| `especialidades` | qualquer usuário logado (`USING true`) |
| `medico_especialidades` | `is_member(auth.uid(), clinica_id)` |
| `procedimento_especialidades` | `is_member(auth.uid(), clinica_id)` |
| `medicos` | `is_member(...)` |
| `procedimentos` | `is_member(...)` |
| `medico_procedimentos` | `is_member(...)` |
| `medico_agendas` / `medico_agenda_procedimentos` | `is_member(...)` |

E `is_member` é:

```sql
SELECT EXISTS (
  SELECT 1 FROM clinica_memberships
  WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo = true
)
```

Ou seja: **não olha o cargo**. Basta ter vínculo ativo na clínica. Existe uma
única clínica, com 6 usuários `recepcao` e 6 `caixa` ativos nela. Os perfis
`recepcao` e `caixa` inclusive têm acesso concedido aos módulos `medicos`,
`especialidades` e `procedimentos` na tela de Perfis.

As alterações recentes estão gravadas corretamente, ativas e com o
`clinica_id` certo:

- 25/08 13:57 — serviço `VIAS URINARIAS INFANTIL` vinculado a `LABORATORIO` e `ULTRASSONOGRAFIA`
- 25/08 13:57 — médica `ISIS SERRANO DUARTE` recebeu `ULTRASSONOGRAFIA`
- 25/08 10:13 — `RAIO-X`

Todas as especialidades envolvidas estão com `ativo = true`.

**Conclusão: não há nada no banco escondendo esses dados da recepção.**

## 2) Cache — é aqui que está o problema

Existem três camadas de cache e **nenhuma delas atravessa de um computador para
outro**:

**a) `src/lib/agenda/refs-cache.ts`** — guarda médicos, serviços e vínculos por
60 segundos (valores por 5 minutos). Quando o administrador salva um serviço ou
um médico, o sistema chama `invalidateAgendaRefs`, que avisa:
- a própria aba (evento de janela);
- outras abas **do mesmo navegador** (`BroadcastChannel`).

Não existe nenhum aviso que chegue à máquina da recepção.

**b) React Query (`src/router.tsx`)** — configuração global:
`staleTime: 5 min`, `refetchOnMount: false`, `refetchOnWindowFocus: false`.
As telas que usam esse cache (**Agenda V2** e o **assistente de novo
agendamento**, com `staleTime` de 5–10 min) **não recarregam sozinhas** nem ao
voltar para a tela, nem ao clicar na janela. Ficam paradas até um F5 de verdade.

**c) Realtime** — a Agenda escuta em tempo real apenas as tabelas
`agendamentos` e `estorno_solicitacoes`. As tabelas de catálogo
(`especialidades`, `medico_especialidades`, `procedimento_especialidades`,
`medicos`, `procedimentos`) **nem sequer estão na publicação
`supabase_realtime`** do banco. Não há canal por onde o aviso pudesse chegar.

### Atenuante na Agenda clássica

A Agenda clássica (`app.agenda.tsx`) relê especialidades e vínculos toda vez que
o diálogo de "novo agendamento" é aberto. Então lá o problema tende a se
resolver sozinho em até ~1 minuto. Na Agenda V2 e no assistente, não.

---

## Correção recomendada (só front-end, sem mexer no banco)

Fazer as telas de Agenda relerem o catálogo quando a aba volta ao foco
(a recepcionista clica na janela do sistema depois de atender alguém), além do
que já existe hoje. É uma mudança pequena, não altera dado nenhum e cobre tanto
a Agenda clássica quanto a V2 e o assistente.

Alternativa mais forte (exige migration no SQL Editor): publicar as tabelas de
catálogo no realtime e assinar as mudanças. Fica mais instantâneo, mas mexe em
configuração do banco. Recomendo começar pela correção de front-end.

## Teste imediato para a clínica

Na máquina da recepção, apertar **Ctrl+F5** (recarregar de verdade). Se a
especialidade aparecer, é exatamente o cache descrito acima. Se **não** aparecer
nem depois disso, o problema é outro e preciso saber a tela e o campo exatos.
