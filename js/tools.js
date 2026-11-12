// =====================================================================
//  tools.js — инструменты: закуп характеристик, кости, сложность боя.
//  Переключаются по адресу: tools.html#pointbuy / #dice / #encounter
// =====================================================================

const esc = DND.escapeHtml;
const TOOLS = ['pointbuy', 'dice', 'encounter'];
const mod = score => Math.floor((score - 10) / 2);
const signed = n => (n >= 0 ? `+${n}` : `${n}`);

function randInt(max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] % max) + 1;
}

// ---------------- Переключение инструментов ----------------

function showTool() {
    const tool = TOOLS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'pointbuy';
    TOOLS.forEach(t => { document.getElementById(`tool-${t}`).hidden = t !== tool; });
    document.querySelectorAll('.tool-tabs .tab').forEach(a => a.classList.toggle('active', a.dataset.tool === tool));
    document.querySelectorAll('#sidebar .menu-item').forEach(li => {
        const href = li.querySelector('a')?.getAttribute('href') || '';
        li.classList.toggle('active', href === `tools.html#${tool}`);
    });
}

// ---------------- Закуп характеристик ----------------

const ABILITIES = ['Сила', 'Ловкость', 'Телосложение', 'Интеллект', 'Мудрость', 'Харизма'];
const COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const BUDGET = 27;
const pb = { scores: ABILITIES.map(() => 8), bonus: ABILITIES.map(() => 0) };

function renderPointBuy() {
    const spent = pb.scores.reduce((s, v) => s + COST[v], 0);
    const left = BUDGET - spent;
    document.getElementById('pb-left').textContent = left;
    document.getElementById('pb-left').className = left < 0 ? 'over' : '';

    document.getElementById('pb-body').innerHTML = ABILITIES.map((name, i) => {
        const score = pb.scores[i];
        const total = score + pb.bonus[i];
        const canUp = score < 15 && COST[score + 1] - COST[score] <= left;
        return `
            <tr>
                <td><b>${name}</b></td>
                <td class="pb-score">
                    <button class="pb-btn" data-i="${i}" data-d="-1" ${score <= 8 ? 'disabled' : ''}>−</button>
                    <span>${score}</span>
                    <button class="pb-btn" data-i="${i}" data-d="1" ${canUp ? '' : 'disabled'}>+</button>
                </td>
                <td>${COST[score]}</td>
                <td>
                    <select class="filter-select pb-bonus" data-i="${i}">
                        ${[0, 1, 2, 3].map(b => `<option value="${b}" ${pb.bonus[i] === b ? 'selected' : ''}>${b ? '+' + b : '—'}</option>`).join('')}
                    </select>
                </td>
                <td><b>${total}</b></td>
                <td class="pb-mod">${signed(mod(total))}</td>
            </tr>`;
    }).join('');
}

function initPointBuy() {
    const body = document.getElementById('pb-body');
    body.addEventListener('click', e => {
        const b = e.target.closest('.pb-btn');
        if (!b || b.disabled) return;
        const i = Number(b.dataset.i);
        pb.scores[i] = Math.min(15, Math.max(8, pb.scores[i] + Number(b.dataset.d)));
        renderPointBuy();
    });
    body.addEventListener('change', e => {
        const s = e.target.closest('.pb-bonus');
        if (!s) return;
        pb.bonus[Number(s.dataset.i)] = Number(s.value);
        renderPointBuy();
    });
    document.getElementById('pb-reset').addEventListener('click', () => {
        pb.scores = ABILITIES.map(() => 8);
        pb.bonus = ABILITIES.map(() => 0);
        renderPointBuy();
    });
    document.getElementById('pb-standard').addEventListener('click', () => {
        pb.scores = [15, 14, 13, 12, 10, 8];
        renderPointBuy();
        DND.toast('Стандартный набор стоит ровно 27 очков. Расставь значения по своим нуждам.');
    });
    renderPointBuy();
}

// ---------------- Бросок костей ----------------

const DICE = [4, 6, 8, 10, 12, 20, 100];
const history = [];

