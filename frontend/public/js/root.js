// ── Live data hydrated via CacheManager ─────────────────────────────────────
let productos = [];

const catalogoDiv = document.getElementById('catalogo');
const botonesGenero = document.querySelectorAll('#filtros-genero .btn-genero');
const botonesCategoria = document.querySelectorAll('#filtros-categoria .btn-filtro');
const indicadorSpan = document.getElementById('filtro-indicador');
const btnSync = document.getElementById('btn-sync');

let generoActual = 'todos';
let categoriaActual = 'todos';

function actualizarIndicador() {
    let texto = '';
    if (generoActual !== 'todos') {
        let generoTexto = '';
        if (generoActual === 'masculino') generoTexto = '👨 Hombre';
        else if (generoActual === 'femenino') generoTexto = '👩 Mujer';
        else if (generoActual === 'unisex') generoTexto = '♾️ Unisex';
        else if (generoActual === 'nino') generoTexto = '🧒 Niño';
        else if (generoActual === 'nina') generoTexto = '👧 Niña';
        texto += `Género: ${generoTexto}`;
    }
    if (categoriaActual !== 'todos') {
        if (texto) texto += ' · ';
        let catMostrar = '';
        if (categoriaActual === 'Tenis') catMostrar = '👟 Tenis';
        else if (categoriaActual === 'ropa') catMostrar = '👕 Ropa';
        else if (categoriaActual === 'accesorios') catMostrar = '🕶️ Accesorios';
        else if (categoriaActual === 'hogar') catMostrar = '🏠 Hogar';
        texto += `Categoría: ${catMostrar}`;
    }
    if (texto === '') texto = 'Mostrando todos los productos';
    indicadorSpan.textContent = texto;
}

function obtenerProductosFiltrados() {
    let filtrados = productos;
    if (generoActual !== 'todos') {
        filtrados = filtrados.filter(p => p.genero === generoActual);
    }
    if (categoriaActual !== 'todos') {
        filtrados = filtrados.filter(p => p.categoria === categoriaActual);
    }
    return filtrados;
}

// Lightbox: función para abrir imagen en modal
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

// Función para manejar la carga elegante de imágenes
function handleImageLoading(imgElement) {
    if (imgElement.complete) {
        imgElement.classList.add('loaded');
    } else {
        imgElement.addEventListener('load', () => {
            imgElement.classList.add('loaded');
        });
        imgElement.addEventListener('error', () => {
            imgElement.onerror = null;
            imgElement.src = '/images/placeholder.svg';
            imgElement.classList.add('loaded');
        });
    }
}

function mostrarProductos() {
    const productosFiltrados = obtenerProductosFiltrados();
    catalogoDiv.innerHTML = '';

    if (productosFiltrados.length === 0) {
        catalogoDiv.innerHTML = `<div class="no-results">😕 No hay productos con estos filtros.<br>Prueba con otra combinación de género o categoría.</div>`;
        return;
    }

    productosFiltrados.forEach(producto => {
        let generoClase = '';
        let generoMostrar = '';
        switch (producto.genero) {
            case 'masculino': generoClase = 'masculino'; generoMostrar = '👨 Hombre'; break;
            case 'femenino': generoClase = 'femenino'; generoMostrar = '👩 Mujer'; break;
            case 'unisex': generoClase = 'unisex'; generoMostrar = '♾️ Unisex'; break;
            case 'nino': generoClase = 'nino'; generoMostrar = '🧒 Niño'; break;
            case 'nina': generoClase = 'nina'; generoMostrar = '👧 Niña'; break;
            default: generoClase = 'unisex'; generoMostrar = '♾️ Unisex';
        }

        let catEmoji = '';
        if (producto.categoria === 'ropa') catEmoji = '👕';
        else if (producto.categoria === 'accesorios') catEmoji = '🕶️';
        else if (producto.categoria === 'Tenis') catEmoji = '👟';
        else if (producto.categoria === 'hogar') catEmoji = '🏠';

        const whatsappMsg = `Hola, me interesa: ${producto.nombre} - ${producto.descripcion.substring(0, 80)}`;

        catalogoDiv.innerHTML += `
                    <div class="producto">
                        <div class="producto-img-wrapper">
                            <img src="${producto.imagen ? producto.imagen : '/images/placeholder.svg'}" alt="${producto.nombre}" loading="lazy">
                            <div class="gender-badge ${generoClase}">${generoMostrar}</div>
                        </div>
                        <div class="info">
                            <h3>${producto.nombre}</h3>
                            <p class="descripcion">${producto.descripcion}</p>
                            <span class="categoria-tag">${catEmoji} ${producto.categoria.charAt(0).toUpperCase() + producto.categoria.slice(1)}</span>
                            <a href="https://wa.me/524493433516?text=${encodeURIComponent(whatsappMsg)}" 
                               class="whatsapp-btn" 
                               target="_blank" rel="noopener noreferrer">
                                💬 Consultar por WhatsApp
                            </a>
                        </div>
                    </div>
                `;
    });

    // Aplicar efectos de carga y lightbox a las imágenes recién agregadas
    const imagenes = document.querySelectorAll('.producto img');
    imagenes.forEach(img => {
        handleImageLoading(img);
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirLightbox(img.src);
        });
    });
}

function refrescarCatalogo() {
    mostrarProductos();
    actualizarIndicador();
}

// Eventos para género
botonesGenero.forEach(boton => {
    boton.addEventListener('click', () => {
        botonesGenero.forEach(b => b.classList.remove('active'));
        boton.classList.add('active');
        generoActual = boton.dataset.genero;
        refrescarCatalogo();
    });
});

// Eventos para categoría
botonesCategoria.forEach(boton => {
    boton.addEventListener('click', () => {
        botonesCategoria.forEach(b => b.classList.remove('active'));
        boton.classList.add('active');
        categoriaActual = boton.dataset.categoria;
        refrescarCatalogo();
    });
});

// Evento de Sincronización Manual
if (btnSync) {
    btnSync.addEventListener('click', async () => {
        btnSync.disabled = true;
        btnSync.textContent = '⏳ ...';
        
        // Forzamos a que ignore la versión/TTL
        productos = await window.cacheManager.syncNow();
        
        btnSync.textContent = '✅ Listo';
        setTimeout(() => { 
            btnSync.disabled = false;
            btnSync.textContent = '🔄 Sincronizar'; 
        }, 2000);
        
        refrescarCatalogo();
    });
}

// Botón "Scroll to Bottom"
const scrollBtn = document.createElement('button');
scrollBtn.id = 'scroll-to-bottom';
scrollBtn.innerHTML = '⬇️';
scrollBtn.title = 'Ir al final';
document.body.appendChild(scrollBtn);

scrollBtn.addEventListener('click', () => {
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth' /* Scroll elegante a la parte inferior */
    });
});

// Init Function
async function initStore() {
    catalogoDiv.innerHTML = '<div class="no-results" style="padding: 40px;">Cargando catálogo... ⏳</div>';
    productos = await window.cacheManager.fetchItems();
    if (!productos) productos = [];
    refrescarCatalogo();
}

// Iniciar
initStore();
