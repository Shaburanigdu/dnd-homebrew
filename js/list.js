// =====================================================================
//  list.js — каталог раздела:  list.html?s=races
//  и глобальный поиск:         list.html?q=эфир
//
//  Два вида каталога (поле "view" в sections.json):
//    "cards" — плитки с картинками (расы, классы)
//    "list"  — плотный список в 4 колонки с группами (заклинания, бестиарий...)
// =====================================================================

const content = document.getElementById('content');
const esc = DND.escapeHtml;

const LEVEL_GROUP = v => (Number(v) === 0 ? 'Заговоры' : `${v} уровень`);

function sortEntries(entries, fields = ['name_ru']) {
    return [...entries].sort((a, b) => {
        for (const f of fields) {
            const x = a[f], y = b[f];
            if (x === y) continue;
            if (typeof x === 'number' && typeof y === 'number') return x - y;
            return String(x ?? '').localeCompare(String(y ?? ''), 'ru');
        }
        return 0;
    });
}

function truncate(text, n) {
    const t = DND.stripTags(text);
    return t.length > n ? t.slice(0, n).trimEnd() + '…' : t;
}

const entryHref = (sec, e) => `view.html?s=${sec.id}&id=${encodeURIComponent(e.id)}`;

function matchesText(e, q) {
    if (!q) return true;
    const hay = [e.name_ru, e.name_en, DND.stripTags(e.description)]
        .concat(Array.isArray(e.traits) ? e.traits : [])
        .join(' ').toLowerCase();
    return hay.includes(q);
}

// Значения поля записи для фильтра (массивы раскрываются, булевы → "true"/"false")
function fieldValues(e, f) {
    const v = e[f.field];
    if (f.format === 'yesno') return [String(v === true)];
    if (Array.isArray(v)) return v.map(String);
    return v === undefined || v === null || v === '' ? [] : [String(v)];
}

// ---------------- Плитка (расы, классы) ----------------

function cardHTML(sec, e) {
    const tags = sec.tags && Array.isArray(e[sec.tags]) ? e[sec.tags] : [];
    const letter = esc((e.name_ru || '?').charAt(0));
    const image = e.image
        ? `<div class="card-image" style="background-image: url('${encodeURI(e.image)}')">`
        : `<div class="card-image card-image-placeholder"><span>${letter}</span>`;
    return `
        <a class="race-card" href="${entryHref(sec, e)}">
            ${image}
                ${e.source ? `<span class="card-source">${esc(e.source)}</span>` : ''}
            </div>
            <div class="card-content">
                <div class="race-name-ru">${esc(e.name_ru || e.id)}</div>
                ${e.name_en ? `<div class="race-name-en">${esc(e.name_en)}</div>` : ''}
                <div class="race-description">${esc(truncate(e.description, 110)) || 'Описание отсутствует'}</div>
                ${tags.length ? `<div class="race-traits">${tags.slice(0, 3).map(t => `<span class="trait-tag">${esc(t)}</span>`).join(' ')}</div>` : ''}
            </div>
        </a>`;
}

// ---------------- Строка списка (заклинания, предметы...) ----------------

function rowHTML(sec, e) {
    const color = DND.accentColor(sec, e);
    const icon = DND.rowIcon(sec, e);
    const prefix = sec.prefix && e[sec.prefix.field] !== undefined
        ? `<span class="row-prefix">[${esc(DND.format(e[sec.prefix.field], sec.prefix.format))}]</span>` : '';
    const markers = (sec.markers || []).filter(m => e[m.field] === true)
        .map(m => `<span class="marker" style="background:${m.color}" title="${esc(m.title)}">${esc(m.label)}</span>`).join('');
    const right = sec.rowRight === 'components' && e.components
        ? `<span class="row-right" title="${esc(e.components)}">${DND.componentLetters(e.components)}</span>` : '';
    const bar = sec.rowBar && color ? `<span class="row-bar" style="background:${color}" title="${esc(e[sec.accent.field])}"></span>` : '';
    return `
        <a class="list-row" href="${entryHref(sec, e)}" title="${esc(e.name_en || '')}">
            ${prefix}
            ${icon ? `<i class="fas ${icon} row-icon" ${color ? `style="color:${color}"` : ''}></i>` : ''}
            <span class="row-name">${esc(e.name_ru || e.id)}</span>
            ${markers}${right}${bar}
        </a>`;
}