// «2к6+3», «d20», «4d6-1», «к8 + к4 + 2»
function parseFormula(text) {
    const s = text.toLowerCase().replace(/\s+/g, '').replace(/к/g, 'd');
    if (!s || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null;
    return s.match(/[+-]?(\d*d\d+|\d+)/g).map(t => {
        const sign = t.startsWith('-') ? -1 : 1;
        const body = t.replace(/^[+-]/, '');
        if (body.includes('d')) {
            const [n, d] = body.split('d');
            return { sign, count: Math.min(Number(n || 1), 100), sides: Number(d) };
        }
        return { sign, value: Number(body) };
    }).filter(t => t.value !== undefined || (t.sides > 0 && t.count > 0));
}

function rollOnce(parts) {
    let total = 0;
    const shown = [];
    for (const p of parts) {
        if (p.value !== undefined) {
            total += p.sign * p.value;
            shown.push(`${p.sign < 0 ? '−' : '+'} ${p.value}`);
        } else {
            const rolls = Array.from({ length: p.count }, () => randInt(p.sides));
            total += p.sign * rolls.reduce((a, b) => a + b, 0);
            shown.push(`${p.sign < 0 ? '−' : '+'} [${rolls.map(r =>
                r === p.sides ? `<b class="crit">${r}</b>` : r === 1 ? `<b class="fail">${r}</b>` : r).join(', ')}]`);
        }
    }
    return { total, detail: shown.join(' ').replace(/^\+ /, '') };
}

function roll() {
    const formulaEl = document.getElementById('dice-formula');
    const parts = parseFormula(formulaEl.value);
    const out = document.getElementById('dice-result');
    if (!parts || !parts.length) {
        out.innerHTML = `<div class="check-error">Не понял формулу. Примеры: <code>1к20+5</code>, <code>2d6</code>, <code>4к6-1</code></div>`;
        return;
    }
    const mode = document.getElementById('dice-mode').value;
    let result, note = '';
    if (mode !== 'normal') {
        const a = rollOnce(parts), b = rollOnce(parts);
        const pickA = mode === 'adv' ? a.total >= b.total : a.total <= b.total;
        result = pickA ? a : b;
        note = `${mode === 'adv' ? 'Преимущество' : 'Помеха'}: ${a.total} и ${b.total}`;
    } else {
        result = rollOnce(parts);
    }
    out.innerHTML = `
        <div class="dice-total">${result.total}</div>
        <div class="dice-detail">${esc(formulaEl.value)}: ${result.detail}${note ? `<br><span class="tool-hint">${note}</span>` : ''}</div>`;

    history.unshift(`<b>${result.total}</b> — ${esc(formulaEl.value)}${note ? ` (${note.toLowerCase()})` : ''}`);
    history.length = Math.min(history.length, 12);
    document.getElementById('dice-history').innerHTML = history.map(h => `<li>${h}</li>`).join('');
}

function initDice() {
    document.getElementById('dice-buttons').innerHTML = DICE.map(d =>
        `<button class="die" data-d="${d}"><i class="fas ${d === 20 ? 'fa-dice-d20' : d === 6 ? 'fa-dice-six' : 'fa-dice-d6'}"></i><span>к${d}</span></button>`).join('');
    document.getElementById('dice-buttons').addEventListener('click', e => {
        const b = e.target.closest('.die');
        if (!b) return;
        document.getElementById('dice-formula').value = `1к${b.dataset.d}`;
        roll();
    });
    document.getElementById('dice-roll').addEventListener('click', roll);
    document.getElementById('dice-formula').addEventListener('keydown', e => { if (e.key === 'Enter') roll(); });
}

// ---------------- Сложность боя ----------------

// Пороги опыта на персонажа: [лёгкий, средний, сложный, смертельный]
const THRESHOLDS = {
    1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
    5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
    9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
    13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
    17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700]
};
const CR_XP = {
    '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300,
    '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
    '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000,
    '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000
};
const DIFFICULTY = ['Лёгкий', 'Средний', 'Сложный', 'Смертельный'];

function multiplier(count) {
    if (count <= 1) return 1;
    if (count === 2) return 1.5;
    if (count <= 6) return 2;
    if (count <= 10) return 2.5;
    if (count <= 14) return 3;
    return 4;
}

const enc = { party: [{ count: 4, level: 3 }], monsters: [{ count: 3, cr: '1/2' }] };

function numberSelect(cls, i, values, current, labels = v => v) {
    return `<select class="filter-select ${cls}" data-i="${i}">${values.map(v =>
        `<option value="${v}" ${String(v) === String(current) ? 'selected' : ''}>${labels(v)}</option>`).join('')}</select>`;
}

