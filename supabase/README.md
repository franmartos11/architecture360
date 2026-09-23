# Setup de Supabase (Sprint 0)

Estos son los únicos pasos manuales que hacen falta para activar la base de datos real. Todo lo demás (esquema, clientes, script de seed) ya está en el repo.

## 1. Crear el proyecto

1. Entrá a https://supabase.com/dashboard y creá un proyecto nuevo (plan gratuito alcanza).
2. Elegí una región cercana (ej. `sa-east-1` si hay, o `us-east-1`).
3. Guardá la contraseña de la base que te pide crear — no hace falta después, pero por las dudas.

## 2. Correr el esquema

1. En el dashboard del proyecto, andá a **SQL Editor**.
2. Abrí `supabase/schema.sql` de este repo, copiá todo el contenido y pegalo ahí.
3. Ejecutar (`Run`). Crea todas las tablas, las políticas de seguridad (RLS) y el bucket de storage para imágenes/panorámicas.

### Actualizar una base que ya existe

El mismo paso sirve para aplicar cambios de esquema sobre una base con datos: `schema.sql` está escrito para poder re-ejecutarse entero (`create table if not exists`, `drop policy if exists` antes de cada `create policy`, `create or replace function`, `create index if not exists`). No borra ni pisa datos: sólo crea lo que falta y redefine políticas y funciones.

Por eso no hay carpeta de migraciones — la fuente de verdad es este archivo. Cuando cambia, se vuelve a pegar entero en el SQL Editor.

Después de correrlo, para comprobar que las políticas de lectura pública quedaron bien (que un proyecto sin publicar no se lea desde afuera y que lo publicado sí):

```bash
node supabase/verificar-rls.mjs
```

Crea un proyecto de prueba sin publicar, lo lee con la anon key —la misma que va en el bundle del navegador— y lo borra al terminar. Los 7 chequeos tienen que dar en verde.

## 3. Completar las variables de entorno

1. Copiá `.env.local.example` a un archivo nuevo `.env.local` (ya está en `.gitignore`, no se sube al repo).
2. En el dashboard: **Project Settings → API**. Completá:
   - `NEXT_PUBLIC_SUPABASE_URL` ← "Project URL"
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← "anon / public" key
   - `SUPABASE_SERVICE_ROLE_KEY` ← "service_role" key (⚠️ es secreta, nunca la compartas ni la pongas en código de cliente)

## 4. Migrar el contenido actual

Con `.env.local` completo:

```bash
pnpm db:seed
```

Esto copia todo lo que hoy está hardcodeado en `data/mockData.ts` (el proyecto demo con Torre A/B/C, unidades, polígonos, tours) más `data/db.json` (leads y configuración de calculadora) a las tablas nuevas. Es seguro correrlo más de una vez mientras seguimos ajustando el esquema.

## 5. Avisame

Cuando tengas los 3 valores en `.env.local`, decime y desde acá:
- Corro el seed y verifico que haya entrado todo bien.
- Cambio el sitio para que lea de Supabase en vez de `mockData.ts`.
- Reemplazo el login del admin (password hardcodeada) por autenticación real de Supabase (te creo un usuario admin con tu email).

Hasta que no esté `.env.local` completo, el sitio sigue funcionando exactamente igual que ahora (con `mockData.ts`) — no se rompe nada mientras tanto.