function groupEntries(sec, entries) {
    const by = sec.group?.by || 'letter';
    const groups = new Map();
    for (const e of entries) {
        let key, label, order;
        if (by === 'letter') {
            key = (e.name_ru || e.id || '?').charAt(0).toUpperCase();
            label = key;
            order = key;
        } else if (by === 'source') {
            key = e.source || '—';
            label = DND.format(key, 'source');
            order = label;
        } else {
            key = e[by] ?? '—';
            label = sec.group.format === 'spellLevel' ? LEVEL_GROUP(key) : DND.format(key, sec.group.format);
            order = key;
        }
        if (!groups.has(key)) groups.set(key, { label, order, items: [] });
        groups.get(key).items.push(e);
    }
    return [...groups.values()].sort((a, b) =>
        (typeof a.order === 'number' && typeof b.order === 'number')
            ? a.order - b.order
            : String(a.order).localeCompare(String(b.order), 'ru'));
}

function legendHTML(sec, entries) {
    const parts = [];
    if (sec.prefix) {
        const example = sec.prefix.field === 'level' ? '2' : '1/2';
        parts.push(`<span class="row-prefix">[${example}]</span> — ${sec.prefix.field === 'level' ? 'уровень' : 'показатель опасности'}`);
    }
    if (sec.rowRight === 'components') parts.push(`<span class="row-right">ВСМ</span> — компоненты`);
    (sec.markers || []).forEach(m => parts.push(`<span class="marker" style="background:${m.color}">${esc(m.label)}</span> — ${esc(m.title)}`));

    const second = [];
    if (sec.rowIcon) {
        const present = [...new Set(entries.map(e => String(e[sec.rowIcon.field] ?? '').toLowerCase()))].filter(Boolean).sort();
        present.forEach(v => {
            const icon = sec.rowIcon.icons[v] || sec.rowIcon.default;
            const color = sec.accent?.field === sec.rowIcon.field ? sec.accent.colors[v] : null;
            if (icon) second.push(`<i class="fas ${icon}" ${color ? `style="color:${color}"` : ''}></i> — ${esc(v)}`);
        });
    } else if (sec.rowBar && sec.accent) {
        Object.entries(sec.accent.colors).forEach(([name, color]) =>
            second.push(`<span class="row-bar row-bar-legend" style="background:${color}"></span> — ${esc(name)}`));
    }
    if (!parts.length && !second.length) return '';
    return `<div class="legend">
        ${parts.length ? `<div>${parts.join('<span class="legend-gap"></span>')}</div>` : ''}
        ${second.length ? `<div>${second.join('<span class="legend-gap"></span>')}</div>` : ''}
    </div>`;
}

function listPanelHTML(sec, entries, legend = true) {
    const groups = groupEntries(sec, sortEntries(entries, ['name_ru']));
    return `
        <div class="card list-panel">
            ${legend ? legendHTML(sec, entries) : ''}
            ${groups.map(g => `
                <div class="list-group">
                    <h3 class="list-group-title">${esc(g.label)}</h3>
                    <div class="list-columns">${g.items.map(e => rowHTML(sec, e)).join('')}</div>
                </div>`).join('')}
        </div>`;
}

const emptyHTML = (icon, title, text) => `
    <div class="card empty-state">
        <i class="fas ${icon}"></i>
        <h3>${title}</h3>
        <p>${text}</p>
    </div>`;

// ---------------- Каталог одного раздела ----------------

