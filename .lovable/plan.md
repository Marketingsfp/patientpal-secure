## Verificação visual dos 5 pacientes no Check-in

### Status no banco (já confirmado por SQL)
Todos os 5 agendamentos existem com `fluxo_etapa = aguardando_recepcao`, `status = agendado` e `fin_lancamentos` receita associado (=> aparecerão com badge **PAGO**):

| Paciente | Data/Hora BRT |
|---|---|
| JOAO PEDRO NEVES CANTARELA | 02/07 09:00 |
| QA CODEX PACIENTE 01072026 | 02/07 14:30 |
| NICOLY KIDMAN | 03/07 10:15 |
| ASTOLFO ARNALDO | 04/07 16:00 |
| DANIELE CRISTINA DA SILVA SOARES | 09/07 08:45 |

### O que vou fazer
Abrir `/app/checkin` no Playwright (autenticado com sua sessão, clínica POLICLINICA MENINO JESUS) e trocar o seletor de data 4 vezes, tirando um screenshot em cada:

1. **02/07/2026** → esperar ver Joao Pedro + QA Codex (contador "2 aguardando").
2. **03/07/2026** → esperar ver Nicoly Kidman (contador "1 aguardando").
3. **04/07/2026** → esperar ver Astolfo Arnaldo (contador "1 aguardando").
4. **09/07/2026** → esperar ver Daniele Cristina (contador "1 aguardando").

Para cada data, extraio o texto da lista e comparo com o nome esperado.

### Entrega
Uma tabela com: data testada, quem apareceu, badge PAGO presente (sim/não), e os 4 screenshots anexados. Sem alterações no código nem no banco — só leitura/navegação.