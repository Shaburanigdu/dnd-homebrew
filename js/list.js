// =====================================================================
//  list.js — каталог раздела:  list.html?s=races
//  и глобальный поиск:         list.html?q=эфир
// =====================================================================

const content = document.getElementById('content');

function sortEntries(entries, sortFields) {
    const fields = sortFields || ['name_ru'];
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

function cardHTML(sec, e) {
    const href = `view.html?s=${sec.id}&id=${encodeURIComponent(e.id)}`;
    const tags = sec.tags && Array.isArray(e[sec.tags]) ? e[sec.tags] : [];

    if ((sec.card || 'compact') === 'image') {
        const letter = DND.escapeHtml((e.name_ru || '?').charAt(0));
        const image = e.image
            ? `<div class="card-image" style="background-image: url('${encodeURI(e.image)}')">`
            : `<div class="card-image card-image-placeholder"><span>${letter}</span>`;
        return `
            <a class="race-card" href="${href}">
                ${image}
                    ${e.source ? `<span class="card-source">${DND.escapeHtml(e.source)}</span>` : ''}
                </div>
                <div class="card-content">
                    <div class="race-name-ru">${DND.escapeHtml(e.name_ru || e.id)}</div>
                    ${e.name_en ? `<div class="race-name-en">${DND.escapeHtml(e.name_en)}</div>` : ''}
                    <div class="race-description">${DND.escapeHtml(truncate(e.description, 110)) || 'Описание отсутствует'}</div>
                    ${tags.length ? `<div class="race-traits">${tags.slice(0, 3).map(t => `<span class="trait-tag">${DND.escapeHtml(t)}</span>`).join(' ')}</div>` : ''}
                </div>
            </a>`;
    }

    // compact
    const color = DND.accentColor(sec, e);
    const badge = sec.badge ? DND.format(e[sec.badge.field], sec.badge.format, true) : '';
    const subtitle = sec.subtitle ? e[sec.subtitle] : '';
    const components = e.components ? DND.format(e.components, 'components', true) : '';
    return `
        <a class="spell-card" href="${href}" ${color ? `style="border-left-color:${color}"` : ''}>
            <div class="spell-card-header">
                <span class="spell-level">${DND.escapeHtml(badge || e.source || '')}</span>
                ${subtitle ? `<span class="spell-school" ${color ? `style="color:${color}"` : ''}>${DND.escapeHtml(subtitle)}</span>` : ''}
            </div>
            <div class="spell-name-ru">${DND.escapeHtml(e.name_ru || e.id)}</div>
            ${e.name_en ? `<div class="spell-name-en">${DND.escapeHtml(e.name_en)}</div>` : ''}
            ${components ? `<div class="spell-components">${components}</div>` : ''}
            ${tags.length
                ? `<div class="spell-classes">${DND.escapeHtml(tags.slice(0, 3).join(', '))}</div>`
                : (e.description ? `<div class="spell-classes">${DND.escapeHtml(truncate(e.description, 80))}</div>` : '')}
        </a>`;
}

function gridClass(sec) {
    return (sec.card || 'compact') === 'image' ? 'race-grid' : 'spells-grid';
}

function matchesText(e, q) {
    if (!q) return true;
    const hay = [e.name_ru, e.name_en, DND.stripTags(e.description)]
        .concat(Array.isArray(e.traits) ? e.traits : [])
        .join(' ').toLowerCase();
    return hay.includes(q);
}

// ---------------- Каталог одного раздела ----------------

async function renderSection(sec) {
    const all = sortEntries(await DND.loadIndex(sec.id), sec.sort);
    const filters = sec.filters || [];
    const storeKey = `filters:${sec.id}`;
    const state = Object.assign({ q: '' }, DND.store.get(storeKey) || {});

    // Уникальные значения для каждой группы фильтров
    const filterGroups = filters.map(f => {
        let values = [...new Set(all.map(e => e[f.field]).filter(v => v !== undefined && v !== null && v !== ''))];
        values.sort((a, b) => (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b), 'ru'));
        return { ...f, values };
    }).filter(g => g.values.length > 1);

    content.innerHTML = `
        <div class="content-header">
            <h1 class="section-title">${sec.icon || ''} ${DND.escapeHtml(sec.title)}</h1>
            <div class="search-bar">
                <input type="text" id="search" placeholder="Поиск: ${DND.escapeHtml(sec.title.toLowerCase())}" value="${DND.escapeHtml(state.q)}">
                <button id="reset" class="btn-reset">Сброс</button>
            </div>
            ${filterGroups.map(g => `
                <div class="filter-group">
                    <span class="filter-label">${DND.escapeHtml(g.label)}:</span>
                    <div class="source-filters" data-field="${g.field}">
                        <button class="source-btn" data-value="">Все</button>
                        ${g.values.map(v => `<button class="source-btn" data-value="${DND.escapeHtml(v)}">${DND.escapeHtml(DND.format(v, g.format, true))}</button>`).join('')}
                    </div>
                </div>`).join('')}
            <div class="content-stats" id="stats"></div>
        </div>
        <div class="${gridClass(sec)}" id="grid"></div>`;

    const grid = document.getElementById('grid');
    const stats = document.getElementById('stats');
    const search = document.getElementById('search');

    function update() {
        DND.store.set(storeKey, state);
        content.querySelectorAll('.source-filters').forEach(box => {
            const cur = state[box.dataset.field] ?? '';
            box.querySelectorAll('.source-btn').forEach(b => b.classList.toggle('active', b.dataset.value === String(cur)));
        });

        const q = state.q.toLowerCase().trim();
        const shown = all.filter(e => matchesText(e, q) &&
            filterGroups.every(g => !state[g.field] || String(e[g.field]) === state[g.field]));

        stats.textContent = `Показано: ${shown.length} из ${all.length}`;

        if (!all.length) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-feather-alt"></i>
                    <h3>Раздел пока пуст</h3>
                    <p>Добавьте JSON-файл в папку <code>data/${sec.id}/</code> и пересоберите индекс.</p>
                </div>`;
        } else if (!shown.length) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>Ничего не найдено</h3>
                    <p>Попробуйте изменить параметры поиска</p>
                </div>`;
        } else {
            grid.innerHTML = shown.map(e => cardHTML(sec, e)).join('');
        }
    }

    search.addEventListener('input', () => { state.q = search.value; update(); });
    document.getElementById('reset').addEventListener('click', () => {
        Object.keys(state).forEach(k => { state[k] = ''; });
        search.value = '';
        update();
    });
    content.querySelectorAll('.source-filters').forEach(box => {
        box.addEventListener('click', ev => {
            const btn = ev.target.closest('.source-btn');
            if (!btn) return;
            state[box.dataset.field] = btn.dataset.value;
            update();
        });
    });

    update();
}

