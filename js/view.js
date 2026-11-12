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
    } catch (err) {
        console.error(err);
        DND.showError(content, err.message);
        content.insertAdjacentHTML('beforeend',
            `<p style="text-align:center"><a class="btn-back" style="display:inline-flex" href="${sectionId ? `list.html?s=${sectionId}` : 'index.html'}"><i class="fas fa-arrow-left"></i> Назад</a></p>`);
    }
})();
