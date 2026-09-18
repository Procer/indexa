---
name: deploy
description: Workflow para publicar cambios de TechSearch AR (indexa) en dos pasos, en orden fijo — primero GitHub (origin, repo Procer/indexa), después el VPS de producción (anka.ar/indexa) por SSH. Usar esta skill cada vez que el usuario pida deployar, shipear, subir cambios, actualizar el VPS, llevar algo a producción o "que se vea en el sitio" — incluso en forma informal ("dale, subilo", "mandalo a prod", "actualizá el servidor", "esto ya lo puedo probar en el sitio?"). Un pedido de deploy implica los dos pasos, no solo un `git push`.
---

# Deploy de TechSearch AR (GitHub → VPS)

Este proyecto tiene dos destinos independientes que no se sincronizan solos:
GitHub (`origin` → `https://github.com/Procer/indexa.git`) y el VPS de
producción (`anka.ar/indexa`, deploy por SSH con tarball — el VPS no tiene
`.git`). Actualizar uno no actualiza el otro. El orden importa: **GitHub
primero, VPS después** — así el historial en GitHub siempre refleja lo que
corre (o va a correr) en producción, nunca al revés.

No asumas que "ya está subido" solo porque el commit existe localmente —
confirmá los dos pasos en cada corrida.

## Paso 0 — antes de arrancar

Correr `git status` y `git log --oneline -5` para ver qué hay pendiente. Si
hay cambios sin commitear que el usuario quiere shipear, commitealos como
parte de este flujo, mostrando el mensaje de commit propuesto antes de
crearlo si el diff no es trivial.

## Paso 1 — GitHub

Detectar el branch actual con `git branch --show-current` (no asumir
`master`/`main`). El push a GitHub lo tiene que ejecutar el usuario desde su
propia sesión, no este flujo:

1. Dejar todo listo (commits creados, working tree limpio).
2. Pedirle al usuario que corra `git push origin <branch>` él mismo.
3. Esperar su confirmación de que el push salió bien antes de pasar al paso
   2 — no seguir al VPS sin esa confirmación.

## Paso 2 — VPS

Con GitHub confirmado, correr:

```bash
bash .claude/skills/deploy/scripts/deploy-vps.sh
```

El script (ver el archivo para el detalle completo):
- Empaqueta el árbol de trabajo actual (excluyendo `node_modules`, `.next`,
  `.git`, `.env.local`, `.gstack`) en un tarball.
- Lo copia por `scp` al VPS (`root@anka.ar`, key `~/.ssh/id_ed25519_anka` —
  sin entrada en `~/.ssh/config`, por eso hace falta `-i` explícito).
- En el VPS: descomprime sobre `/var/www/indexa`, corre `npm install && npm
  run build` y reinicia el proceso PM2 `indexa` con `--update-env`.
- Verifica: `pm2 list` (esperar `online` + el contador de restarts subido),
  `curl -L https://anka.ar/indexa/` (esperar `200`) y el tail del log de
  error de PM2.

Es el mismo proceso manual que se venía haciendo en sesiones previas (tarball
→ scp → install/build → pm2 restart) — el script solo lo empaqueta para no
repetir los comandos cada vez ni saltearse un paso por apuro.

**Esto reinicia la app que están usando usuarios reales ahora mismo.** Si el
build tarda o pm2 no vuelve a `online`, no reintentar a ciegas — mostrarle al
usuario la salida y preguntar cómo seguir antes de una segunda corrida.

## Al terminar

Confirmarle al usuario, en una o dos líneas: qué se pusheó a GitHub (commits/
branch) y el resultado de la verificación del VPS (pm2 online, curl 200,
estado del log). Si algo de la verificación no dio bien, decirlo explícito en
vez de asumir que salió bien.