async function renderSection(sec, cfg) {
    const all = await DND.loadIndex(sec.id);
    const isCards = sec.view === 'cards';
    const homebrewSet = new Set(cfg.homebrewSources || []);
    const isHB = e => homebrewSet.has(e.source);

    const storeKey = `filters:${sec.id}`;
    const saved = DND.store.get(storeKey) || {};
    const state = { q: '', ...saved };
    if (!state.tab) state.tab = all.some(e => !isHB(e)) ? 'official' : 'homebrew';

    // Варианты для фильтров
    const filters = (sec.filters || []).map(f => {
        const values = [...new Set(all.flatMap(e => fieldValues(e, f)))];
        values.sort((a, b) => {
            const na = Number(a), nb = Number(b);
            return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b, 'ru');
        });
        return { ...f, values };
    }).filter(f => f.values.length > (isCards ? 1 : 0));

    const label = (f, v) => f.format === 'yesno' ? (v === 'true' ? 'Да' : 'Нет')
        : esc(DND.format(isNaN(Number(v)) || f.format === 'source' ? v : Number(v), f.format, true));

    // --- разметка ---
    let header;
    if (isCards) {
        header = `
            <div class="toolbar">
                <div class="search-input"><input type="text" id="search" placeholder="Поиск: ${esc(sec.title.toLowerCase())}" value="${esc(state.q)}"></div>
                <button class="btn btn-find" id="find">Найти</button>
            </div>
            ${filters.map(f => `
                <div class="chips" data-field="${f.field}">
                    <button class="chip" data-value="">Все</button>
                    ${f.values.map(v => `<button class="chip" data-value="${esc(v)}">${esc(v)}</button>`).join('')}
                </div>`).join('')}`;
    } else {
        const countOf = tab => all.filter(e => (tab === 'homebrew') === isHB(e)).length;
        header = `
            <div class="tabs">
                <button class="tab" data-tab="official">Официальные <span class="tab-count">${countOf('official')}</span></button>
                <button class="tab" data-tab="homebrew">Homebrew <span class="tab-count">${countOf('homebrew')}</span></button>
            </div>
            <div class="toolbar">
                <div class="search-input"><input type="text" id="search" placeholder="Поиск по разделу" value="${esc(state.q)}"><i class="fas fa-search"></i></div>
                ${filters.map(f => `
                    <select class="filter-select" data-field="${f.field}">
                        <option value="">${esc(f.label)}</option>
                        ${f.values.map(v => `<option value="${esc(v)}">${label(f, v)}</option>`).join('')}
                    </select>`).join('')}
                <button class="btn btn-reset" id="reset">Сброс</button>
                <button class="btn btn-find" id="find">Найти</button>
            </div>
            <div id="notice"></div>`;
    }

    content.innerHTML = `${header}<div id="results"></div>`;

    const results = document.getElementById('results');
    const search = document.getElementById('search');

    function noticeHTML() {
        const key = `notice:${sec.id}:${state.tab}`;
        if (DND.prefs.get(key)) return '';
        const text = state.tab === 'homebrew'
            ? 'Материалы нашей компании. Хочешь добавить своё — загляни в «Прислать свою запись».'
            : 'Официальные материалы из книг Wizards of the Coast и других издательств.';
        return `<div class="notice" data-key="${key}"><span>${text}</span><button class="notice-close" aria-label="Скрыть">&times;</button></div>`;
    }

    function update() {
        DND.store.set(storeKey, state);

        content.querySelectorAll('.chips').forEach(box => {
            const cur = state[box.dataset.field] ?? '';
            box.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b.dataset.value === cur));
        });
        content.querySelectorAll('.filter-select').forEach(s => {
            s.value = state[s.dataset.field] ?? '';
            s.classList.toggle('has-value', !!s.value);
        });
        content.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
        const notice = document.getElementById('notice');
        if (notice) notice.innerHTML = noticeHTML();

        const q = state.q.toLowerCase().trim();
        const shown = all.filter(e =>
            matchesText(e, q) &&
            (isCards || (state.tab === 'homebrew') === isHB(e)) &&
            filters.every(f => !state[f.field] || fieldValues(e, f).includes(state[f.field])));

        if (!all.length) {
            results.innerHTML = emptyHTML('fa-feather-pointed', 'Раздел пока пуст',
                'Здесь появятся записи, как только кто-нибудь их пришлёт. <a href="help.html">Прислать свою</a>');
            return;
        }
        if (!shown.length) {
            const otherTab = !isCards && all.some(e => (state.tab !== 'homebrew') === isHB(e));
            results.innerHTML = emptyHTML('fa-magnifying-glass', 'Ничего не найдено',
                otherTab ? 'Попробуйте соседнюю вкладку или сбросьте фильтры.' : 'Попробуйте изменить параметры поиска.');
            return;
        }

        if (isCards) {
            const official = sortEntries(shown.filter(e => !isHB(e)));
            const hb = sortEntries(shown.filter(isHB));
            results.innerHTML = `
                ${official.length ? `<div class="race-grid">${official.map(e => cardHTML(sec, e)).join('')}</div>` : ''}
                ${hb.length ? `
                    ${official.length ? `<h2 class="group-heading">${esc(sec.title)} Homebrew</h2>` : ''}
                    <div class="race-grid">${hb.map(e => cardHTML(sec, e)).join('')}</div>` : ''}`;
        } else {
            results.innerHTML = listPanelHTML(sec, shown);
        }
    }

    // --- события ---
    search.addEventListener('input', () => { state.q = search.value; update(); });
    search.addEventListener('keydown', ev => { if (ev.key === 'Enter') search.blur(); });
    document.getElementById('find').addEventListener('click', () => { state.q = search.value; update(); });
    document.getElementById('reset')?.addEventListener('click', () => {
        filters.forEach(f => { state[f.field] = ''; });
        state.q = '';
        search.value = '';
        update();
    });
    content.querySelectorAll('.chips').forEach(box => box.addEventListener('click', ev => {
        const chip = ev.target.closest('.chip');
        if (!chip) return;
        state[box.dataset.field] = chip.dataset.value;
        update();
    }));
    content.querySelectorAll('.filter-select').forEach(s => s.addEventListener('change', () => {
        state[s.dataset.field] = s.value;
        update();
    }));
    content.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
        state.tab = t.dataset.tab;
        update();
    }));
    content.addEventListener('click', ev => {
        const close = ev.target.closest('.notice-close');
        if (!close) return;
        DND.prefs.set(close.parentElement.dataset.key, true);
        close.parentElement.remove();
    });

    update();
}

