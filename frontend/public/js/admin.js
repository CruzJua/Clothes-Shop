// admin.js — admin panel: image lazy-load, Update/Delete buttons, Create panel

document.addEventListener('DOMContentLoaded', () => {

    /* ══ Existing item cards ═══════════════════════════════════════ */

    // Image shimmer / lazy-load and Lightbox
    document.querySelectorAll('.producto img').forEach(img => {
        if (img.complete) {
            img.classList.add('loaded');
        } else {
            img.addEventListener('load',  () => img.classList.add('loaded'));
            img.addEventListener('error', () => {
                img.onerror = null;
                img.src = '/images/placeholder.svg';
                img.classList.add('loaded');
            });
        }
        
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirLightbox(img.src);
        });
    });

    // Lightbox function
    function abrirLightbox(imgSrc) {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        const imgGrande = document.createElement('img');
        imgGrande.src = imgSrc;
        modal.appendChild(imgGrande);
        document.body.appendChild(modal);
        modal.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    // Update button — navigate to the edit page
    document.querySelectorAll('.admin-btn--update').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = `/edit-item/${btn.dataset.id}`;
        });
    });

    // Delete button — confirm → call DELETE /api/items/:id → remove card from DOM
    document.querySelectorAll('.admin-btn--delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id  = btn.dataset.id;
            const card = btn.closest('.producto');
            const name = card?.querySelector('h3')?.textContent || 'este artículo';

            if (!confirm(`¿Eliminar "${name}"?\n\nEsto borrará el artículo de la base de datos y su imagen de Cloudinary. Esta acción no se puede deshacer.`)) return;

            btn.disabled = true;
            btn.textContent = '⏳ Eliminando…';

            try {
                const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });

                if (res.ok) {
                    // Animate card out, then remove it
                    if (card) {
                        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95)';
                        setTimeout(() => card.remove(), 320);
                    }
                } else {
                    const data = await res.json().catch(() => ({}));
                    alert(`Error al eliminar: ${data.error || res.statusText}`);
                    btn.disabled = false;
                    btn.textContent = '🗑️ Delete';
                }
            } catch (err) {
                alert('Error de red al eliminar el artículo.');
                btn.disabled = false;
                btn.textContent = '🗑️ Delete';
            }
        });
    });

    /* ══ Create New Item panel ═════════════════════════════════════ */

    const toggleBtn   = document.getElementById('toggle-create-btn');
    const panel       = document.getElementById('create-panel');
    const cancelBtn   = document.getElementById('cancel-create-btn');
    const urlInput    = document.getElementById('c-imagen-url');
    const fileInput   = document.getElementById('c-imagen-file');
    const dropZone    = document.getElementById('c-drop-zone');
    const dropText    = document.getElementById('c-drop-text');
    const previewImg  = document.getElementById('c-preview-img');
    const optUrl      = document.getElementById('c-opt-url');
    const optFile     = document.getElementById('c-opt-file');
    const submitBtn   = document.getElementById('c-submit-btn');
    const createForm  = document.getElementById('create-form');

    // ── Toggle open / close ────────────────────────────────────────
    function openPanel() {
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        toggleBtn.classList.add('is-open');
        toggleBtn.textContent = '✕ Cerrar';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closePanel() {
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        toggleBtn.classList.remove('is-open');
        toggleBtn.textContent = '➕ Nuevo Artículo';
        createForm.reset();
        previewImg.src = '/images/placeholder.svg';
        resetImageOptions();
    }

    toggleBtn.addEventListener('click', () => {
        panel.classList.contains('is-open') ? closePanel() : openPanel();
    });

    cancelBtn.addEventListener('click', closePanel);

    // ── Image picker (delegated to shared utility) ─────────────────
    const picker = createImagePicker({
        urlInputId  : 'c-imagen-url',
        fileInputId : 'c-imagen-file',
        dropZoneId  : 'c-drop-zone',
        dropTextId  : 'c-drop-text',
        optUrlId    : 'c-opt-url',
        optFileId   : 'c-opt-file',
        previewImgId: 'c-preview-img',
    });

    function closePanel() {
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        toggleBtn.classList.remove('is-open');
        toggleBtn.textContent = '➕ Nuevo Artículo';
        createForm.reset();
        picker?.reset();
    }

    // ── Submit loading state ───────────────────────────────────────
    createForm.addEventListener('submit', () => {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Guardando…';
    });
});

