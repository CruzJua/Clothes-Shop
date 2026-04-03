/**
 * image-picker.js
 * ───────────────────────────────────────────────────────────────────
 * Shared utility for the "URL vs File" exclusive image picker widget.
 * Used by both admin.js (Create panel) and edit-item.js (Edit form).
 *
 * Usage:
 *   const picker = createImagePicker({
 *       urlInputId  : 'imagen-url',
 *       fileInputId : 'imagen-file',
 *       dropZoneId  : 'drop-zone',
 *       dropTextId  : 'drop-text',
 *       optUrlId    : 'opt-url',
 *       optFileId   : 'opt-file',
 *       previewImgId: 'preview-img',
 *       placeholder : '/images/placeholder.svg',   // optional
 *   });
 *   picker.reset();   // call when the containing form resets
 */

function createImagePicker({
    urlInputId,
    fileInputId,
    dropZoneId,
    dropTextId,
    optUrlId,
    optFileId,
    previewImgId,
    placeholder = '/images/placeholder.svg',
    defaultDropText = 'Arrastra o haz clic',
}) {
    const urlInput   = document.getElementById(urlInputId);
    const fileInput  = document.getElementById(fileInputId);
    const dropZone   = document.getElementById(dropZoneId);
    const dropText   = document.getElementById(dropTextId);
    const optUrl     = document.getElementById(optUrlId);
    const optFile    = document.getElementById(optFileId);
    const previewImg = document.getElementById(previewImgId);

    // Guard: if any element is missing, bail silently (wrong page)
    if (!urlInput || !fileInput || !optUrl || !optFile || !previewImg) return null;

    // Attach fallback error handling to the preview image
    previewImg.addEventListener('error', () => {
        previewImg.onerror = null;
        previewImg.src = placeholder;
    });

    /* ── State helpers ─────────────────────────────────────── */
    function activateUrl() {
        optUrl.classList.add('is-active');
        optUrl.classList.remove('is-disabled');
        optFile.classList.add('is-disabled');
        optFile.classList.remove('is-active');
        fileInput.value = '';
        if (dropText) dropText.textContent = defaultDropText;
    }

    function activateFile() {
        optFile.classList.add('is-active');
        optFile.classList.remove('is-disabled');
        optUrl.classList.add('is-disabled');
        optUrl.classList.remove('is-active');
        urlInput.value = '';
    }

    function resetOptions() {
        [optUrl, optFile].forEach(el => el.classList.remove('is-active', 'is-disabled'));
    }

    /* ── Preview helpers ───────────────────────────────────── */
    function previewUrl(url) {
        previewImg.src = url || placeholder;
    }

    function previewFile(file) {
        const reader = new FileReader();
        reader.onload = e => { previewImg.src = e.target.result; };
        reader.readAsDataURL(file);
    }

    /* ── Event: URL input ──────────────────────────────────── */
    urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim();
        if (val) {
            activateUrl();
            previewUrl(val);
        } else {
            resetOptions();
            previewUrl(placeholder);
        }
    });

    /* ── Event: file input change ──────────────────────────── */
    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            activateFile();
            if (dropText) dropText.textContent = `📎 ${file.name}`;
            previewFile(file);
        } else {
            resetOptions();
        }
    });

    /* ── Event: drag-and-drop ──────────────────────────────── */
    if (dropZone) {
        dropZone.addEventListener('dragover', e => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                if (dropText) dropText.textContent = `📎 ${file.name}`;
                activateFile();
                previewFile(file);
            }
        });
    }

    /* ── Public API ────────────────────────────────────────── */
    return {
        /** Reset picker to its default state (call on form reset). */
        reset() {
            resetOptions();
            fileInput.value = '';
            urlInput.value  = '';
            if (dropText) dropText.textContent = defaultDropText;
            previewImg.src = placeholder;
        },
    };
}
