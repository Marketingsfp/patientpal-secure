# Fase 4 — Galeria de Imagens Odontológicas

Adiciona ao Prontuário Odontológico uma galeria para anexar fotos intraorais, extraorais, radiografias e documentação clínica do paciente, com categorização, data do exame e vínculo opcional a dentes específicos do odontograma.

## Escopo

**Clínica-alvo:** confirmar antes de aplicar. Presumo aplicação global (3 clínicas) por ser fase padrão do módulo, mas aguardo confirmação.

## Backend

Migration única:

1. **Bucket de storage** `odonto-imagens` (privado, RLS por `clinica_id/paciente_id/...`).
2. **Tabela `odonto_imagens`**:
   - `paciente_id`, `prontuario_id` (nullable)
   - `clinica_id`
   - `storage_path` (texto), `mime_type`, `tamanho_bytes`, `largura`, `altura`
   - `categoria` enum: `intraoral`, `extraoral`, `radiografia_periapical`, `radiografia_panoramica`, `tomografia`, `foto_documentacao`, `outro`
   - `dentes` int[] (opcional, referência ao odontograma)
   - `data_exame` (date), `descricao` (texto), `tags` text[]
   - `criado_por`, `created_at`, `updated_at`
   - GRANT authenticated/service_role
   - RLS: `is_member(clinica_id)` para todas operações
   - Trigger `updated_at`
3. **Políticas de Storage** no bucket: leitura/escrita restrita a membros da clínica dona da imagem (extraindo `clinica_id` do primeiro segmento do path).

## Frontend

Novos arquivos:

- `src/components/odonto/galeria-odonto-tab.tsx` — aba principal, grid responsivo com thumbnails, filtros por categoria/data/dente.
- `src/components/odonto/upload-imagem-dialog.tsx` — upload múltiplo com preview, seleção de categoria, data, dentes vinculados e descrição.
- `src/components/odonto/visualizar-imagem-dialog.tsx` — lightbox com zoom, metadados, edição de campos e exclusão.
- `src/lib/odonto-imagens.ts` — helpers de upload/download (URLs assinadas), thumbnail, compressão client-side (canvas, max 2000px, JPEG 0.85).

Edição:

- `src/routes/_authenticated/app.odontologia.tsx` → adicionar sub-aba **"Galeria"** ao Prontuário (junto de Odontograma / Anamnese / Evolução / Notas).
- Vínculo cruzado leve: no Odontograma, dente com imagens exibe ícone de câmera → clique filtra galeria por aquele dente.

## Regras de negócio

- Compressão client-side antes do upload (economia de storage).
- URLs assinadas com TTL de 1h para exibição.
- Exclusão faz soft-delete (coluna `deletado_em`) para preservar histórico; arquivo do storage removido em batch por job futuro.
- Log de auditoria via `audit_log` em upload/exclusão/edição.

## Fora do escopo (fases futuras)

- Anotações desenháveis sobre a imagem (Fase 5+).
- Comparação lado a lado antes/depois.
- IA para detecção automática (cárie, etc.).

## Detalhes técnicos

```text
storage: odonto-imagens/{clinica_id}/{paciente_id}/{uuid}.{ext}
thumbnails: gerados on-the-fly via transformação do Supabase Storage
tabela: public.odonto_imagens (com RLS is_member + GRANT)
```

Confirme a clínica-alvo e se posso incluir a compressão client-side padrão.
