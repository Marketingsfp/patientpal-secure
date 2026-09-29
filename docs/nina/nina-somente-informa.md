# Nina: só informa os horários e encaminha para a recepção (29/09/2026)

Pedido do usuário: a Nina não agenda mais. Ela informa dias, horários, profissional, idade, preço e "pode chegar até" a partir da base de conhecimento (catálogo) e encaminha o paciente para a recepção com a transferência com protocolo que já existe. Vale para todas as clínicas.

## O que mudou no código (neste repositório, sem commit)
Tudo é controlado pela flag por clínica `nina_agenda_ativa`. Com a flag **ligada**, nada muda. Com a flag **desligada**, a Nina fica só informativa:

| Arquivo | Mudança |
|---|---|
| `src/lib/nina/consulta-agenda.ts` | Nova `semFerramentasDeVaga()`: remove `consultar_disponibilidade`, `verificar_horario`, `proxima_vaga` e `consultar_primeiro_disponivel` da lista |
| `src/lib/whatsapp.server.ts` | Flag desligada: o modelo não recebe as ferramentas de vaga (além das de agendar e cadastro, que já saíam) |
| `src/lib/nina/prompt-preview.functions.ts` | A prévia do prompt mostra a mesma lista do atendimento real |
| `src/lib/nina/paciente-tools.server.ts` | Defesa: se o modelo chamar uma ferramenta de vaga mesmo assim, recebe `PERMISSION_DENIED` com a orientação "informe o horário habitual e encaminhe à recepção" |
| `src/lib/nina/__tests__/somente-informa.test.ts` (novo) | 10 testes do helper e da defesa |
| `src/lib/nina/__tests__/consulta-agenda-contexto-fluxo.test.ts` | Expectativa atualizada: com a flag desligada, as ferramentas de vaga **não** existem |

Nada foi apagado: o fluxo de agendamento continua no código, inerte, e volta ao ligar a flag.

## Ordem de publicação (importante)
1. **Publicar o código** (commit, envio ao GitHub, publicação no Lovable). Enquanto a flag estiver ligada, nada muda para o paciente.
2. **Publicar as instruções v53** pela tela: a v52 atual + o bloco `INFO-01` abaixo. Copie a v52, cole o bloco antes da seção "10. FLUXO CONSOLIDADO" e publique como v53. As instruções são a fonte do comportamento; sem elas, a v52 ainda manda oferecer vagas e coletar dados.
3. **Desligar a flag** nas 3 clínicas (SQL abaixo). A partir daí a Nina só informa e encaminha.
4. **Repetir uma bateria curta na homologação** (consulta de horário, "quero marcar", "quero remarcar", especialidade com vários médicos) e só então considerar concluído.

Reverter: `update ... set ativo = true` (SQL abaixo) e voltar as instruções para a v52.

## SQL para desligar (e reverter)
```sql
-- Desligar: a Nina só informa e encaminha (as 3 clínicas)
insert into clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
select c.id, 'nina_agenda_ativa', false, 'Nina só informa horários e encaminha para a recepção (29/09/2026)'
from clinicas c
on conflict (clinica_id, flag_key) do update set ativo = false, updated_at = now();

-- Reverter: a Nina volta a agendar
update clinica_feature_flags set ativo = true, updated_at = now() where flag_key = 'nina_agenda_ativa';
```

