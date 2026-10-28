import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Credenciales desde el entorno (nunca en el código):
//   node --env-file=.env.local scripts/test-upload-limits.mjs
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY (usá --env-file=.env.local).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'admin@admin.com'
  });
  if (linkErr) throw linkErr;

  const cookieJar = new Map();
  const ssrClient = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => cookiesToSet.forEach(c => cookieJar.set(c.name, c.value))
    }
  });

  const { data: sessionData, error: sessionErr } = await ssrClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink'
  });
  if (sessionErr) throw sessionErr;

  const cookieHeader = Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  console.log('Got cookie header:', cookieHeader.slice(0, 100) + '...');

  // Test sizes
  const sizes = [
    { name: '1MB', bytes: 1 * 1024 * 1024 },
    { name: '4MB', bytes: 4 * 1024 * 1024 },
    { name: '8MB', bytes: 8 * 1024 * 1024 },
    { name: '11MB', bytes: 11 * 1024 * 1024 },
    { name: '15MB', bytes: 15 * 1024 * 1024 },
    { name: '20MB', bytes: 20 * 1024 * 1024 },
  ];

  for (const s of sizes) {
    console.log(`\nTesting upload of ${s.name} (${s.bytes} bytes)...`);
    const buffer = Buffer.alloc(s.bytes, 65);
    const blob = new Blob([buffer], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', blob, `test-${s.name}.png`);
    formData.append('folder', 'test');

    const res = await fetch('http://localhost:3099/api/admin/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
      },
      body: formData
    });

    const text = await res.text();
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Response: ${text.slice(0, 300)}`);
  }
}

main().catch(console.error);
