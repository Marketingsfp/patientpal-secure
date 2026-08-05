#!/usr/bin/env bash
# Restaura um backup diário (CSVs baixados da tela /app/backups) num
# Postgres local. Recria apenas os DADOS — o schema deve existir antes
# (rodar as migrations do projeto no banco local uma única vez).
#
# Uso:
#   bash scripts/restore-local.sh /caminho/para/pasta-dos-csvs "postgres://user:pass@localhost:5432/mirror"
#
# Requisitos:
#   - psql instalado
#   - a pasta contém arquivos <tabela>.part-N.csv
#
# O script:
#   1. TRUNCATE em cada tabela detectada
#   2. \copy de cada part-N.csv em ordem
#   3. Ignora tabelas cujo nome não bater com o schema local

set -euo pipefail

PASTA="${1:-}"
CONN="${2:-}"

if [ -z "$PASTA" ] || [ -z "$CONN" ]; then
  echo "Uso: bash scripts/restore-local.sh <pasta-dos-csvs> <connection-string>"
  exit 1
fi
if [ ! -d "$PASTA" ]; then
  echo "Pasta não encontrada: $PASTA"; exit 1
fi

echo "Alvo: $CONN"
echo "Pasta: $PASTA"

# Extrai nomes únicos de tabela dos arquivos <tabela>.part-N.csv
TABELAS=$(ls "$PASTA" | sed -n 's/\.part-[0-9]*\.csv$//p' | sort -u)

if [ -z "$TABELAS" ]; then
  echo "Nenhum arquivo .part-N.csv encontrado."; exit 1
fi

echo "Tabelas detectadas:"
echo "$TABELAS" | sed 's/^/  - /'

for T in $TABELAS; do
  echo
  echo "==> $T"
  # Verifica se a tabela existe
  EXISTE=$(psql "$CONN" -tAc "SELECT to_regclass('public.$T') IS NOT NULL")
  if [ "$EXISTE" != "t" ]; then
    echo "   (tabela não existe no banco local — pulando)"
    continue
  fi

  echo "   TRUNCATE"
  psql "$CONN" -c "TRUNCATE public.\"$T\" CASCADE" >/dev/null

  for F in "$PASTA/$T".part-*.csv; do
    [ -f "$F" ] || continue
    if [ ! -s "$F" ]; then
      echo "   $(basename "$F") — vazio, pulando"
      continue
    fi
    echo "   \\copy $(basename "$F")"
    psql "$CONN" -c "\\copy public.\"$T\" FROM '$F' WITH (FORMAT csv, HEADER true, NULL '')"
  done
done

echo
echo "Restauração concluída."