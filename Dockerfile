# syntax=docker/dockerfile:1
# ============================================================================
# Builder CRM - imagem de produção (Coolify / docker compose)
# ============================================================================
# Três etapas: deps (npm ci) -> builder (next build, standalone) -> runner (mínima,
# usuário sem privilégios, migrações ao iniciar, healthcheck sobre /api/health).
#
# Nenhuma variável faz falta para construir: desde 1.2.2 a configuração pública se
# serve em execução (src/lib/config-publica.ts). As NEXT_PUBLIC_* continuam aceitas
# como build args para plataformas que as gravam na imagem (Vercel); o resto do ambiente
# (DATABASE_URL, OPENROUTER_API_KEY, ZERNIO_*, ...) é de runtime e NÃO vai aqui.
#
# Os dois `--mount=type=cache` não são enfeite. Cada versão nova muda package.json (o
# número de versão), isso invalida a camada do `npm ci` e sem cache voltam a baixar e
# descompactar 817 pacotes em cada implantação: 4,5 minutos medidos no VPS da demo.
# Com o cache do npm pula-se a rede e a descompactação. O do Next ajuda pouco com
# Turbopack (deixa um cache pequeno em disco) e muito se algum dia voltar ao webpack:
# deixa-se porque não custa nada. São caches do construtor: não entram na imagem final e,
# se o servidor os limpa, o build continua funcionando, só demora como antes.
# ============================================================================

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG SOURCE_COMMIT
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV SOURCE_COMMIT=$SOURCE_COMMIT \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S app && adduser -S app -G app

# Servidor standalone (server.js + node_modules rastreados) + estáticos + públicos.
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# Migrações do núcleo e dos módulos, e o runner. `postgres` já está no
# node_modules rastreado porque o app o usa.
COPY --from=builder --chown=app:app /app/supabase/migrations ./supabase/migrations
COPY --from=builder --chown=app:app /app/scripts/migrar.mjs ./scripts/migrar.mjs
COPY --from=builder --chown=app:app /app/config ./config
COPY --from=builder --chown=app:app /app/modules ./modules
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
