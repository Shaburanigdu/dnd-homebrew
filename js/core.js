// =====================================================================
//  core.js — общий движок сайта.
//  Загружает конфиг (data/sections.json), рисует боковое меню,
//  форматирует поля и превращает JSON-блоки контента в HTML.
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

    // Список записей раздела (короткие данные для карточек).
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

    // ---------- Безопасное хранилище (фильтры и т.п.) ----------

    const store = {
        get(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } },
        set(key, v) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }
    };

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

    // Форматы полей, которые указываются в sections.json ("format": "...")
    function format(value, fmt, short = false) {
        if (value === null || value === undefined || value === '') return '';
        switch (fmt) {
            case 'spellLevel':
                if (Number(value) === 0) return 'Заговор';
                return short ? `${value} ур.` : `${value} уровень`;
            case 'cr':
                return `ПО ${CR_LABELS[value] || value}`;
            case 'abilities':
                if (typeof value === 'object' && !Array.isArray(value)) {
                    return Object.entries(value)
                        .filter(([, v]) => v && v !== '+0' && v !== '0')
                        .map(([k, v]) => `${k} ${v}`).join(', ');
                }
                return String(value);
            case 'components': {
                const icons = {
                    'В': '<i class="fas fa-comment" title="Вербальный"></i>',
                    'С': '<i class="fas fa-hand-sparkles" title="Соматический"></i>',
                    'М': '<i class="fas fa-gem" title="Материальный"></i>'
                };
                if (short) {
                    return String(value).split(/,\s*/).map(c => icons[c.trim().charAt(0)] || '').join(' ');
                }
                return escapeHtml(value);
            }
            default:
                return Array.isArray(value) ? value.join(', ') : String(value);
        }
    }

    function accentColor(sec, entry) {
        if (!sec.accent) return null;
        const v = String(entry[sec.accent.field] ?? '').toLowerCase();
        return sec.accent.colors[v] || null;
    }

    async function sourceName(code) {
        const cfg = await config();
        return (cfg.sources && cfg.sources[code]) || code;
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

    // ---------- Страница записи ----------

    async function renderEntry(sec, e) {
        const esc = escapeHtml;
        const id = e.id || '';
        const color = accentColor(sec, e);
        const badge = sec.badge ? format(e[sec.badge.field], sec.badge.format) : '';
        const subtitle = sec.subtitle && e[sec.subtitle] ? e[sec.subtitle] : '';
        const sourceFull = e.source ? await sourceName(e.source) : '';

        const meta = (sec.meta || [])
            .filter(m => e[m.field] !== undefined && e[m.field] !== '' && e[m.field] !== null)
            .map(m => {
                const value = format(e[m.field], m.format);
                return `
                <div class="info-item">
                    <div class="info-label">${esc(m.label)}</div>
                    <div class="info-value">${m.format === 'components' ? value : inline(value)}</div>
                </div>`;
            }).join('');

        // Теги показываются на странице, только если у раздела задан tagsTitle
        // (у рас теги — краткий список особенностей для карточки, на странице они дублировались бы).
        const tags = sec.tagsTitle && Array.isArray(e[sec.tags]) ? e[sec.tags] : [];
        // Если есть полноценный контент — описание идёт только в карточку.
        const body = e.content ? renderBlocks(e.content) : renderBlocks(e.description);

        return `
            <article class="race-detail">
                <div class="detail-header">
                    <div class="detail-title">
                        <div class="detail-name-ru">${esc(e.name_ru || id)}</div>
                        ${e.name_en ? `<div class="detail-name-en">${esc(e.name_en)}</div>` : ''}
                    </div>
                    <div class="detail-badges">
                        ${badge ? `<span class="detail-source" ${color ? `style="background:${color};color:#111"` : ''}>${esc(badge)}</span>` : ''}
                        ${subtitle ? `<span class="detail-source detail-source-muted">${esc(subtitle)}</span>` : ''}
                        ${e.source ? `<span class="detail-source" title="${esc(sourceFull)}">${esc(e.source)}</span>` : ''}
                    </div>
                    <a class="btn-back" href="list.html?s=${sec.id}"><i class="fas fa-arrow-left"></i> ${esc(sec.title)}</a>
                </div>

                <div class="detail-content">
                    ${sourceFull ? `<p class="detail-source-line"><strong>Источник:</strong> ${esc(sourceFull)}</p>` : ''}
                    ${e.quote ? renderBlocks({ quote: e.quote.text, author: e.quote.author }) : ''}
                    ${meta ? `<section class="spell-info-grid">${meta}</section>` : ''}
                    ${body}
                    ${tags.length ? `
                        <section>
                            <h4>${esc(sec.tagsTitle)}</h4>
                            <div class="class-tags">${tags.map(t => `<span class="class-tag">${esc(t)}</span>`).join('')}</div>
                        </section>` : ''}
                </div>
            </article>`;
    }

    // ---------- Общий каркас страницы ----------

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

    async function renderLayout({ activeSection = null, pageTitle = '' } = {}) {
        const cfg = await config();
        document.title = pageTitle ? `${pageTitle} — ${cfg.site.title}` : cfg.site.title;

        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return cfg;

        sidebar.innerHTML = `
            <div class="sidebar-header">
                <a href="index.html" class="logo-title">${escapeHtml(cfg.site.title)}</a>
                <h2 class="page-title">${escapeHtml(pageTitle || cfg.site.subtitle || '')}</h2>
            </div>

            <form class="site-search" action="list.html" method="get">
                <input type="text" name="q" placeholder="Поиск по сайту..." value="${escapeHtml(param('q') || '')}">
                <button type="submit" aria-label="Искать"><i class="fas fa-search"></i></button>
            </form>

            <nav class="navigation-menu">
                <h3 class="menu-title"><i class="fas fa-book"></i> Справочники</h3>
                <ul class="menu-list">
                    ${cfg.sections.map(s => `
                        <li class="menu-item ${s.id === activeSection ? 'active' : ''}">
                            <a href="list.html?s=${s.id}">
                                <span class="icon">${s.icon || '•'}</span> ${escapeHtml(s.title)}
                                <span class="menu-count" data-count="${s.id}"></span>
                            </a>
                        </li>`).join('')}
                </ul>
            </nav>

            <nav class="navigation-menu">
                <ul class="menu-list">
                    <li class="menu-item ${location.pathname.endsWith('help.html') ? 'active' : ''}">
                        <a href="help.html"><span class="icon">📨</span> Прислать свою запись</a>
                    </li>
                </ul>
            </nav>
        `;

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
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Ошибка</h3>
                <p>${escapeHtml(message)}</p>
            </div>`;
    }

    return {
        config, section, loadIndex, loadEntry, param, store,
        escapeHtml, inline, stripTags, format, accentColor, sourceName,
        renderBlocks, renderEntry, renderLayout, fileProtocolWarning, showError
    };
})();
