## Estratégia

Cloud não consegue **conectar direto** num Postgres da sua máquina (rede residencial, sem IP fixo, sem porta aberta). A abordagem robusta e sem exposição de rede é:

1. **Cloud gera um dump diário** de todas as tabelas do schema `public` e guarda num bucket privado do próprio backend.
2. **Você baixa e restaura localmente** com um script (`restore-local.sh`) que usa `psql \copy`. Assim seu Postgres local fica sempre com a foto do dia anterior — redundância real, offline, sob seu controle.

Se depois você quiser abrir a máquina via Cloudflare Tunnel para eu enviar direto, dá para trocar só a última etapa; a infra de dump fica pronta.

## Componentes

### 1. Bucket privado `backups-diarios`
- Acesso somente para role `admin` da clínica.
- Estrutura: `backups-diarios/{clinica_id}/{YYYY-MM-DD}/{tabela}.csv`.
- Retenção: mantém 30 dias, remove os mais antigos numa limpeza no fim do job.

### 2. Endpoint `POST /api/public/hooks/backup-diario`
- Rota TanStack em `src/routes/api/public/hooks/backup-diario.ts`.
- Autenticada via header `apikey` = publishable key.
- Lê `information_schema.tables` (schema `public`, tipo `BASE TABLE`) para descobrir todas as tabelas dinamicamente — assim novas tabelas entram automaticamente no backup.
- Para cada tabela: `SELECT *` paginado (10k linhas por página) → CSV com escape RFC 4180 → upload no bucket. Tabelas grandes (pacientes, agendamentos, fin_lancamentos, whatsapp_mensagens) ficam em vários arquivos `pacientes.part-1.csv`, `pacientes.part-2.csv`.
- Gera também `manifest.json` com lista de tabelas, contagem de linhas e checksum de cada arquivo — usado no restore para validar integridade.

### 3. Cron diário 03:00 (pg_cron)
- Extensões `pg_cron` + `pg_net` (habilitar se ainda não estiverem).
- Job `backup-diario` roda `net.http_post` para o endpoint acima com body `{}`.

### 4. UI para admin baixar
- Nova rota `src/routes/_authenticated/app.backups.tsx`.
- Lista os dias disponíveis no bucket, com contagem de tabelas e tamanho total.
- Botão "Baixar backup do dia" que gera um `.zip` do dia (via server function que empacota os CSVs em um único download).
- Visível apenas para `admin`.

### 5. Script de restore local (`scripts/restore-local.sh`)
- Recebe o `.zip` baixado e uma connection string (`postgres://user:pass@localhost:5432/mirror`).
- Cria o schema local se não existir, faz `TRUNCATE` + `\copy` de cada CSV.
- Documentação passo-a-passo em `docs/backup-local.md`: instalar Postgres local, criar banco `mirror`, rodar `bash scripts/restore-local.sh backup-2026-07-08.zip postgres://...`.
- **Nota**: o script recria apenas os **dados**, não o schema. O schema local você gera uma vez importando o SQL de estrutura, também disponibilizado no primeiro backup (`schema.sql` gerado a partir de `information_schema`).

## Ordem de execução

1. Migration: enable `pg_cron`, `pg_net`, criar bucket `backups-diarios` com policies (só admin lê, service_role escreve).
2. Criar endpoint `/api/public/hooks/backup-diario` e helper de dump/upload.
3. Criar página `/app/backups` e server function `listarBackups`, `baixarBackupDoDia`.
4. Agendar cron 03:00 via `supabase--insert` (contém URL do endpoint + anon key).
5. Adicionar `scripts/restore-local.sh` e `docs/backup-local.md`.
6. Rodar o endpoint manualmente para gerar o primeiro backup e validar.

## Fora de escopo

- Sincronização em tempo real / replicação lógica (não é possível no Cloud gerenciado).
- Espelho consumível para queries via API — o objetivo aqui é redundância/segurança, não escala de leitura.
- Backup de `auth`, `storage` e demais schemas gerenciados — só `public`.

## Limitações a alinhar

- Volume: 242k pacientes + histórico gera dezenas de MB por dia. Bucket privado suporta, mas se o backup exceder ~500 MB precisamos revisar (ex.: comprimir com gzip antes do upload — posso já entregar assim).
- O endpoint roda no runtime serverless com limite de tempo por invocação. Se a exportação ultrapassar, o job continua em invocações subsequentes usando um cursor por tabela (persistido em `backup_progresso`). Já entrego resiliente a esse cenário.
