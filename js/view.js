// =====================================================================
//  view.js — страница одной записи:  view.html?s=races&id=synthet
//  Одна страница-шаблон на ВСЕ разделы и записи.
//  Сама отрисовка — DND.renderEntry в core.js (её же использует help.html).
// =====================================================================

const content = document.getElementById('content');

(async () => {
    if (DND.fileProtocolWarning()) return;

    const sectionId = DND.param('s');
    const id = DND.param('id');

    try {
        const sec = await DND.section(sectionId);
        if (!sec) throw new Error(`Раздел «${sectionId}» не найден`);
        await DND.renderLayout({ activeSection: sec.id, pageTitle: sec.title });

        if (!id) throw new Error('Не указан id записи');
        let e;
        try {
            e = await DND.loadEntry(sec.id, id);
        } catch {
            throw new Error(`Запись «${id}» не найдена (ожидался файл data/${sec.id}/${id}.json)`);
        }

        document.title = `${e.name_ru || id} — ${document.title}`;
        content.innerHTML = await DND.renderEntry(sec, e);

        // Навигация: предыдущая / к списку / следующая (по алфавиту внутри раздела)
        const list = [...await DND.loadIndex(sec.id)]
            .sort((a, b) => String(a.name_ru || a.id).localeCompare(String(b.name_ru || b.id), 'ru'));
        const i = list.findIndex(x => x.id === id);
        const prev = i > 0 ? list[i - 1] : null;
        const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
        const link = (x, cls, html) => x
            ? `<a class="${cls}" href="view.html?s=${sec.id}&id=${encodeURIComponent(x.id)}">${html}</a>`
            : `<span class="${cls}"></span>`;
        const esc = DND.escapeHtml;
        document.getElementById('entry-nav').innerHTML = `
            ${link(prev, 'nav-prev', prev ? `<i class="fas fa-arrow-left"></i> ${esc(prev.name_ru)}` : '')}
            <a class="nav-list" href="list.html?s=${sec.id}"><i class="fas fa-list"></i> ${esc(sec.title)}</a>
            ${link(next, 'nav-next', next ? `${esc(next.name_ru)} <i class="fas fa-arrow-right"></i>` : '')}`;
    } catch (err) {
        console.error(err);
        DND.showError(content, err.message);
    }
})();
