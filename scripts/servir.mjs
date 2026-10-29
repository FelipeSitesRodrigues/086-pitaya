/* Servidor estático da pasta site/ para revisão local.
   node scripts/servir.mjs          -> http://localhost:8086
   Serve /barra-de-ancoragem/ e as outras LPs resolvendo index.html da subpasta. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const RAIZ = resolve(process.cwd(), 'dist');
const PORTA = Number(process.env.PORTA || 8086);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let arquivo = join(RAIZ, caminho);

    if (!arquivo.startsWith(RAIZ)) {
      res.writeHead(403).end('403');
      return;
    }

    try {
      if ((await stat(arquivo)).isDirectory()) arquivo = join(arquivo, 'index.html');
    } catch {
      if (!extname(arquivo)) arquivo = join(RAIZ, caminho, 'index.html');
    }

    let dados = await readFile(arquivo);
    const tipo = TIPOS[extname(arquivo).toLowerCase()] || 'application/octet-stream';
    const cab = { 'Content-Type': tipo, 'Cache-Control': 'no-store' };
    // gzip no texto, como a Vercel faz, pra o Lighthouse local medir parecido com produção
    if (/text|javascript|svg|json|xml/.test(tipo) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      dados = gzipSync(dados, { level: 9 });
      cab['Content-Encoding'] = 'gzip';
    }
    res.writeHead(200, cab);
    res.end(dados);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(PORTA, () => console.log(`servindo dist/ em http://localhost:${PORTA}`));
