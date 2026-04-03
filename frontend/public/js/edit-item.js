// edit-item.js — client-side logic for the edit item page

document.addEventListener('DOMContentLoaded', () => {

    /* ── Image picker (delegated to shared utility) ───────── */
    createImagePicker({
        urlInputId  : 'imagen-url',
        fileInputId : 'imagen-file',
        dropZoneId  : 'drop-zone',
        dropTextId  : 'drop-text',
        optUrlId    : 'opt-url',
        optFileId   : 'opt-file',
        previewImgId: 'preview-img',
        defaultDropText: 'Arrastra una imagen o haz clic para seleccionar',
    });

    /* ── Live text preview ────────────────────────────────── */
    const nombreInput = document.getElementById('nombre');
    const descInput   = document.getElementById('descripcion');
    const catSelect   = document.getElementById('categoria');

    nombreInput.addEventListener('input', () => {
        document.getElementById('preview-nombre').textContent = nombreInput.value;
    });

    descInput.addEventListener('input', () => {
        document.getElementById('preview-desc').textContent = descInput.value;
    });

    catSelect.addEventListener('change', () => {
        document.getElementById('preview-cat').textContent = catSelect.value;
    });

    /* ── Submit: show loading state ───────────────────────── */
    const form      = document.getElementById('edit-form');
    const submitBtn = document.getElementById('submit-btn');

    form.addEventListener('submit', () => {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Guardando…';
    });
});
