# Completar lista de módulos em Perfis de Acesso

## Problema

A tela `/app/perfis` lista os módulos do sistema agrupados (Operação, Inteligência, Marketing, Cadastros, Gestão, RH, Sistema), mas várias rotas reais do sistema não aparecem para seleção de permissão. Hoje há 47 módulos cadastrados, mas o sistema tem mais funções acessíveis.

## Módulos faltantes detectados

Comparando `src/routes/_authenticated/app.*.tsx` com `GRUPOS` em `app.perfis.tsx`:

| Rota | Sugestão de grupo | Nome sugerido |
|---|---|---|
| `app.anamneses.tsx` | Operação | Anamneses |
| `app.boletos.tsx` | Gestão | Boletos |
| `app.checkin.tsx` | Operação | Check-in |
| `app.clinicas.tsx` | Cadastros | Clínicas |
| `app.contratos.tsx` | Gestão | Contratos |
| `app.documentos.tsx` | Operação | Documentos |
| `app.estoque.tsx` | Cadastros | Estoque |
| `app.funcionarios.tsx` | Cadastros | Funcionários (lista) |
| `app.modelos-documentos.tsx` | Cadastros | Modelos de Documentos |
| `app.nfse.tsx` | Gestão | NFS-e |
| `app.painel.tsx` | Operação | Painel de Senhas |
| `app.planos.tsx` | Cadastros | Planos de Saúde/Convênios |
| `app.prontuarios.tsx` | Inteligência | Prontuários |

Observação: `app.clinicas.tsx` e o módulo já existente `unidades` parecem cobrir conceitos próximos — confirmar se devem ser entradas separadas ou unificadas.

## Mudanças

**Arquivo único:** `src/routes/_authenticated/app.perfis.tsx`

1. Adicionar as 13 entradas acima nos respectivos grupos do array `GRUPOS`, mantendo ordem alfabética dentro de cada grupo.
2. Atualizar `PRESETS` para incluir acessos padrão sensatos nos novos módulos para cada perfil (ex.: `recepcao` → `checkin: "write"`, `painel: "write"`, `anamneses: "write"`; `medico` → `prontuarios: "write"`, `anamneses: "write"`, `documentos: "write"`; `financeiro` → `boletos: "write"`, `nfse: "write"`, `contratos: "write"`; `admin` já recebe `write` em todos automaticamente).
3. Nenhuma mudança de backend/RLS — a tela hoje é apenas pré-visualização (botão Salvar está desabilitado), então é só atualizar a listagem visual.

## Fora de escopo

- Persistência das permissões no banco (continua mock como hoje).
- Alteração das regras reais de acesso por rota (RLS / `can_manage_clinica`).
