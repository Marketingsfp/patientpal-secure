# Módulo Odontologia Completo

**Escopo confirmado:** aplicar em **todas as clínicas**, sem feature flag. Ignorar a implementação atual do módulo Odontologia (odontograma simples + orçamento) e substituir pela versão completa. Executar tudo (odontograma com 5 faces + arcada decídua, prontuário completo, orçamentos, galeria de imagens, evolução clínica, prescrição e atestado). Galeria em bucket privado `odonto-imagens` com RLS.

Este é um trabalho grande. Vou entregar em 5 fases para garantir qualidade e permitir validação incremental. Ao final de cada fase o sistema fica estável e usável.

---

## Fase 1 — Odontograma clínico completo (base)

**Objetivo:** substituir o odontograma atual por um interativo com faces e permanente/decíduo.

- Nova tabela `odonto_marcacoes` (substitui `odonto_dentes` no papel de "estado atual", mantendo histórico):
  - `id`, `clinica_id`, `paciente_id`, `dente` (int FDI adulto 11–48 e decíduo 51–85), `face` (`O`|`M`|`D`|`V`|`L`|`INTEIRO`), `status` (enum expandido), `procedimento`, `observacoes`, `criado_por`, `created_at`.
- Enum de status ampliado: hígido, cariado, restaurado, ausente, extração indicada, canal, coroa, implante, prótese, fratura, selante, sangramento, mobilidade, tártaro, aparelho, faceta.
- Componente novo `<OdontogramaClinico />`:
  - Alterna arcada **Permanente / Decídua / Mista**.
  - Cada dente mostra as 5 faces clicáveis (SVG) + botão de "dente inteiro".
  - Clique numa face abre popover: escolher status + procedimento + observação.
  - Legenda de cores + tooltip com histórico rápido do dente.
- Modal "Histórico do dente" ao dar clique-longo/duplo: lista completa de marcações + intervenções + fotos ligadas ao dente.
- Migração compatível: dados antigos de `odonto_dentes` são lidos como marcação `INTEIRO`.

## Fase 2 — Prontuário odontológico e evolução

- Tabela `odonto_anamnese_respostas` (respostas por paciente, com perguntas padrão: alergias, medicações, doenças sistêmicas, gestação, hábitos).
- Tabela `odonto_evolucoes`: `paciente_id`, `data`, `profissional_id`, `dente` (nullable), `descricao`, `procedimentos[]`, `anexos[]`.
- Aba "Anamnese" com formulário estruturado e histórico de alterações.
- Aba "Evolução clínica" (timeline cronológica, filtro por dente/profissional).
- Aba "Plano de tratamento" já existente é migrada e refinada.

## Fase 3 — Orçamento odontológico integrado

- Reaproveita `orcamentos` + `orcamento_itens` (coluna `dentes` já criada).
- Novo diálogo enxuto: seleção de procedimentos filtrados por especialidade Odontologia, dentes envolvidos por item, desconto por item e total.
- Vínculo bidirecional: item de orçamento aberto marca anel amarelo no odontograma; ao clicar no dente aparecem os itens.
- Ao **aceitar** orçamento, procedimentos aceitos viram plano de tratamento com status "planejado" no odontograma, e ao registrar evolução o status muda para "executado".

## Fase 4 — Galeria de imagens

- Bucket privado `odonto-imagens` (RLS por `clinica_id` + membership).
- Tabela `odonto_imagens`: `paciente_id`, `dente` (nullable), `tipo` (radiografia, foto intraoral, extraoral, documentação), `url`, `descricao`, `data`, `criado_por`.
- Aba "Imagens" com upload múltiplo, thumbnails, viewer e filtro por dente/tipo.
- Vínculo opcional a evolução clínica.

## Fase 5 — Prescrição e atestado

- Tabela `odonto_documentos`: `tipo` (receita_simples, receita_controlada, atestado, orientacoes_pos), `paciente_id`, `profissional_id`, `conteudo`, `emitido_em`.
- Modelos padrão configuráveis (reaproveita `modelos_documentos` filtrando por tipo).
- Geração PDF com layout já usado no sistema (cabeçalho da clínica + assinatura do profissional).
- Botão "Nova receita" e "Novo atestado" na tela do paciente odontológico.

---

## Layout final da tela `/app/odontologia`

```text
┌───────────────────────────────────────────────────────────────┐
│ Cabeçalho: Paciente + prontuário + convênio + idade           │
├───────────────────────────────────────────────────────────────┤
│ [Odontograma]  [Anamnese] [Evolução] [Plano] [Orçamento]      │
│                [Imagens]  [Documentos]                        │
├───────────────────────┬───────────────────────────────────────┤
│                       │  Painel lateral contextual:            │
│   ODONTOGRAMA         │   - Dente selecionado                  │
│   (faces + decídua)   │   - Histórico rápido                   │
│                       │   - Ações (marcar, orçar, evoluir)     │
└───────────────────────┴───────────────────────────────────────┘
```

## Regras de negócio e segurança

- Alteração global (todas as clínicas), sem feature flag.
- Todas as tabelas novas com RLS por `clinica_id` + `has_role` para admin.
- GRANTs explícitos para `authenticated` e `service_role` em cada migration.
- Bucket privado — leitura só via signed URL do server.
- Só profissionais com permissão de **edição** em `odontologia` podem criar marcações, evoluções, orçamentos e documentos.

## Detalhes técnicos (para referência)

- Componente `<OdontogramaClinico />` em `src/components/odontologia/odontograma-clinico.tsx` (SVG com 5 faces por dente).
- Hook `useOdontoPaciente(pacienteId)` centraliza queries (marcações, orçamentos abertos, evoluções recentes).
- Server functions em `src/lib/odontologia/*.functions.ts` para PDFs e signed URLs.
- Migrations separadas por fase para minimizar risco.

## Riscos e pendências

- Os dados atuais de `odonto_dentes` são preservados; o odontograma novo lê ambos.
- Substituir uma tela que já está em uso: o layout antigo será removido — se você quiser manter uma opção "modo simples", me avisa antes da Fase 1.
- Prescrição controlada exige assinatura digital em algumas jurisdições — este módulo emite o PDF, mas a validade legal depende do processo interno de cada clínica. Sinalizar isso no rodapé do documento.

**Ordem sugerida de execução:** Fase 1 → validação com você → Fases 2 e 3 → validação → Fases 4 e 5.

Confirma que posso começar pela **Fase 1** já?
