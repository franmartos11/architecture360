# Puente de WhatsApp (bot IA por proyecto) en servidor propio

El puente (`pnpm bot`, `scripts/whatsapp-bot.ts`) corre 24/7 en una máquina nuestra, mantiene las sesiones de WhatsApp Web de los proyectos habilitados y contesta con Claude. No corre en Vercel ni en la notebook de desarrollo.

## Elegir la máquina

- **Mini PC en una oficina/casa (recomendado):** IP residencial, es lo que menos riesgo de bloqueo del número tiene.
- **VPS:** más cómodo (siempre prendido, sin cortes de luz/internet), pero IP de datacenter: más riesgo de que WhatsApp bloquee el número.

Debian/Ubuntu, 2 GB de RAM como mínimo (Chromium por cada proyecto activo).

## Antes de la primera corrida

1. Aplicar `supabase/schema.sql` en la base (SQL Editor de Supabase). Sin eso las tablas del bot no existen.
2. Tener a mano las variables de abajo.

## Instalación

Copiá `ops/bot/instalar-bot-linux.sh` al servidor y corrélo:

```bash
scp ops/bot/instalar-bot-linux.sh usuario@servidor:/tmp/
ssh usuario@servidor 'sudo bash /tmp/instalar-bot-linux.sh'
```

Crea el usuario `p360`, instala Node 22, pnpm 11 y las librerías de Chromium, y genera una deploy key. Si no puede clonar, muestra la clave pública: pegala en GitHub (`franmartos11/architecture360` → Settings → Deploy keys, solo lectura) y volvé a correr el script (es idempotente). Después clona `main` en `/home/p360/architecture360`, hace `pnpm install --frozen-lockfile` (puppeteer baja su propio Chrome acá, es lo esperado), crea `.env.bot` desde `.env.bot.example` e instala y habilita el servicio `p360-whatsapp-bot`. No lo arranca: primero completá `.env.bot`.

```bash
sudo -u p360 nano /home/p360/architecture360/.env.bot
sudo systemctl start p360-whatsapp-bot
```

## Variables (`.env.bot`)

| Variable | Qué es |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase 360. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (el puente se saltea RLS). Secreta. |
| `ANTHROPIC_API_KEY` | Clave de Claude. |
| `BOT_HOST` | Nombre de este servidor. Obligatorio, sin default. El puente solo toma bots con `wa_bots.host_permitido` igual a este valor. |
| `ADMIN_BASE_URL` | URL pública del admin, para el link "Ver chat" del aviso al vendedor. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Opcionales: email de "nuevo lead" al dueño y al equipo comercial del proyecto (gestores y administradores). |

## Habilitar un proyecto

Un proyecto solo lo toma este servidor si su bot tiene `host_permitido = BOT_HOST`. En el SQL Editor de Supabase:

```sql
update wa_bots set host_permitido = '<BOT_HOST>' where project_id = '…';
```

Después se vincula el número escaneando el QR desde el admin del proyecto.

## Logs

```bash
journalctl -u p360-whatsapp-bot -f
systemctl status p360-whatsapp-bot
```

## Actualizar

```bash
sudo bash /home/p360/architecture360/ops/bot/actualizar-bot.sh
```

Hace `git pull --ff-only`, `pnpm install --frozen-lockfile` y `systemctl restart p360-whatsapp-bot`. Reconecta sin QR.

## Los logins no se mueven de máquina

Las sesiones de WhatsApp viven en `.wwebjs_auth/` dentro de `/home/p360/architecture360`, en ese servidor. No se copian entre máquinas: mover un proyecto a otra máquina = volver a escanear el QR. Hacé backup de esa carpeta solo si querés recuperar el mismo servidor.

## Cuidado: nunca `pnpm bot` en una notebook con el `BOT_HOST` de producción

Si en una notebook de desarrollo ponés en `.env.bot` el mismo `BOT_HOST` que el servidor, vas a tener dos puentes peleando por la misma sesión de WhatsApp (y riesgo de bloqueo). En desarrollo usá un `BOT_HOST` distinto (ej. `dev-notebook`) y un proyecto de prueba.

## Prueba de punta a punta

Con un proyecto y un chip de prueba, observando cada ítem:

1. Vincular por QR → "Conectado" en el admin.
2. Desde otro teléfono: "hola, qué tienen de 2 ambientes?" → respuesta con unidades reales y precios correctos.
3. Tres mensajes seguidos → una sola respuesta.
4. "mandame el plano del 4B" → llega la imagen.
5. "¿sos un robot?" → dice que es un asistente virtual.
6. "quiero visitarlo el sábado, soy Juan" → aviso al WhatsApp del vendedor con el formato de la spec + lead en el tablero; un segundo mensaje de interés → sin segundo aviso.
7. Responder desde Leads → llega al cliente desde el número del proyecto; el bot no contesta lo siguiente; "Devolver al bot" → vuelve a contestar.
8. Escribir desde el celular del número del bot → el chat pasa a 👤.
9. Mensaje desde el número del vendedor → el bot no responde.
10. `systemctl restart p360-whatsapp-bot` → reconecta sin QR.
11. El botón de WhatsApp del sitio público abre el número del proyecto.
