# Nina — decisões técnicas

- Recursos internos da Nina que usam Claude chamam `chamarClaudeComoResponses` (`claude-messages.server.ts`), que traduz o corpo Responses para `/v1/messages` — por quê: Opus 5.5 só é servido em Messages e os chamadores não precisam ser reescritos.
- Decisões do Jev passam por `perguntarJev` (`jev.server.ts`), só em homologação com flag `nina_jev_faseN` e registro em `nina_jev_decisoes` — por quê: erro ou demora vira "sem decisão" e a produção fica intocada.
- Avaliação da homologação usa a rubrica `sol-v2` (`avaliador-sol.ts`): critérios do documento "Treinador e Auditor" + critérios de prova; nota e veredito calculados no código; "nova regra sugerida" vira `nina_aprendizados` PENDING — por quê: o modelo nunca aprova nem aplica regra sozinho.
- Primeira busca de atendimento sem resultado vira pergunta de confirmação (`confirmarAntesDeEncaminhar`, motivo `sem_registro_confirmar`); só a segunda falha encaminha — por quê: escrita popular/errada não pode transferir na hora.
- Conferência antes do envio (Jev Fase 6, `jev-conferencia.ts`): o Jev só julga o texto; o código cruza com os fatos do turno e pede no máximo uma reescrita, depois mensagem segura — por quê: o modelo de decisão não conhece a agenda e a correção nunca pode autorizar ação nova.
