// =====================================================================
//  Сборщик индексов.  Запуск:  node tools/build-index.mjs
//
//  Для каждого раздела из data/sections.json читает все файлы
//  data/<раздел>/*.json (кроме index.json и файлов, начинающихся с "_"),
//  проверяет их и пишет data/<раздел>/index.json — короткий список
//  для карточек каталога и поиска.
//
//  Запускается автоматически: в start.bat и в GitHub Actions при каждом push.
// =====================================================================

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const BASE_FIELDS = ['id', 'name_ru', 'name_en', 'source', 'image', 'description', 'components'];

function summaryFields(sec) {
    const fields = new Set(BASE_FIELDS);
    if (sec.tags) fields.add(sec.tags);
    if (sec.subtitle) fields.add(sec.subtitle);
    if (sec.badge) fields.add(sec.badge.field);
    if (sec.accent) fields.add(sec.accent.field);
    (sec.filters || []).forEach(f => fields.add(f.field));
    (sec.cardFields || []).forEach(f => fields.add(f));
    return [...fields];
}

async function buildSection(sec) {
    const dir = join(DATA, sec.id);
    await mkdir(dir, { recursive: true });

    const files = (await readdir(dir))
        .filter(f => f.endsWith('.json') && f !== 'index.json' && !f.startsWith('_'));

    const fields = summaryFields(sec);
    const entries = [];
    const errors = [];

    for (const file of files) {
        const expectedId = file.replace(/\.json$/, '');
        let data;
        try {
            data = JSON.parse((await readFile(join(dir, file), 'utf8')).replace(/^﻿/, ''));
        } catch (e) {
            errors.push(`${sec.id}/${file}: ошибка в JSON — ${e.message}`);
            continue;
        }
        if (!data.id) data.id = expectedId;
        if (data.id !== expectedId) {
            errors.push(`${sec.id}/${file}: id "${data.id}" не совпадает с именем файла (ожидался "${expectedId}")`);
            continue;
        }
        if (!data.name_ru) errors.push(`${sec.id}/${file}: нет поля name_ru (предупреждение)`);

        const summary = {};
        for (const f of fields) if (data[f] !== undefined) summary[f] = data[f];
        entries.push(summary);
    }

    entries.sort((a, b) => String(a.name_ru || a.id).localeCompare(String(b.name_ru || b.id), 'ru'));
    await writeFile(join(dir, 'index.json'), JSON.stringify(entries, null, 2) + '\n', 'utf8');
    return { count: entries.length, errors };
}

const config = JSON.parse((await readFile(join(DATA, 'sections.json'), 'utf8')).replace(/^﻿/, ''));
let hasErrors = false;

for (const sec of config.sections) {
    const { count, errors } = await buildSection(sec);
    console.log(`  ${sec.title.padEnd(24)} ${count}`);
    for (const e of errors) {
        console.warn(`  ! ${e}`);
        if (!e.includes('предупреждение')) hasErrors = true;
    }
}

if (hasErrors) {
    console.error('\nЕсть ошибки — исправьте файлы выше.');
    process.exitCode = 1;
} else {
    console.log('\nИндексы собраны.');
}
