---
name: Política de governança e dados imutáveis
description: Regras permanentes de proteção de dados históricos (pacientes, financeiro, auditoria), governança de migrations, padrão de evolução com feature flag, compatibilidade com módulos clássicos e alterações destrutivas.
type: constraint
---

## 1. Dados históricos protegidos (IMUTÁVEIS)

**Pacientes:**
- `codigo_prontuario`
- `codigo_prontuario_anterior`
- `numero_pasta`
- número da ficha, número do prontuário
- qualquer identificador importado do sistema anterior
- data da primeira matrícula (quando existir)

**Financeiro:**
- histórico financeiro
- movimentações de caixa
- atendimentos financeiros concluídos
- NFS-e emitidas
- boletos emitidos

**Auditoria:**
- `audit_log`
- `criado_por`, `atualizado_por`, `created_at`
- histórico completo de alterações

**Proibido sem autorização explícita do usuário** — nenhuma migration, trigger, RPC, sincronização, importação, IA, script de manutenção, deduplicação ou refatoração pode alterar automaticamente esses dados. Também proibido: renumerar prontuários/fichas/pastas, reutilizar números antigos, sobrescrever identificadores legados, apagar histórico financeiro, apagar auditoria, alterar documentos fiscais já emitidos.

Tratamento padrão: **somente leitura e referência histórica.**

## 2. Governança de migrations

Antes de qualquer migration estrutural, apresentar relatório com: tabelas afetadas, colunas, índices, triggers, funções, RPCs, RLS, telas impactadas, riscos, rollback, impacto financeiro e operacional. **Nenhuma migration estrutural sem aprovação explícita.**

## 3. Padrão de evolução

Toda evolução segue: Feature Flag → Preview isolado → Produção intocada → Testes Playwright → Validação visual do usuário → Promoção controlada → Rollback imediato.

## 4. Compatibilidade

Enquanto um módulo estiver em V2: manter clássico funcionando, não remover código antigo, usar feature flag, garantir rollback imediato.

## 5. Alterações destrutivas

Remoção de tabelas, colunas, funções, triggers, RPCs ou componentes críticos exige autorização explícita. Sempre preferir alterações aditivas.

## 6. Política permanente

Qualquer alteração que envolva dados históricos, tabelas críticas ou regras de negócio → **interromper e pedir aprovação antes de prosseguir.**

**Why:** proteger a integridade operacional, fiscal e de auditoria da clínica; dados legados são referência oficial e não podem ser reescritos por automação.
**How to apply:** aplicar a toda feature, migration, RPC, script, refactor ou ação de IA — em caso de dúvida, parar e perguntar.