// ---------------- Глобальный поиск ----------------

async function renderGlobalSearch(cfg, query) {
    const q = query.toLowerCase().trim();
    const groups = await Promise.all(cfg.sections.map(async sec => ({
        sec,
        items: sortEntries((await DND.loadIndex(sec.id)).filter(e => matchesText(e, q)))
    })));
    const found = groups.filter(g => g.items.length);
    const total = found.reduce((n, g) => n + g.items.length, 0);

    content.innerHTML = `
        <div class="notice"><span>По запросу «${esc(query)}» найдено: <b>${total}</b></span></div>
        ${found.length ? found.map(g => `
            <h2 class="group-heading"><i class="fas ${g.sec.icon || 'fa-book'}"></i> ${esc(g.sec.title)}</h2>
            ${g.sec.view === 'cards'
                ? `<div class="race-grid">${g.items.map(e => cardHTML(g.sec, e)).join('')}</div>`
                : listPanelHTML(g.sec, g.items, false)}
        `).join('') : emptyHTML('fa-magnifying-glass', 'Ничего не найдено', 'Попробуйте другой запрос')}`;
}

// ---------------- Запуск ----------------

(async () => {
    if (DND.fileProtocolWarning()) return;
    try {
        const sectionId = DND.param('s');
        const query = DND.param('q');
        const cfg = await DND.config();

        if (sectionId) {
            const sec = cfg.sections.find(s => s.id === sectionId);
            await DND.renderLayout({ activeSection: sectionId, pageTitle: sec ? sec.title : 'Раздел не найден' });
            if (!sec) throw new Error(`Раздел «${sectionId}» не найден в data/sections.json`);
            await renderSection(sec, cfg);
        } else if (query) {
            await DND.renderLayout({ pageTitle: 'Поиск по сайту' });
            await renderGlobalSearch(cfg, query);
        } else {
            location.replace('index.html');
        }
    } catch (err) {
        console.error(err);
        DND.showError(content, err.message);
    }
})();
