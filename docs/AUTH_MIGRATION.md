# Reemplazo de Supabase Auth — puntos de contacto

La migración de datos a Postgres/VPS (ver `db/vps/README.md`) dejó la capa de
auth intacta: sigue usando Supabase Auth (GoTrue). Esto lista qué archivos hay
que rehacer cuando se defina el método nuevo de login ("ingreso por email, se
resuelve de otra manera").

La base ya tiene la tabla `profiles (id uuid pk, email text, role text)` sin FK
a `auth.users` ni RLS — es la tabla de usuarios local. El login nuevo debe
hacer `INSERT ... ON CONFLICT (id)` ahí al autenticar.

## Archivos que todavía importan `@supabase/*`

| Archivo | Qué hace hoy con Supabase | Reemplazo |
|---|---|---|
| `lib/db/supabase.ts` | cliente server (service role) | borrar en el cutover |
| `lib/db/supabaseClient.ts` | cliente browser (anon, PKCE) | borrar / reemplazar por el SDK del login nuevo |
| `lib/auth/adminAuth.ts` | `supabase.auth.getUser(token)` + lee `profiles.role` | validar la sesión nueva (cookie/JWT propio) y leer `profiles.role` vía `lib/db/sql` |
| `lib/auth/adminClient.ts` | helper browser para el token de admin | adaptar al login nuevo |
| `hooks/useUser.ts` | sesión de usuario en el cliente | hook equivalente contra el login nuevo |
| `components/AuthModal.tsx` | magic link + Google OAuth UI | UI del login nuevo |
| `app/auth/callback/page.tsx` | `exchangeCodeForSession` | callback del login nuevo |
| `app/admin/layout.tsx` | gate de sesión en el cliente | gate contra el login nuevo |
| `app/api/auth/sync-searches/route.ts` | `supabase.auth.getUser` + `UPDATE searches SET user_id` | validar sesión nueva; el `UPDATE` ya está listo para pasar a `lib/db/sql` |

## Sugerencia mínima (sin plataforma externa)

- **Identificación por email** (alertas / búsquedas guardadas): ya funciona
  anónima por `email` + `manage_token` (no necesita login).
- **Login de `/admin`**: magic link con Resend (`RESEND_API_KEY` ya está) +
  cookie de sesión firmada (`iron-session` o `jose`). Admin = allowlist de
  emails en env, o `profiles.role = 'admin'`.

## Scripts offline (no bloquean la app)

`scripts/*.ts` corren aparte (`tsx --env-file=.env.local`) para sync de
catálogo, embeddings y debug. Todavía usan `@supabase/supabase-js`. Migrarlos
a `lib/db/sql` cuando se apague Supabase — no afectan el runtime del sitio.
