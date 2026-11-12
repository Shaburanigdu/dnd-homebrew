// =====================================================================
//  Локальный сервер для разработки.  Запуск:  node tools/serve.mjs
//  Собирает индексы, раздаёт сайт на http://localhost:8000
//  и пересобирает индексы при изменении файлов в data/.
//  Без зависимостей — нужен только Node.js.
// =====================================================================

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8000;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function buildIndex() {
    return new Promise(resolve => {
        const p = spawn(process.execPath, [join(ROOT, 'tools', 'build-index.mjs')], { stdio: 'inherit' });
        p.on('close', resolve);
    });
}

await buildIndex();

// Пересборка индекса при изменении данных (с небольшой задержкой)
let timer = null;
let building = false;
try {
    watch(join(ROOT, 'data'), { recursive: true }, (_, file) => {
        if (building || !file || file.endsWith('index.json')) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
            building = true;
            console.log(`\nИзменён ${file} — пересобираю индексы...`);
            await buildIndex();
            setTimeout(() => { building = false; }, 300);
        }, 300);
    });
} catch {
    console.log('(Автопересборка недоступна — перезапустите сервер после изменений.)');
}

createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = normalize(join(ROOT, path));
        if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        if (!(await stat(file)).isFile()) throw new Error();
        res.writeHead(200, {
            'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        res.end(await readFile(file));
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — не найдено');
    }
}).listen(PORT, () => {
    console.log(`\nСайт запущен:  http://localhost:${PORT}\nОстановить:    Ctrl+C\n`);
});
