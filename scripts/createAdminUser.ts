/**
 * Crea (o promueve) un usuario del panel /admin en la Postgres del VPS.
 * Sistema de login propio — ver lib/auth/adminSession.ts y db/vps/admin_auth.sql.
 *
 *   # alta con link de invitación (el usuario define su clave por el link):
 *   npx tsx --env-file=.env.local scripts/createAdminUser.ts \
 *     --email derosasjm@gmail.com --role super_admin --invite
 *
 *   # alta con clave ya puesta (queda activo, sin link):
 *   npx tsx --env-file=.env.local scripts/createAdminUser.ts \
 *     --email alguien@x.com --role admin --password 'unaClaveLarga'
 *
 *   # si el email ya existe, subirlo a super_admin:
 *   npx tsx --env-file=.env.local scripts/createAdminUser.ts \
 *     --email derosasjm@gmail.com --promote
 */

import { sql } from "@/lib/db/sql";
import { hashPassword, createInvite } from "@/lib/auth/adminSession";
import { BASE_PATH } from "@/lib/basePath";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const ORIGIN = arg("origin") ?? "https://anka.ar";

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  if (!email) throw new Error("Falta --email");

  const role = arg("role") === "super_admin" ? "super_admin" : "admin";
  const password = arg("password");
  const promote = has("promote");
  const wantInvite = has("invite") || (!password && !promote);

  const existing = await sql<{ id: string; role: string }[]>`
    SELECT id, role FROM admin_users WHERE lower(email) = ${email} LIMIT 1
  `;

  let userId: string;

  if (existing[0]) {
    userId = existing[0].id;
    if (promote || arg("role")) {
      await sql`UPDATE admin_users SET role = ${role}, active = TRUE WHERE id = ${userId}`;
      console.log(`✓ ${email} → role=${role}, active=true`);
    } else {
      console.log(`El usuario ${email} ya existe (role=${existing[0].role}). Usá --promote o --role para cambiarlo.`);
    }
  } else {
    const [created] = await sql<{ id: string }[]>`
      INSERT INTO admin_users (email, role, password_hash, active)
      VALUES (${email}, ${role}, ${password ? hashPassword(password) : null}, ${!!password})
      RETURNING id
    `;
    userId = created.id;
    console.log(`✓ Usuario creado: ${email} (role=${role}, active=${!!password})`);
  }

  if (password) {
    await sql`UPDATE admin_users SET password_hash = ${hashPassword(password)}, active = TRUE WHERE id = ${userId}`;
    console.log("✓ Contraseña seteada. Ya podés entrar en /admin.");
  }

  if (wantInvite && !password) {
    const invite = await createInvite(userId, "set_password");
    console.log("\nLink de invitación (vence en 48 h, un solo uso):");
    console.log(`  ${ORIGIN}${BASE_PATH}${invite.path}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
