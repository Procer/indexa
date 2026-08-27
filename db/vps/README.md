# Migración Supabase → Postgres en el VPS — Runbook

Estado del deploy actual: app Next.js en el VPS Dattatec (Rosario), datos en
Supabase (`sa-east-1` / São Paulo). Objetivo: mover Postgres + pgvector al
mismo VPS y sacar la plataforma Supabase. El login por email se resuelve
aparte (fuera de este runbook).

Cada búsqueda hoy hace 5-6 round-trips VPS↔São Paulo (~25-40 ms c/u).
Con la base en `localhost` pasan a <1 ms. Ese es el objetivo de velocidad.

---

## Fase 0 — Relevar (antes de tocar nada)

### En el VPS
```bash
nproc; free -h; df -h /; cat /etc/os-release | head -2; swapon --show
```
Piso recomendado: **4 GB RAM, 2 vCPU, 25 GB libres**. Si es menos → agrandar
con Dattatec, o agregar swap como parche:
```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### En Supabase (SQL Editor)
```sql
select version();
select extname, extversion from pg_extension;
select table_schema, table_name from information_schema.tables
  where table_schema in ('public') order by 1,2;
select routine_name from information_schema.routines where routine_schema='public';
select
  (select count(*) from products)                             as productos,
  (select count(*) from products where embedding is not null) as con_embedding,
  (select count(*) from searches)                             as searches,
  (select count(*) from cache_kv)                             as cache_filas;
select pg_size_pretty(pg_database_size(current_database()))   as tamano_total;
```
Anotar los resultados: definen el tuning y confirman qué hay que migrar.

### Connection string de Supabase (para el dump)
Dashboard → **Database → Connection string → URI** (la "directa", puerto 5432).
Formato: `postgresql://postgres.[ref]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
Guardala en una variable, NO en un archivo del repo:
```bash
export SUPA_URL='postgresql://postgres.xxxx:...@...pooler.supabase.com:5432/postgres'
```

---

## Fase 1 — Instalar Postgres en el VPS

```bash
cd /root/techsearch            # o donde esté el repo en el VPS
bash db/vps/install-postgres.sh
```
El script: repo PGDG, `postgresql-16` + `pgvector` + `pg_cron`, escucha solo
en localhost, `pg_hba` scram-sha-256, crea el rol `techsearch` y la base
`techsearch`, habilita extensiones.

Después:
```bash
# 1. Password fuerte para el rol de la app
sudo -u postgres psql -c "ALTER ROLE techsearch PASSWORD 'PONER-UNA-FUERTE';"

# 2. Ajustar tuning a la RAM real (ver Fase 0) y reiniciar
nano /etc/postgresql/16/main/conf.d/10-tuning.conf
systemctl restart postgresql

# 3. Verificar
sudo -u postgres psql -d techsearch -c "select extname,extversion from pg_extension;"
#   vector debe ser >= 0.8.0  (trae hnsw.iterative_scan)
```

---

## Fase 2 — Migrar schema + datos

**Estrategia:** schema lo crea nuestro archivo limpio (sin RLS ni `auth`),
los datos vienen del dump `--data-only` de Supabase. Así no arrastra nada de
la plataforma.

```bash
export PGURL='postgres://techsearch:PASSWORD@127.0.0.1:5433/techsearch'

# 1. Crear el schema limpio
psql "$PGURL" -f db/vps/schema.sql

# 2. Dump SOLO de datos de las tablas public de Supabase
pg_dump "$SUPA_URL" \
  --data-only --no-owner --no-privileges \
  --format=custom \
  --schema=public \
  --exclude-table-data='schema_migrations' \
  --file=/tmp/techsearch-data.dump

# 3. Restaurar datos. --disable-triggers evita problemas de orden de FK.
pg_restore "$PGURL" \
  --data-only --disable-triggers --no-owner --single-transaction \
  /tmp/techsearch-data.dump

# 4. Recalcular estadísticas del planner
psql "$PGURL" -c "ANALYZE;"

# 5. Verificar conteos contra Fase 0
psql "$PGURL" -c "select
  (select count(*) from products) as productos,
  (select count(*) from products where embedding is not null) as con_embedding,
  (select count(*) from searches) as searches;"
```

### Si `pg_restore` se queja
- **`column \"search_vector\" ... cannot be inserted`** → es columna generada;
  agregá `--exclude-column`… no existe: en su lugar el dump ya la omite. Si
  igual aparece, re-dumpeá con `--column-inserts` y borrá esas líneas, o
  pedime que ajuste el schema.
