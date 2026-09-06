# Testes automatizados do atendimento e da Nina

Documento único. Fase 4 define as camadas de teste; Fase 5 define a execução
pelo Codex. Não criar outro arquivo de instruções.

## Fase 4 — testes funcionais reprodutíveis

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

---

## Fase 5 — execução pelo Codex

### Checklist obrigatório ANTES de executar

Responda cada item por escrito. Item sem resposta = execução não autorizada.

1. **Clínica e URL de homologação** — `--clinica <uuid>` e `E2E_URL`. Não presuma
   nenhuma clínica; confirme com a equipe.
2. **Identidade e perfil** — entre pela tela de login com o usuário de
   homologação. Sem atalho, sem token colado, sem service-role no navegador.
3. **Isolamento** — só conversas com `is_teste = true` e telefones `5500NN…`.
   Agenda e catálogo ainda são compartilhados com a operação (ver bloqueios).
4. **Modelo Astra** — confirme que o Codex está usando Astra. Prova feita com
   outro modelo não vale como validação do Astra.
5. **Descoberta WebMCP** — no navegador do Codex, `document.modelContext` deve
   existir e as ferramentas do site devem aparecer em Site tools.
6. **Permissões de navegador / Computer Use** — habilitadas na instalação do
   Codex, no aplicativo, não no código.
7. **Limites** — lote inicial pequeno, teto de chamadas do executor e registro
   de duração/consumo antes de ampliar.

Nunca desligue autenticação, permissão, validação ou confirmação do produto
para "automatizar" o teste.

### Comandos que realmente existem

```bash
bunx tsgo --noEmit                 # checagem de tipos
bun test                           # contratos e regras (só src/)
bun run build                      # build
bunx playwright test               # interface, com as variáveis abaixo
NINA_LIVE=1 bun run scripts/nina-modelo-real.ts --clinica <uuid> --lote 3
bun run scripts/nina-homologacao.ts   # bateria da Nina fora do app
```

### Caminho estruturado (WebMCP)

Ferramentas registradas na página autenticada `/app/nina`
(`src/lib/webmcp/ferramentas.ts`). Use-as para ler estado autorizado e executar
as operações previstas nos cenários, sempre com identificador explícito da
conversa. Não há ferramenta genérica de SQL, script ou requisição livre.

### Caminho visual (navegador / Computer Use)

Percorra os controles reais e confirme na tela:
botão **Transferir** na posição atual; seletor de atendente com Online / Em pausa /
Offline em texto; eventos internos na linha do tempo com autor e destino; nome,
código da conversa e protocolo MJ no cabeçalho; preenchimento visível dos
formulários do catálogo pela IA; envio, rolagem, carregamento e atualização
incremental da conversa.

Um botão ou formulário que o teste não usou fica como **Não executado**.

### Registro de cada cenário

| Campo | Conteúdo |
| --- | --- |
| Caminho | WebMCP, interface ou ambos |
| Esperado | o fato esperado, não o texto exato |
| Observado | o que aconteceu |
| Evidência | captura ou JSON em `evidencias/` |
| Resultado | Aprovado / Falhou / Bloqueado / Não executado |

Capturas e registros não podem conter credenciais nem dados reais de paciente.

### Limpeza dos dados sintéticos

Use o procedimento já existente do console: **Resolver** o lead de teste com a
opção de remover agendamentos (`resolverConversaTeste`, campo
`removerAgendamentos`). Ele apaga apenas registros `is_mock_data` de
`origem_integracao = "nina_homologacao"` daquela conversa e abre nova sessão.
Não apague nada por SQL manual e não toque em conversas de outros atendimentos.
