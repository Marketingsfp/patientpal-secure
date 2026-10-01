# Nina — decisões técnicas

- Recursos internos da Nina que usam Claude chamam `chamarClaudeComoResponses` (`claude-messages.server.ts`), que traduz o corpo Responses para `/v1/messages` — por quê: Opus 5.5 só é servido em Messages e os chamadores não precisam ser reescritos.
- Decisões do Jev passam por `perguntarJev` (`jev.server.ts`), só em homologação com flag `nina_jev_faseN` e registro em `nina_jev_decisoes` — por quê: erro ou demora vira "sem decisão" e a produção fica intocada.