// ---------------- Глобальный поиск ----------------

async function renderGlobalSearch(cfg, query) {
    const q = query.toLowerCase().trim();
    const groups = await Promise.all(cfg.sections.map(async sec => ({
        sec,
        items: sortEntries((await DND.loadIndex(sec.id)).filter(e => matchesText(e, q)), sec.sort)
    })));
    const found = groups.filter(g => g.items.length);
    const total = found.reduce((n, g) => n + g.items.length, 0);

    content.innerHTML = `
        <div class="content-header">
            <h1 class="section-title"><i class="fas fa-search"></i> Поиск: «${DND.escapeHtml(query)}»</h1>
            <div class="content-stats">Найдено: ${total}</div>
        </div>
        ${found.length ? found.map(g => `
            <h2 class="search-group-title">${g.sec.icon || ''} ${DND.escapeHtml(g.sec.title)}</h2>
            <div class="${gridClass(g.sec)}">${g.items.map(e => cardHTML(g.sec, e)).join('')}</div>
        `).join('') : `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>Ничего не найдено</h3>
                <p>Попробуйте другой запрос</p>
            </div>`}`;
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
            await renderSection(sec);
        } else if (query) {
            await DND.renderLayout({ pageTitle: 'Поиск' });
            await renderGlobalSearch(cfg, query);
        } else {
            location.replace('index.html');
        }
    } catch (err) {
        console.error(err);
        DND.showError(content, err.message);
    }
})();
