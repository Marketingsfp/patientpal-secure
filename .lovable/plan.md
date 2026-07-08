## Objetivo
Fazer com que o menu lateral respeite estritamente os módulos habilitados na tela **Perfis** para o perfil logado (ex.: médico "Raio-x").

## Diagnóstico
Em `src/components/app-shell.tsx`:

1. O mapa `ROUTE_TO_MODULE` (linhas 62–96) cobre só parte das rotas do menu. Rotas não mapeadas caem no fallback `if (!mod) return true` de `leafAllowed`, ou seja, ficam **sempre visíveis**, ignorando as permissões.
2. Itens de menu hoje sem mapeamento (aparecem para todo mundo):
   - `/app/agenda/express` (Agenda Express)
   - `/app/atendimento-multiplo` (Atendimento Múltiplo)
   - `/app/financeiro/atendimentos` está mapeado para `financeiro` mas o rótulo é "Repasse médico" — ok, mantém.
   - `/app/painel-executivo` (Painel Executivo)
   - `/app/cartao-beneficios/contratos` está ok.
   - `/app/nina` (o grupo Nina — WhatsApp)
   - `/app/configuracoes/nfse` (NFS-e)
   - `/app/procedimentos`, `/app/tipos-servico`, `/app/enfermagem-recursos` (aliases de Serviços — ok pelo `to` base `/app/especialidades`).
3. Também mudar o fallback: quando `allowed` não é `null` (usuário não-admin com permissões carregadas), **rotas sem mapeamento devem ser ocultas por padrão**, para evitar que qualquer novo item futuro vaze permissão. Manter allowlist explícita das rotas "sistema" que devem sempre aparecer (ex.: `/app` chooser, `/app/perfil-proprio` se existir no menu — hoje não existe).

## Alterações (somente `src/components/app-shell.tsx`)

### 1) Completar `ROUTE_TO_MODULE`
Adicionar entradas para toda rota que aparece em `navRows`:

```ts
"/app/agenda/express": "agenda",
"/app/atendimento-multiplo": "atendimento-multiplo",
"/app/painel-executivo": "painel-executivo",
"/app/nina": "nina",
"/app/configuracoes/nfse": "nfse",
"/app/boletos": "boletos",           // se aparecer em algum grupo
"/app/contratos": "contratos",
"/app/lgpd": "lgpd",
"/app/integration-secrets": "integration-secrets",
"/app/hr-contratos": "hr-contratos",
"/app/hr-ferias": "hr-ferias",
"/app/hr-holerites": "hr-holerites",
"/app/treinamentos": "treinamentos",
"/app/lms-admin": "lms-admin",
"/app/clinicas": "clinicas",
"/app/medicos": "medicos",
"/app/procedimentos": "procedimentos",
"/app/planos": "planos",
"/app/estoque": "estoque",
"/app/modelos-documentos": "modelos-documentos",
"/app/tipos-servico": "tipos-servico",
"/app/enfermagem-recursos": "enfermagem-recursos",
"/app/campanhas": "campanhas",
"/app/mkt-envios": "mkt-envios",
"/app/mkt-landing": "mkt-landing",
"/app/mkt-segmentos": "mkt-segmentos",
"/app/documentos": "documentos",
"/app/prontuarios": "prontuarios",
"/app/anamneses": "anamneses",
```

### 2) Inverter fallback de `leafAllowed`
```ts
function leafAllowed(to: string, allowed: Set<string> | null): boolean {
  if (!allowed) return true;                    // admin / carregando
  const mod = ROUTE_TO_MODULE[to];
  if (!mod) return false;                       // rota não mapeada → ocultar
  return allowed.has(mod);
}
```
Assim, qualquer item novo passa a exigir mapeamento explícito para aparecer — nada mais "vaza".

### 3) Verificar comportamento para o perfil médico
Com o preset atual de `medico` em `permissoes-presets.ts`, o menu passará a mostrar apenas:
- Agenda, Atendimento Múltiplo, Chat interno, Clientes
- Atendimento médico (IA), Informações rápidas, Odontologia, Resultados de Exames
- Modelos de Prontuário

Se o gestor tiver salvo permissões customizadas para o perfil "Raio-x" na tela `/app/perfis`, o menu passará a refletir exatamente essa configuração salva em `perfil_permissoes`.

## Fora do escopo
- Não altero rotas, componentes de páginas, banco, `permissoes-presets.ts` nem `usePermissoes`. Somente o filtro do menu na `AppShell`.
- Não altero o comportamento admin (continua vendo tudo).
- `isMedicoOnly` (menu enxuto médico) continua com precedência quando ativo — não é alterado.

## Verificação
1. Build TypeScript passa.
2. Logar como perfil médico "Raio-x": conferir na sidebar que só aparecem os itens permitidos em `/app/perfis` para esse perfil.
3. Logar como admin: menu completo permanece.