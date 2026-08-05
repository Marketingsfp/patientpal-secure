# Backup local — restaurando os dados num Postgres da sua máquina

O sistema gera automaticamente, todos os dias às 03:00, um dump em CSV de
todas as tabelas do schema `public` (dados da sua clínica). Os arquivos
ficam num bucket privado do backend e podem ser baixados via
**Menu › Backups Diários** por qualquer administrador.

Este documento explica como usar esses arquivos para manter uma cópia
viva num Postgres rodando na sua máquina.

## 1. Instalar o Postgres localmente

- **macOS**: `brew install postgresql@16 && brew services start postgresql@16`
- **Linux (Ubuntu/Debian)**: `sudo apt install postgresql-16`
- **Windows**: instalador oficial em <https://www.postgresql.org/download/windows/>

Confirme que o `psql` está no PATH:

```bash
psql --version
```

## 2. Criar o banco "mirror"

```bash
createdb mirror
```

Ou dentro do `psql`:

```sql
CREATE DATABASE mirror;
```

## 3. Criar o schema (uma única vez)

O restore só recria os **dados**, não a estrutura das tabelas. Você
precisa aplicar as migrations do projeto uma vez para criar as tabelas
localmente. A forma mais simples é copiar o schema atual do Cloud:

```bash
# Peça a um responsável para exportar o schema.sql em
# Cloud → Advanced settings → Export data (só schema)
# e depois:
psql "postgres://postgres@localhost:5432/mirror" -f schema.sql
```

Depois disso, as próximas restaurações só precisam da etapa 4.

## 4. Baixar o backup do dia

1. Entre no sistema como administrador da clínica.
2. Acesse **Menu › Backups Diários** (`/app/backups`).
3. Escolha o dia desejado e clique em **Baixar** — o navegador baixará
   todos os arquivos `<tabela>.part-N.csv` para a pasta de downloads.
4. Mova-os para uma pasta única, por exemplo `~/backups/2026-07-08/`.

## 5. Rodar o restore

```bash
bash scripts/restore-local.sh ~/backups/2026-07-08 \
  "postgres://postgres@localhost:5432/mirror"
```

O script:

1. Detecta cada tabela pelo nome dos arquivos.
2. Faz `TRUNCATE` daquela tabela local (dados antigos removidos).
3. Carrega os CSVs em ordem via `\copy`.

Ao terminar, o banco `mirror` está com a mesma foto de dados do Cloud
naquele dia.

## 6. Automatizar (opcional)

No macOS/Linux, um `cron` local resolve:

```cron
# todo dia 05:00, baixa o backup mais recente e restaura
0 5 * * *  cd $HOME/backups && bash /caminho/do/projeto/scripts/restore-local.sh $(date -d "yesterday" +\%Y-\%m-\%d) "postgres://postgres@localhost:5432/mirror"
```

Para automatizar o **download**, use a URL assinada retornada por
`baixarBackupDoDia` — é possível scriptar via `curl` chamando a mesma
função com um token JWT válido (peça ajuda ao suporte se precisar).

## Observações importantes

- **Retenção**: o Cloud guarda 30 dias. Se quiser manter arquivos por
  mais tempo, copie-os para um HD externo ou serviço próprio.
- **Volume**: 242k pacientes + histórico geram alguns MB por dia. Reserve
  espaço para pelo menos 12 meses (~1–3 GB acumulados).
- **Não é replicação em tempo real**: o espelho fica com dados de até 24h
  atrás. Serve como **cópia de segurança** e **consulta offline**, não
  para operar o sistema.
- **Confidencialidade**: o backup contém dados sensíveis de pacientes.
  Guarde num disco criptografado (FileVault, BitLocker, LUKS).