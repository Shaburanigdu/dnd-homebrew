// =====================================================================
//  help.js — страница «Прислать свою запись»:
//  шаблоны, проверка JSON с понятными ошибками, предпросмотр, скачивание.
// =====================================================================

const editor = document.getElementById('editor');
const result = document.getElementById('check-result');
const downloadBtn = document.getElementById('download-btn');
const previewSection = document.getElementById('preview-section');
const preview = document.getElementById('preview');

const DRAFT_KEY = 'help-draft';
let currentSection = null;
let validEntry = null;

const draft = {
    load() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; } },
    save(v) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch { /* ignore */ } }
};

// Номер строки и столбца по позиции символа
function lineCol(text, pos) {
    const before = text.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    return { line, col };
}

// Перевод частых ошибок JSON на человеческий
function explain(message) {
    const m = message.toLowerCase();
    if (m.includes("expected ',' or '}'") || m.includes("expected ',' or ']'")) {
        return 'Похоже, <b>пропущена запятая</b> в конце предыдущей строки — или внутри текста стоит обычная кавычка <code>"</code> (замени на «ёлочки»).';
    }
    if (m.includes('double-quoted property name') || m.includes('property name')) {
        return 'Похоже, <b>лишняя запятая</b> перед <code>}</code> или <code>]</code>, или у названия поля пропали кавычки.';
    }
    if (m.includes('bad control character') || m.includes('control character')) {
        return 'Внутри текста <b>нажат Enter</b>. Текст в кавычках должен быть в одну строку — новый абзац делается новой строкой в кавычках через запятую.';
    }
    if (m.includes('unexpected end')) {
        return 'Файл <b>обрывается</b>: не хватает закрывающей скобки <code>}</code> или <code>]</code>, или кавычки.';
    }
    if (m.includes('unterminated string')) {
        return 'Где-то <b>не закрыта кавычка</b>.';
    }
    return 'Проверь кавычки, запятые и скобки рядом с этим местом.';
}

function slugify(s) {
    return String(s || '').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function showResult(kind, html) {
    result.innerHTML = `<div class="check-${kind}">${html}</div>`;
}

function invalidate() {
    validEntry = null;
    downloadBtn.disabled = true;
}

async function check() {
    invalidate();
    const text = editor.value;
    if (!text.trim()) {
        showResult('error', '<i class="fas fa-times-circle"></i> Поле пустое — сначала выбери шаблон в шаге 1.');
        return;
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        const posMatch = err.message.match(/position (\d+)/);
        let where = '';
        if (posMatch) {
            const pos = Number(posMatch[1]);
            const { line, col } = lineCol(text, pos);
            const lineText = text.split('\n')[line - 1] || '';
            where = `<p>Место ошибки: <b>строка ${line}</b>, символ ${col}. Я выделил его в поле выше.</p>
                     <pre class="error-line">${DND.escapeHtml(lineText.trim())}</pre>`;
            editor.focus();
            editor.setSelectionRange(Math.max(0, pos - 1), pos + 1);
            // прокрутить поле к строке ошибки
            const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
            editor.scrollTop = Math.max(0, (line - 4) * lineHeight);
        }
        showResult('error', `<p><i class="fas fa-times-circle"></i> <b>В файле ошибка.</b> ${explain(err.message)}</p>${where}`);
        return;
    }

    // Проверки содержимого
    const problems = [];
    if (typeof data !== 'object' || Array.isArray(data) || data === null) {
        problems.push('Весь файл должен быть в фигурных скобках <code>{ ... }</code>.');
    } else {
        if (!data.name_ru || data.name_ru === 'Название расы' || /^Название/.test(data.name_ru)) {
            problems.push('Заполни поле <code>name_ru</code> — название по-русски.');
        }
        if (!data.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.id)) {
            const suggestion = slugify(data.name_en);
            problems.push(`Поле <code>id</code> должно быть латиницей маленькими буквами через дефис, например <code>sea-elf</code>.` +
                (suggestion ? ` Подойдёт: <code>${suggestion}</code>` : ''));
        }
    }

    if (problems.length) {
        showResult('error', `<p><i class="fas fa-times-circle"></i> <b>Почти готово, осталось поправить:</b></p><ul>${problems.map(p => `<li>${p}</li>`).join('')}</ul>`);
        return;
    }

    validEntry = data;
    downloadBtn.disabled = false;
    showResult('ok', `<i class="fas fa-check-circle"></i> <b>Ошибок нет!</b> Ниже — как это будет выглядеть на сайте. Если всё устраивает, скачивай файл (шаг 4).`);

    try {
        preview.innerHTML = await DND.renderEntry(currentSection, data);
        previewSection.hidden = false;
    } catch (err) {
        preview.innerHTML = '';
        previewSection.hidden = true;
        console.error(err);
    }
}

function download() {
    if (!validEntry) return;
    const blob = new Blob([JSON.stringify(validEntry, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${validEntry.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function selectTemplate(sec, button) {
    if (editor.value.trim() && editor.dataset.dirty === '1' &&
        !confirm('В поле уже есть текст. Заменить его новым шаблоном? Несохранённое пропадёт.')) {
        return;
    }
    try {
        const res = await fetch(`data/${sec.id}/_template.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error();
        editor.value = await res.text();
        editor.dataset.dirty = '0';
        currentSection = sec;
        document.querySelectorAll('#template-buttons .source-btn').forEach(b => b.classList.toggle('active', b === button));
        draft.save({ section: sec.id, text: editor.value });
        result.innerHTML = '';
        previewSection.hidden = true;
        invalidate();
        editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
        showResult('error', 'Не удалось загрузить шаблон. Обнови страницу.');
    }
}

(async () => {
    if (DND.fileProtocolWarning()) return;
    const cfg = await DND.renderLayout({ pageTitle: 'Прислать свою запись' });

    // Кнопки только для разделов, у которых есть _template.json
    const box = document.getElementById('template-buttons');
    const available = (await Promise.all(cfg.sections.map(async s => {
        try {
            const r = await fetch(`data/${s.id}/_template.json`, { method: 'HEAD', cache: 'no-cache' });
            return r.ok ? s : null;
        } catch { return null; }
    }))).filter(Boolean);

    available.forEach(sec => {
        const b = document.createElement('button');
        b.className = 'source-btn';
        b.textContent = `${sec.icon || ''} ${sec.title}`;
        b.addEventListener('click', () => selectTemplate(sec, b));
        box.appendChild(b);
    });

    // Восстановить черновик
    const saved = draft.load();
    if (saved && saved.text) {
        const sec = available.find(s => s.id === saved.section);
        if (sec) {
            currentSection = sec;
            editor.value = saved.text;
            editor.dataset.dirty = '1';
            [...box.children][available.indexOf(sec)]?.classList.add('active');
        }
    }

    editor.addEventListener('input', () => {
        editor.dataset.dirty = '1';
        invalidate();
        if (currentSection) draft.save({ section: currentSection.id, text: editor.value });
    });
    // Tab вставляет отступ, а не уходит из поля
    editor.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
            editor.dispatchEvent(new Event('input'));
        }
    });

    document.getElementById('check-btn').addEventListener('click', () => {
        if (!currentSection) {
            showResult('error', 'Сначала выбери в шаге 1, что ты присылаешь.');
            return;
        }
        check();
    });
    downloadBtn.addEventListener('click', download);
})();
