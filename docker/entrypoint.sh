#!/bin/sh
# Início do contêiner: migrações primeiro, servidor depois.
#
# Por que aqui e não num "pre-deployment command" do Coolify: esse comando roda no
# contêiner VELHO, com o código velho; as migrações têm que rodar com o código
# que vai servir. Se a base não responde, migrar.mjs tenta de novo 15 vezes (30 s) antes
# de falhar, e o start-period do HEALTHCHECK cobre essa espera.
#
# SKIP_MIGRATIONS=true pula o passo (por exemplo numa réplica que não deve migrar).
set -e

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "[entrypoint] aplicando migraciones..."
  node scripts/migrar.mjs
else
  echo "[entrypoint] SKIP_MIGRATIONS=true: no se migran la base"
fi

echo "[entrypoint] arrancando: $*"
exec "$@"