- **FK violation** en `product_clicks` / `saved_products` → hay filas
  huérfanas en Supabase (apuntan a productos borrados). Restaurá con
  `--disable-triggers` (ya está) o limpiá esas filas en origen primero.
- **`type \"vector\" does not exist`** → faltó `CREATE EXTENSION vector` en la
  base destino (el schema.sql lo hace; verificá que corriste el paso 1).

### Usuarios / auth
Las columnas `user_id` (searches, saved_products, price_alerts) y `profiles.id`
quedaron como UUID planos. Las alertas/búsquedas anónimas (por `email` +
`manage_token`) siguen funcionando igual. Para el login de `/admin` y la
identificación por email: lo cablea el sistema nuevo, que debe hacer
`INSERT INTO profiles (id, email, role) ...` al autenticar.

---

## Fase 3 — App

### Hecho (capa de datos)
- `lib/db/sql.ts` — pool `postgres` (postgres.js) contra `DATABASE_URL`.
  numeric→number, timestamptz→string ISO (paridad con lo que devolvía PostgREST).
- Migrados a SQL directo: `lib/db/queries.ts`, `lib/search/cache.ts`,
  `lib/search/hybridSearch.ts`, y las rutas: `api/events`,
  `api/products/[id]/click`, `api/products/[id]/other-stores`,
  `api/products/discover`, `api/alerts` (+ `[id]`, `check`, `manage/[token]`),
  `api/searches/sync`, `api/searches/manage/[token]`, `api/cron/analyze`,
  `api/admin/analytics`, `api/admin/sponsors` (+ `[id]`),
  `api/admin/products/search`.
- `npm i postgres` ya está en `package.json`.
- `.env` en el VPS necesita:
  ```
  DATABASE_URL=postgres://techsearch:PASSWORD@127.0.0.1:5433/techsearch
  ```

### Pendiente
- **Auth**: `lib/auth/*`, `hooks/useUser.ts`, `components/AuthModal.tsx`,
  `app/auth/callback`, `app/admin/layout.tsx`,
  `app/api/auth/sync-searches` — ver `docs/AUTH_MIGRATION.md`.
- **Scripts** (`scripts/*.ts`): sync de catálogo, embeddings, debug. Offline,
  no bloquean el sitio. Migrar a `lib/db/sql` cuando se apague Supabase.
- Al terminar: `npm remove @supabase/supabase-js @upstash/ratelimit @upstash/redis`
  y borrar `lib/db/supabase.ts` + `lib/db/supabaseClient.ts`.

### Verificar
```bash
npm run typecheck   # debe pasar limpio
npm run build
```

---

## Fase 5 — Backups (NO opcional)

```bash
# Instalar rclone y configurar un remoto S3-compatible (Backblaze B2 ~centavos)
curl https://rclone.org/install.sh | bash
rclone config          # crear remoto "b2"

# Cron diario 03:00
crontab -e
# 0 3 * * *  REMOTE_DEST="b2:techsearch-backups" PGPASSWORD='...' /root/techsearch/db/vps/backup.sh >> /var/log/techsearch-backup.log 2>&1
```

### Probar un restore (hacelo el día 1, no cuando se rompa algo)
```bash
sudo -u postgres createdb restore_test
pg_restore -d restore_test --no-owner /var/backups/techsearch/techsearch-XXXX.dump
psql -d restore_test -c "select count(*) from products;"
sudo -u postgres dropdb restore_test
```

### systemd auto-restart
```bash
systemctl edit postgresql@16-main
# [Service]
# Restart=on-failure
# RestartSec=5
```

---

## Fase 6 — Cutover

1. Ventana de solo-lectura en la app (o aceptar ~15 min de escrituras perdidas).
2. `pg_dump --data-only` final de Supabase → `pg_restore` incremental de las
   filas nuevas (o `TRUNCATE` + reload completo si el catálogo es chico).
3. En el VPS: poner `DATABASE_URL` en `.env`, buildear y reiniciar la app.
4. Smoke test: una búsqueda completa, crear una alerta, login de `/admin`,
   abrir un link `/search/[token]` viejo.
5. Dejar el proyecto Supabase **en pausa** (plan Free) ~2 semanas como rollback.
6. Borrar de `.env`: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`,
   `UPSTASH_*`. Actualizar `CLAUDE.md`.

---

## Rollback

Mientras no borres el proyecto Supabase: revertí `DATABASE_URL` (o el commit
de Fase 3) y la app vuelve a apuntar a São Paulo. Por eso el cutover no
elimina nada de Supabase hasta pasadas ~2 semanas estables.
