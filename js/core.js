// =====================================================================
//  core.js — общий движок сайта.
//  Загружает конфиг (data/sections.json), рисует шапку и боковое меню,
//  форматирует поля, превращает JSON-блоки контента в HTML
//  и рисует страницу записи.
//  Подключается на каждой странице ПЕРЕД скриптом страницы.
// =====================================================================

const DND = (() => {
    const cache = {};

    // ---------- Загрузка данных ----------

    function loadJSON(path) {
        if (!cache[path]) {
            cache[path] = fetch(path, { cache: 'no-cache' }).then(r => {
                if (!r.ok) throw new Error(`Не удалось загрузить ${path} (код ${r.status})`);
                return r.json();
            });
        }
        return cache[path];
    }

    const config = () => loadJSON('data/sections.json');

    async function section(id) {
        const cfg = await config();
        return cfg.sections.find(s => s.id === id) || null;
    }

    // Список записей раздела (короткие данные для каталога).
    // Если index.json ещё нет — раздел просто пустой.
    async function loadIndex(sectionId) {
        try {
            return await loadJSON(`data/${sectionId}/index.json`);
        } catch {
            return [];
        }
    }

    const loadEntry = (sectionId, id) => loadJSON(`data/${sectionId}/${id}.json`);

    function param(name) {
        return new URLSearchParams(location.search).get(name);
    }

    // ---------- Безопасные хранилища ----------

    function makeStore(storage) {
        return {
            get(key) { try { return JSON.parse(storage().getItem(key)); } catch { return null; } },
            set(key, v) { try { storage().setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }
        };
    }
    const store = makeStore(() => sessionStorage);   // фильтры — до закрытия вкладки
    const prefs = makeStore(() => localStorage);     // свёрнутые блоки, закрытые подсказки

    // ---------- Форматирование текста ----------

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Мини-разметка внутри текста:
    //   **жирный**   *курсив*   [текст](https://ссылка)
    //   [[spells/fireball]] или [[spells/fireball|Огненный шар]] — ссылка на запись сайта
    // Обычный HTML тоже работает.
    function inline(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/\[\[([\w-]+)\/([\w-]+)(?:\|([^\]]+))?\]\]/g,
                (_, s, id, label) => `<a class="entry-link" href="view.html?s=${s}&id=${id}">${label || id}</a>`)
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|[\w./?=&-]+)\)/g, '<a href="$2">$1</a>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>');
    }

    function stripTags(text) {
        return String(text || '').replace(/<[^>]*>/g, '').replace(/\*\*|\[\[|\]\]/g, '');
    }

    const CR_LABELS = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };
    let sourceNames = {};

    // Форматы полей, которые указываются в sections.json ("format": "...")
    function format(value, fmt, short = false) {
        if (value === null || value === undefined || value === '') return '';
        switch (fmt) {
            case 'spellLevel':
                if (Number(value) === 0) return 'Заговор';
                return short ? `${value} ур.` : `${value} уровень`;
            case 'cr':
                return `ПО ${CR_LABELS[value] || value}`;
            case 'crShort':
                return String(CR_LABELS[value] || value);
            case 'yesno':
                return value === true || value === 'true' ? 'Да' : 'Нет';
            case 'source':
                return sourceNames[value] || String(value);
            case 'abilities':
                if (typeof value === 'object' && !Array.isArray(value)) {
                    return Object.entries(value)
                        .filter(([, v]) => v && v !== '+0' && v !== '0')
                        .map(([k, v]) => `${k} ${v}`).join(', ');
                }
                return String(value);
            default:
                return Array.isArray(value) ? value.join(', ') : String(value);
        }
    }

    // «В, С, М (...)» → «ВСМ» / «ВС.» как на карточках списков
    function componentLetters(value) {
        const s = String(value || '').toUpperCase();
        const has = l => new RegExp(`(^|[\\s,])${l}($|[\\s,(])`).test(s);
        return ['В', 'С', 'М'].map(l => (has(l) ? l : '.')).join('');
    }

    function accentColor(sec, entry) {
        if (!sec.accent) return null;
        const v = String(entry[sec.accent.field] ?? '').toLowerCase();
        return sec.accent.colors[v] || null;
    }

    function rowIcon(sec, entry) {
        if (!sec.rowIcon) return null;
        const v = String(entry[sec.rowIcon.field] ?? '').toLowerCase();
        return sec.rowIcon.icons[v] || sec.rowIcon.default || null;
    }

    async function sourceName(code) {
        const cfg = await config();
        return (cfg.sources && cfg.sources[code]) || code;
    }

    async function isHomebrew(entry) {
        const cfg = await config();
        return (cfg.homebrewSources || []).includes(entry.source);
    }

    // ---------- Блоки контента ----------
    // Контент записи — массив блоков. Виды блоков:
    //   "Просто строка"                          — абзац
    //   { "title": "Заголовок", "text": ..., "blocks": [...] } — раздел с заголовком
    //   { "feature": "Название", "text": ... }    — особенность (рамка слева)
    //   { "list": ["пункт", "пункт"] }            — маркированный список
    //   { "table": { "head": [..], "rows": [[..], [..]] } } — таблица
    //   { "quote": "Текст", "author": "Кто" }     — цитата
    //   { "accordion": "Заголовок", "text": ..., "blocks": [...] } — раскрывающийся блок
    //   { "html": "<div>...</div>" }              — сырой HTML, если очень надо
    // "text" может быть строкой или массивом строк (абзацев).

    function renderBlocks(blocks) {
        if (blocks === null || blocks === undefined || blocks === '') return '';
        if (Array.isArray(blocks)) return blocks.map(renderBlocks).join('');
        if (typeof blocks === 'string') return `<p>${inline(blocks)}</p>`;

        const b = blocks;
        const body = () => renderBlocks(b.text) + renderBlocks(b.blocks);

        if (b.html) return b.html;
        if (b.quote) {
            return `<blockquote>${inline(b.quote)}${b.author ? `<br>— ${inline(b.author)}` : ''}</blockquote>`;
        }
        if (b.feature) {
            return `<div class="feature-block"><div class="feature-title">${inline(b.feature)}</div>${body()}</div>`;
        }
        if (b.list) {
            return `<ul>${b.list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`;
        }
        if (b.table) {
            const head = (b.table.head || []).map(h => `<th>${inline(h)}</th>`).join('');
            const rows = (b.table.rows || [])
                .map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
            return `${b.table.title ? `<h5 class="table-title">${inline(b.table.title)}</h5>` : ''}
                    <div class="table-wrap"><table>${head ? `<thead><tr>${head}</tr></thead>` : ''}<tbody>${rows}</tbody></table></div>`;
        }
        if (b.accordion) {
            return `<details class="accordion"${b.open ? ' open' : ''}>
                        <summary class="accordion-header"><span class="accordion-title">${inline(b.accordion)}</span><span class="accordion-icon"></span></summary>
                        <div class="accordion-body">${body()}</div>
                    </details>`;
        }
        if (b.title) {
            return `<section><h4>${inline(b.title)}</h4>${body()}</section>`;
        }
        return body();
    }

    // ---------- Страница записи (как карточка на dnd.su) ----------

    async function renderEntry(sec, e) {
        const esc = escapeHtml;
        const id = e.id || '';
        const color = accentColor(sec, e);
        const sourceFull = e.source ? await sourceName(e.source) : '';

        // Подзаголовок: «3 уровень, воплощение» / «Чудесный предмет, редкий»
        const subParts = [];
        if (sec.badge && e[sec.badge.field] !== undefined) subParts.push(format(e[sec.badge.field], sec.badge.format));
        if (sec.subtitle && e[sec.subtitle] && sec.subtitle !== sec.badge?.field) subParts.push(e[sec.subtitle]);
        const sub = subParts.filter(Boolean).join(', ');

        // Свойства: «**Время накладывания:** 1 действие»
        const props = (sec.meta || [])
            .filter(m => e[m.field] !== undefined && e[m.field] !== '' && e[m.field] !== null)
            .map(m => `<li><strong>${esc(m.label)}:</strong> ${inline(format(e[m.field], m.format))}</li>`);
        if (sec.tagsTitle && Array.isArray(e[sec.tags]) && e[sec.tags].length) {
            props.push(`<li><strong>${esc(sec.tagsTitle)}:</strong> ${esc(e[sec.tags].join(', '))}</li>`);
        }

        const markers = (sec.markers || []).filter(m => e[m.field] === true)
            .map(m => `<span class="marker" style="background:${m.color}" title="${esc(m.title)}">${esc(m.label)}</span>`).join('');

        // Если есть полноценный контент — описание идёт только в карточку каталога.
        const body = e.content ? renderBlocks(e.content) : renderBlocks(e.description);

        return `
            <article class="entry card">
                <header class="entry-header">
                    <h2 class="entry-title">${esc(e.name_ru || id)}${e.name_en ? ` <span class="entry-title-en">[${esc(e.name_en)}]</span>` : ''}</h2>
                    ${e.source ? `<span class="entry-source" title="${esc(sourceFull)}">${esc(e.source)}</span>` : ''}
                </header>
                ${sub || markers ? `<div class="entry-sub" ${color ? `style="border-left-color:${color}"` : ''}>${esc(sub)} ${markers}</div>` : ''}
                <div class="entry-body detail-content">
                    ${e.image ? `<img class="entry-image" src="${encodeURI(e.image)}" alt="${esc(e.name_ru || '')}">` : ''}
                    ${e.quote ? renderBlocks({ quote: e.quote.text, author: e.quote.author }) : ''}
                    ${props.length ? `<ul class="entry-props">${props.join('')}</ul>` : ''}
                    ${body}
                    ${sourceFull ? `<p class="entry-source-line"><strong>Источник:</strong> ${esc(sourceFull)}</p>` : ''}
                </div>
                <footer class="entry-nav" id="entry-nav"></footer>
            </article>`;
    }

    // ---------- Шапка и боковое меню ----------

    function fileProtocolWarning() {
        if (location.protocol !== 'file:') return false;
        document.body.innerHTML = `
            <div class="site-notice">
                <h2><i class="fas fa-exclamation-triangle"></i> Сайт открыт как файл</h2>
                <p>Браузер не даёт загружать JSON со страниц, открытых двойным кликом (<code>file://</code>).</p>
                <p>Запустите локальный сервер: дважды кликните <b>start.bat</b> в папке сайта
                   и откройте <a href="http://localhost:8000">http://localhost:8000</a>.</p>
            </div>`;
        return true;
    }

    const EDITION_JOKES = [
        'Эта редакция ещё в плейтесте у нашего мастера.',
        'Не завезли. Приходите после следующей сессии.',
        'Кубик выпал на 1. Редакция не переключилась.',
        'Для доступа нужна настройка на предмет. У вас её нет.',
        'Мастер сказал «нет». Мастер всегда прав.'
    ];

    function toast(text) {
        document.querySelector('.toast')?.remove();
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = text;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('toast-hide'), 2600);
        setTimeout(() => t.remove(), 3000);
    }

    function menuBlock(id, title, itemsHtml, extraClass = '') {
        const collapsed = (prefs.get('collapsed') || []).includes(id);
        return `
            <nav class="menu-block ${extraClass} ${collapsed ? 'collapsed' : ''}" data-block="${id}">
                <button class="menu-block-title" type="button">${title}<i class="fas fa-chevron-up"></i></button>
                <ul class="menu-list">${itemsHtml}</ul>
            </nav>`;
    }

    const menuItem = (href, icon, label, active = false, extra = '') => `
        <li class="menu-item ${active ? 'active' : ''}">
            <a href="${href}"><i class="fas ${icon} fa-fw"></i> ${label}${extra}</a>
        </li>`;

    async function randomEntry() {
        const cfg = await config();
        const all = (await Promise.all(cfg.sections.map(async s =>
            (await loadIndex(s.id)).map(e => ({ s: s.id, id: e.id }))))).flat();
        if (!all.length) { toast('На сайте пока пусто — удача не на что упасть.'); return; }
        const pick = all[Math.floor(Math.random() * all.length)];
        location.href = `view.html?s=${pick.s}&id=${encodeURIComponent(pick.id)}`;
    }

    async function renderLayout({ activeSection = null, activePage = '', pageTitle = '' } = {}) {
        const cfg = await config();
        sourceNames = cfg.sources || {};
        document.title = pageTitle ? `${pageTitle} — ${cfg.site.title}` : cfg.site.title;

        // Шапка «DnD Хоумбрю | Раздел»
        const page = document.querySelector('.page');
        if (page && !page.querySelector('.page-header')) {
            page.insertAdjacentHTML('afterbegin', `
                <header class="page-header">
                    <button class="menu-toggle" type="button" aria-label="Меню"><i class="fas fa-bars"></i></button>
                    <a href="index.html" class="brand">${escapeHtml(cfg.site.title)}</a>
                    ${pageTitle ? `<span class="brand-sep"></span><h1 class="page-name">${escapeHtml(pageTitle)}</h1>` : ''}
                </header>`);
            page.querySelector('.menu-toggle').addEventListener('click', () => document.body.classList.toggle('menu-open'));
        }

        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return cfg;

        const editions = cfg.site.editions || ['5e42', '5e∞'];

        sidebar.innerHTML = `
            <div class="edition-switch">
                <button type="button" class="edition joke">${escapeHtml(editions[1])}</button>
                <span>/</span>
                <button type="button" class="edition active">${escapeHtml(editions[0])}</button>
            </div>

            <form class="site-search" action="list.html" method="get">
                <input type="text" name="q" placeholder="Поиск по сайту" value="${escapeHtml(param('q') || '')}">
                <button type="submit" aria-label="Искать"><i class="fas fa-search"></i></button>
            </form>

            ${menuBlock('refs', 'Справочники', cfg.sections.map(s =>
                menuItem(`list.html?s=${s.id}`, s.icon || 'fa-book', escapeHtml(s.title), s.id === activeSection,
                    `<span class="menu-count" data-count="${s.id}"></span>`)).join(''))}

            ${menuBlock('tools', 'Инструменты', `
                ${menuItem('tools.html#pointbuy', 'fa-chart-simple', 'Закуп характеристик', activePage === 'pointbuy')}
                ${menuItem('tools.html#dice', 'fa-dice-d20', 'Бросок костей', activePage === 'dice')}
                ${menuItem('tools.html#encounter', 'fa-skull-crossbones', 'Сложность боя', activePage === 'encounter')}
                ${menuItem('#lucky', 'fa-clover', 'Мне повезёт')}
            `)}

            ${menuBlock('table', 'Наш стол', `
                ${menuItem('help.html', 'fa-paper-plane', 'Прислать свою запись', activePage === 'help')}
                ${cfg.site.repo ? menuItem(cfg.site.repo, 'fa-code-branch', 'Исходники на GitHub') : ''}
            `)}
        `;

        // Сворачивание блоков меню (запоминается)
        sidebar.querySelectorAll('.menu-block-title').forEach(btn => {
            btn.addEventListener('click', () => {
                const block = btn.closest('.menu-block');
                block.classList.toggle('collapsed');
                const ids = new Set(prefs.get('collapsed') || []);
                block.classList.contains('collapsed') ? ids.add(block.dataset.block) : ids.delete(block.dataset.block);
                prefs.set('collapsed', [...ids]);
            });
        });

        sidebar.querySelector('.edition.joke').addEventListener('click', () =>
            toast(EDITION_JOKES[Math.floor(Math.random() * EDITION_JOKES.length)]));

        sidebar.querySelector('a[href="#lucky"]').addEventListener('click', ev => {
            ev.preventDefault();
            randomEntry();
        });

        // Счётчики записей в меню (не блокируют страницу)
        cfg.sections.forEach(async s => {
            const list = await loadIndex(s.id);
            const el = sidebar.querySelector(`[data-count="${s.id}"]`);
            if (el && list.length) el.textContent = list.length;
        });

        return cfg;
    }

    function showError(container, message) {
        container.innerHTML = `
            <div class="card empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Ошибка</h3>
                <p>${escapeHtml(message)}</p>
            </div>`;
    }

    return {
        config, section, loadIndex, loadEntry, param, store, prefs,
        escapeHtml, inline, stripTags, format, componentLetters, accentColor, rowIcon,
        sourceName, isHomebrew, renderBlocks, renderEntry, renderLayout,
        fileProtocolWarning, showError, toast, randomEntry
    };
})();