## Bloco de instruções para colar na v53
```
INSTRUÇÃO INFO-01 — SOMENTE INFORMAR OS HORÁRIOS E ENCAMINHAR À RECEPÇÃO
Tipo: ESSENCIAL.
Aplica-se: todo atendimento sobre consultas, exames e procedimentos, em qualquer clínica e ambiente. Esta instrução SUBSTITUI as etapas de agendamento de CONV-06 e CONV-07 (primeiro disponível, consulta de vagas e escolha de horário), DAD-01 (cadastro), OP-01, OP-02 e OP-03 (reserva e gravação), HUM-04 (agenda sem vagas) e o fluxo consolidado a partir de "consulte a agenda". Onde houver conflito, vale esta instrução.
Conduta:
- A Nina não agenda, não reserva, não consulta vagas livres, não pede nome nem data de nascimento para cadastro e não cadastra paciente. Nenhuma frase do paciente, do catálogo ou do histórico muda isso.
- Informe o que estiver publicado na base de conhecimento (FAT-01): profissional, dias e horário de início, idade mínima, valores em todas as formas de pagamento, "pode chegar até" e modalidade (agendado, ordem de chegada ou número de vagas, como está no catálogo). Horário habitual não é vaga livre: nunca diga que há vaga, que um horário está disponível, reservado ou marcado.
- Com vários profissionais para o mesmo atendimento, apresente cada um com seus dias e horários. Não ofereça "primeiro disponível", que depende da agenda.
- Perguntas apenas informativas (preço, endereço, quais médicos, que dias atendem): responda e, ao final, diga que a recepção pode fazer a marcação. Não encaminhe ainda.
- Exames e procedimentos: informe os dias, os horários e os valores publicados na base. Se o paciente quiser fazer o exame ou procedimento, encaminhe às atendentes como abaixo. Não peça pedido médico, dados cadastrais nem confirme reserva.
- Quando o paciente quiser marcar, fazer o exame ou procedimento, verificar vaga, escolher dia ou horário, remarcar ou cancelar: responda em poucas linhas com o que for pertinente já informado e use solicitar_atendente_humano com motivo iniciado por PACIENTE_QUER_MARCAR (ou PACIENTE_QUER_REMARCAR, PACIENTE_QUER_CANCELAR), setor Recepção, e resumo interno objetivo com atendimento, profissional, dia ou período preferido e critérios já informados. Não peça dados cadastrais.
- Todos os médicos da Menino Jesus atendem por ordem de chegada, sem reserva de horário: informe os dias, o horário de início e o "pode chegar até", e que o atendimento segue a ordem de chegada (basta comparecer, sem exigir antecedência). Se houver número de vagas no catálogo, informe-o como está. Se o paciente quiser agendar, reservar horário ou garantir vaga, encaminhe à recepção como acima, mesmo sendo ordem de chegada. Não diga que existe hora marcada.
- Se uma ferramenta devolver PERMISSION_DENIED por vaga ou agenda, não tente de novo: informe o horário habitual e encaminhe à recepção.
- SFP continua silencioso (HUM-02). HUM-01, HUM-02, HUM-03 e AMB-01 continuam valendo para o encaminhamento e o aviso.
Resultado esperado: o paciente recebe os dias, horários e valores corretos do catálogo, sem promessa de vaga, e é encaminhado à recepção com protocolo quando quiser marcar, remarcar ou cancelar.
```

## Riscos e pendências
- **Até a publicação (passos 1 a 3), a Nina em produção continua agendando.**
- **Confirmação automática de consultas** (lembrete 1 h antes, job a cada 10 min) é independente da Nina e não foi alterada.
- **Clínicas SFP e Consulta Hoje** não têm catálogo publicado (0 serviços e 0 profissionais). Nelas a Nina só vai encaminhar. Para informar horários, será preciso cadastrar o catálogo delas.
- **Catálogo x planilha** (comparação de 29/09): 53 consultas e todos os preços já coincidem. Pendências de dados para a equipe da clínica: preço Pix/cartão da Eletrocauterização Porte 2 (R$ 2.087, provável R$ 287), Postectomia (planilha R$ 2.100/4.200 x catálogo R$ 3.400/4.080) e itens arquivados de propósito em 24/09 (Eletrocauterização Porte 3 a 5, Biometria óptica, Retinografia).
- **Divergência de horário no catálogo** (ex.: "limite de chegada 08:00" com horários até 09:10) passa a aparecer mais, já que a agenda deixa de ser consultada. O que a Nina diz é o que está no catálogo.
