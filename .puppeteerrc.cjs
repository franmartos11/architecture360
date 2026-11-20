// En CI y en Vercel no hace falta bajar Chrome (no corre el puente de WhatsApp).
// En el servidor del bot sí se baja durante `pnpm install`.
module.exports = { skipDownload: !!(process.env.CI || process.env.VERCEL) };
