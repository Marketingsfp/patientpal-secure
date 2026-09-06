# Fase 4 — testes funcionais reprodutíveis

Três camadas separadas. Uma não substitui a outra.

| Camada | Onde | Como rodar | Modelo/dados |
| --- | --- | --- | --- |
| Contratos e regras | `src/testes/fase4/contratos.test.ts` | `bun test` | dados sintéticos, sem rede |
| Interface (visual) | `e2e/*.spec.ts` | `bunx playwright test` | sessão real de homologação |
| Nina com modelo real | `scripts/nina-modelo-real.ts` | `NINA_LIVE=1 bun run scripts/nina-modelo-real.ts --clinica <uuid>` | modelo configurado, sem simulação |

A suíte `bun test` está restrita a `src/` (`bunfig.toml`), então os testes de
interface não interferem no conjunto existente.

## Variáveis necessárias (homologação)

- `E2E_URL` (padrão `http://localhost:8080`)
- `E2E_EMAIL` / `E2E_SENHA` — atendente de homologação
- `E2E_ADMIN_EMAIL` / `E2E_ADMIN_SENHA` — administrador (cenário de supervisão)
- `E2E_CATALOGO_ESCRITA=1` — libera cadastro/IA no catálogo (desligado por padrão)
- `NINA_LIVE=1` — libera o executor do modelo real
- `NINA_LIVE_AGENDA=1` — libera cenários que tocam a agenda (desligado por padrão)

Sem credenciais, os testes de interface são **pulados** e aparecem como pulados
no relatório. Pulado não é aprovado.

## Bloqueios ainda em aberto (Fase 2)

- Agendamentos de homologação ocupam a agenda real: cenário 5 (agendamento
  persistido) e cenário 6 (protocolo por agendamento) **não foram executados**.
- Catálogo de teste compartilha registros publicados com a operação: escrita de
  catálogo fica atrás de flag.
- Usuários e presença são os reais: os cenários de perfil exigem usuários de
  homologação dedicados.

## Evidências

Gravadas em `evidencias/` (ignorado pelo versionamento):
`evidencias/interface/resultado.json` e `evidencias/nina/execucao-<timestamp>.json`
com chamada, duração, resposta e conferência fato a fato.
