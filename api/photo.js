// Vercel Serverless Function: Proxy de fotos de Google Drive para CARVLAK
// Resuelve el bloqueo de cookies de terceros y el signo de interrogacion [?] en iPhone Safari

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <circle cx="200" cy="115" r="46" fill="#334155" />
  <path d="M182 102 h10 l5 -6 h26 l5 6 h10 a6 6 0 0 1 6 6 v32 a6 6 0 0 1 -6 6 h-56 a6 6 0 0 1 -6 -6 v-32 a6 6 0 0 1 6 -6 z" fill="#38bdf8" />
  <circle cx="200" cy="122" r="11" fill="#0f172a" />
  <circle cx="200" cy="122" r="6" fill="#38bdf8" />
  <text x="200" y="190" fill="#f8fafc" font-size="15" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="middle">Foto en Google Drive</text>
  <rect x="125" y="210" width="150" height="32" rx="16" fill="#059669" />
  <text x="200" y="231" fill="#ffffff" font-size="12" font-family="system-ui, -apple-system, sans-serif" font-weight="600" text-anchor="middle">Ver en Drive ↗</text>
</svg>`;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id, sz = 'w800' } = req.query || {};

  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).send('ID de foto no valido');
  }

  const candidateUrls = [
    `https://lh3.googleusercontent.com/d/${id}=${sz}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=${sz}`,
    `https://drive.google.com/uc?export=view&id=${id}`
  ];

  for (const targetUrl of candidateUrls) {
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*'
        },
        redirect: 'follow'
      });

      const contentType = response.headers.get('content-type') || '';

      if (response.ok && contentType.startsWith('image/')) {
        const buffer = await response.arrayBuffer();
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
        return res.status(200).send(Buffer.from(buffer));
      }
    } catch (err) {
      // Probar la siguiente URL candidata
    }
  }

  // Si Google requiere autenticacion por permisos restringidos,
  // devolvemos un SVG estilizado para que NUNCA quede el signo de interrogacion [?]
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).send(FALLBACK_SVG);
}

module.exports = handler;
module.exports.default = handler;