function renderEncounter() {
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
    document.getElementById('enc-party').innerHTML = enc.party.map((p, i) => `
        <div class="enc-row">
            ${numberSelect('enc-p-count', i, range(1, 10), p.count)} <span>игр. уровня</span>
            ${numberSelect('enc-p-level', i, range(1, 20), p.level)}
            ${enc.party.length > 1 ? `<button class="enc-del" data-kind="party" data-i="${i}" aria-label="Убрать">&times;</button>` : ''}
        </div>`).join('');
    document.getElementById('enc-monsters').innerHTML = enc.monsters.map((m, i) => `
        <div class="enc-row">
            ${numberSelect('enc-m-count', i, range(1, 30), m.count)} <span>с опасностью</span>
            ${numberSelect('enc-m-cr', i, Object.keys(CR_XP), m.cr, v => `${v} (${CR_XP[v]} оп.)`)}
            ${enc.monsters.length > 1 ? `<button class="enc-del" data-kind="monsters" data-i="${i}" aria-label="Убрать">&times;</button>` : ''}
        </div>`).join('');

    const thresholds = [0, 0, 0, 0];
    let players = 0;
    enc.party.forEach(p => {
        players += p.count;
        THRESHOLDS[p.level].forEach((t, k) => { thresholds[k] += t * p.count; });
    });
    const monsterCount = enc.monsters.reduce((s, m) => s + m.count, 0);
    const baseXp = enc.monsters.reduce((s, m) => s + CR_XP[m.cr] * m.count, 0);
    // Поправка на размер группы: <3 игроков — множитель выше, ≥6 — ниже
    const steps = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
    let idx = steps.indexOf(multiplier(monsterCount));
    if (players < 3) idx = Math.min(idx + 1, steps.length - 1);
    if (players >= 6) idx = Math.max(idx - 1, 0);
    const mult = steps[idx];
    const adjusted = Math.round(baseXp * mult);

    let level = -1;
    thresholds.forEach((t, k) => { if (adjusted >= t) level = k; });
    const verdict = level < 0 ? 'Тривиальный' : DIFFICULTY[level];
    const cls = ['trivial', 'easy', 'medium', 'hard', 'deadly'][level + 1];

    document.getElementById('enc-result').innerHTML = `
        <div class="enc-verdict enc-${cls}">${verdict}</div>
        <ul class="entry-props">
            <li><strong>Опыт монстров:</strong> ${baseXp} (каждому игроку: ${Math.floor(baseXp / Math.max(players, 1))})</li>
            <li><strong>Множитель:</strong> ×${mult} (монстров: ${monsterCount}, игроков: ${players})</li>
            <li><strong>Скорректированный опыт:</strong> ${adjusted}</li>
        </ul>
        <div class="enc-scale">${thresholds.map((t, k) =>
            `<div class="${k <= level ? 'reached' : ''}"><span>${DIFFICULTY[k]}</span><b>${t}</b></div>`).join('')}</div>`;
}

function initEncounter() {
    const root = document.getElementById('tool-encounter');
    root.addEventListener('change', e => {
        const s = e.target;
        const i = Number(s.dataset.i);
        if (s.classList.contains('enc-p-count')) enc.party[i].count = Number(s.value);
        if (s.classList.contains('enc-p-level')) enc.party[i].level = Number(s.value);
        if (s.classList.contains('enc-m-count')) enc.monsters[i].count = Number(s.value);
        if (s.classList.contains('enc-m-cr')) enc.monsters[i].cr = s.value;
        renderEncounter();
    });
    root.addEventListener('click', e => {
        const del = e.target.closest('.enc-del');
        if (del) { enc[del.dataset.kind].splice(Number(del.dataset.i), 1); renderEncounter(); }
    });
    document.getElementById('enc-add-party').addEventListener('click', () => { enc.party.push({ count: 1, level: 3 }); renderEncounter(); });
    document.getElementById('enc-add-monster').addEventListener('click', () => { enc.monsters.push({ count: 1, cr: '1' }); renderEncounter(); });
    renderEncounter();
}

// ---------------- Запуск ----------------

(async () => {
    if (DND.fileProtocolWarning()) return;
    await DND.renderLayout({ pageTitle: 'Инструменты' });
    initPointBuy();
    initDice();
    initEncounter();
    showTool();
    window.addEventListener('hashchange', showTool);
})();
