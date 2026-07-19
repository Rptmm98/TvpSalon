/* =========================================
   REGISTRO DEL SERVICE WORKER (PWA)
   ========================================= */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registrado con éxito:', reg.scope))
            .catch(err => console.error('Error al registrar SW:', err));
    });
}

/* =========================================
   CONFIGURACIÓN FIREBASE Y MULTITENANT
   ========================================= */
const firebaseConfig = {
    apiKey: "AIzaSyBO2k94v_ny0VzkdmDHvNG2Ar-wW8XtkrA",
    authDomain: "tpvbloom.firebaseapp.com",
    projectId: "tpvbloom",
    storageBucket: "tpvbloom.firebasestorage.app",
    messagingSenderId: "24857045028",
    appId: "1:24857045028:web:6891597b4d93535815d0b1",
    measurementId: "G-012YPNPL4D"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// INICIALIZAR APP SECUNDARIA (Para crear usuarios sin cerrar la sesión del SuperAdmin)
let secondaryApp;
try {
    secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
} catch (e) {
    secondaryApp = firebase.app("Secondary");
}
const secondaryAuth = secondaryApp.auth();
secondaryAuth.setPersistence(firebase.auth.Auth.Persistence.NONE); // Evitar conflictos de sesión

// 🛑 REGLA ARQUITECTÓNICA: Variables de sesión dinámicas
let CURRENT_TENANT_ID = null; 
let CURRENT_USER_ROLE = null;

let unsubscribeEstilistas = null;
let unsubscribeVentas = null;
let unsubscribeAgenda = null;

/* =========================================
   CONTROLADOR DEL MODAL NATIVO
   ========================================= */
const Modal = {
    element: document.getElementById('custom-modal'),
    title: document.getElementById('modal-title'),
    message: document.getElementById('modal-message'),
    btnConfirm: document.getElementById('modal-confirm'),
    btnCancel: document.getElementById('modal-cancel'),
    
    show(title, message, onConfirm) {
        this.title.textContent = title;
        this.message.textContent = message;
        this.element.style.display = 'flex';
        
        this.btnConfirm.onclick = () => {
            this.close();
            if(onConfirm) onConfirm();
        };
        this.btnCancel.onclick = () => this.close();
    },
    
    close() {
        this.element.style.display = 'none';
    }
};

/* =========================================
   CONTROL DE SESIÓN (LOGIN Y AUTH)
   ========================================= */
const uiLogin = document.getElementById('login-section');
const uiDashboard = document.getElementById('main-dashboard');
const uiSuperAdmin = document.getElementById('superadmin-section');
const uiRegister = document.getElementById('register-section');
const registerSubtitle = document.getElementById('register-subtitle');
const btnRegister = document.getElementById('btn-register');
const btnCancelRegister = document.getElementById('btn-cancel-register');
const uiUserInfo = document.getElementById('user-info');
const uiHeaderSalonName = document.getElementById('header-salon-name');
const uiAdminTools = document.getElementById('admin-tools');
const btnAbrirTpv = document.getElementById('btn-abrir-tpv');
const btnLogin = document.getElementById('btn-login');
const togglePassword = document.getElementById('toggle-password');
const btnLogout = document.getElementById('btn-logout');
const btnBackSuperAdmin = document.getElementById('btn-back-superadmin');
const btnCreateSalon = document.getElementById('btn-create-salon');
const modalCreateSalon = document.getElementById('create-salon-modal');
const btnCancelSalon = document.getElementById('create-salon-cancel');
const btnConfirmSalon = document.getElementById('create-salon-confirm');

// Referencias Modales de Gestión (Admin)
const btnAdminCatalog = document.getElementById('btn-admin-catalog');
const btnAdminClients = document.getElementById('btn-admin-clients');
const modalCatalog = document.getElementById('catalog-modal');
const modalClient = document.getElementById('client-modal');
const btnAdminReports = document.getElementById('btn-admin-reports');
const btnAdminCommissions = document.getElementById('btn-admin-commissions');
const btnAdminEstilistaManual = document.getElementById('btn-admin-estilista');

const modalCatalogList = document.getElementById('catalog-list-modal');
const catalogListContainer = document.getElementById('catalog-list-container');
const btnNewCatalogItem = document.getElementById('btn-new-catalog-item');
const btnCloseCatalogList = document.getElementById('btn-close-catalog-list');
let EDITING_CATALOG_ID = null;
let CACHED_CATALOG = {};

const modalCaja = document.getElementById('caja-modal');
const cajaBody = document.getElementById('caja-body');
const btnCajaAction = document.getElementById('btn-caja-action');
let CAJA_ACTUAL_ID = null;

const modalComisiones = document.getElementById('comisiones-modal');
const comisionesBody = document.getElementById('comisiones-body');

// Lógica dinámica del formulario de Catálogo
const catTipo = document.getElementById('cat-tipo');
const catServicioFields = document.getElementById('cat-servicio-fields');
const catProductoFields = document.getElementById('cat-producto-fields');
catTipo.addEventListener('change', (e) => {
    catServicioFields.style.display = e.target.value === 'servicio' ? 'block' : 'none';
    catProductoFields.style.display = e.target.value !== 'servicio' ? 'block' : 'none';
});

// Variables temporales para el registro
let INVITATION_TENANT_ID = null;
let INVITATION_TOKEN_ID = null;
let IS_REGISTERING = false;

// Escuchar cambios en el estado de autenticación
auth.onAuthStateChanged(async (user) => {
    if (IS_REGISTERING) return; // Previene un falso deslogueo durante la creación de usuario

    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    if (inviteToken && !user) return handleInvitation(inviteToken);

    if (user) {
        try {
            // 🌟 BYPASS PARA SUPER ADMIN FIJO 🌟
            if (user.email === "bagp1234@gmail.com") {
                CURRENT_TENANT_ID = "ALL";
                CURRENT_USER_ROLE = "superadmin";
                
                // Nos aseguramos de que tu documento de SuperAdmin exista y se auto-repare
                await db.collection("users").doc(user.uid).set({
                    nombre: "Super Admin Fijo",
                    role: "superadmin",
                    tenantId: "ALL"
                }, { merge: true }).catch(e => console.warn("Permiso Firestore pendiente", e));
                
                uiLogin.style.display = 'none';
                const mainHeader = document.getElementById('main-header');
                if (mainHeader) mainHeader.style.display = 'flex';
                btnLogout.style.display = 'block';
                uiUserInfo.textContent = `SuperAdmin View - Control Total`;
                uiDashboard.style.display = 'none';
                uiSuperAdmin.style.display = 'block';
                return cargarSuperAdminDashboard(); // Terminamos aquí, forzando la vista Global
            }

            // 1. Buscar perfil del usuario en Firestore para extraer permisos y Salón
            const userDoc = await db.collection("users").doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                CURRENT_TENANT_ID = userData.tenantId;
                CURRENT_USER_ROLE = userData.role;
                
                // Configurar UI
                uiLogin.style.display = 'none';
                const mainHeader = document.getElementById('main-header');
                if (mainHeader) mainHeader.style.display = 'flex';
                btnLogout.style.display = 'block';

                if (CURRENT_USER_ROLE === "superadmin" || CURRENT_TENANT_ID === "ALL") {
                    uiUserInfo.textContent = `SuperAdmin View - Control Total`;
                    uiDashboard.style.display = 'none';
                    uiSuperAdmin.style.display = 'block';
                    cargarSuperAdminDashboard();
                } else {
                    uiUserInfo.textContent = `${userData.nombre} (${CURRENT_USER_ROLE})`;
                    uiSuperAdmin.style.display = 'none';
                    uiDashboard.style.display = 'block';
                    if (btnAbrirTpv) btnAbrirTpv.style.display = 'block';
                    const uiMainNav = document.getElementById('main-nav');
                    if (uiMainNav) uiMainNav.style.display = 'flex';
                    actualizarNombreSalon(CURRENT_TENANT_ID, userData);
                    
                    if (CURRENT_USER_ROLE === 'admin') {
                        if (uiAdminTools) uiAdminTools.style.display = 'block';
                        const scEstilista = document.getElementById('admin-shortcut-estilista');
                        if (scEstilista) scEstilista.style.display = 'block';
                    } else {
                        if (uiAdminTools) uiAdminTools.style.display = 'none';
                        const scEstilista = document.getElementById('admin-shortcut-estilista');
                        if (scEstilista) scEstilista.style.display = 'none';
                    }
                    iniciarEscuchas();
                }
            } else {
                auth.signOut();
                Modal.show("Acceso Denegado", "Tu usuario no está registrado en el directorio del sistema Bloom.", null);
            }
        } catch (error) {
            console.error("Error al obtener perfil:", error);
            Modal.show("Error", "No se pudo conectar a la base de usuarios.", null);
        }
    } else {
        // Sesión cerrada
        CURRENT_TENANT_ID = null;
        CURRENT_USER_ROLE = null;
        uiLogin.style.display = 'flex';
        const mainHeader = document.getElementById('main-header');
        if (mainHeader) mainHeader.style.display = 'none';
        const uiMainNav = document.getElementById('main-nav');
        if (uiMainNav) uiMainNav.style.display = 'none';
        uiDashboard.style.display = 'none';
        uiSuperAdmin.style.display = 'none';
        btnLogout.style.display = 'none';
        if (btnAbrirTpv) btnAbrirTpv.style.display = 'none';
        if (uiAdminTools) uiAdminTools.style.display = 'none';
        btnBackSuperAdmin.style.display = 'none';
        uiUserInfo.textContent = 'No autenticado';
        if (uiHeaderSalonName) uiHeaderSalonName.textContent = 'Bloom Salón';
        document.title = 'Bloom Salón Cloud';
        detenerEscuchas();
    }
});

// Muestra el nombre real del salón (tenant) en el header en vez del texto fijo "Bloom Salón",
// para que cada salón que use el sistema vea su propia marca.
async function actualizarNombreSalon(tenantId, userData) {
    if (!uiHeaderSalonName || !tenantId) return;
    let nombreSalon = userData && userData.role === 'admin' ? userData.nombre : null;
    if (!nombreSalon) {
        try {
            const adminSnap = await db.collection("users")
                .where("tenantId", "==", tenantId)
                .where("role", "==", "admin")
                .limit(1)
                .get();
            nombreSalon = adminSnap.empty ? null : adminSnap.docs[0].data().nombre;
        } catch (error) {
            console.warn("No se pudo obtener el nombre del salón:", error);
        }
    }
    uiHeaderSalonName.textContent = nombreSalon || 'Mi Salón';
    document.title = `${nombreSalon || 'Mi Salón'} — TPV`;
}

btnLogin.addEventListener('click', () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    if (!email || !pass) return Modal.show("Aviso", "Por favor ingresa correo y contraseña", null);
    
    btnLogin.textContent = "Cargando...";
    auth.signInWithEmailAndPassword(email, pass)
        .catch(error => Modal.show("Error de Inicio", error.message, null))
        .finally(() => btnLogin.textContent = "Ingresar");
});

togglePassword?.addEventListener('click', () => {
    const passInput = document.getElementById('login-password');
    if (passInput.type === 'password') {
        passInput.type = 'text';
    } else {
        passInput.type = 'password';
    }
});

btnLogout.addEventListener('click', () => auth.signOut());

/* =========================================
   MÓDULO DE REGISTRO (Empleadas Invitadas)
   ========================================= */
btnRegister.addEventListener('click', async () => {
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const pass = document.getElementById('register-password').value;

    if (!name || !email || !pass) return Modal.show("Aviso", "Por favor completa todos los campos.", null);
    if (pass.length < 6) return Modal.show("Aviso", "La contraseña debe tener al menos 6 caracteres.", null);

    IS_REGISTERING = true;
    btnRegister.textContent = "Registrando...";
    btnRegister.disabled = true;

    try {
        // 1. Crear usuario en Auth
        const userCred = await auth.createUserWithEmailAndPassword(email, pass);
        
        // 2. Crear documento de perfil
        await db.collection("users").doc(userCred.user.uid).set({
            nombre: name,
            role: "empleado",
            tenantId: INVITATION_TENANT_ID
        });

        // 3. Marcar invitación como usada
        await db.collection("invitaciones").doc(INVITATION_TOKEN_ID).update({ used: true });

        window.location.replace('./'); // Refrescar para inicializar todo limpiamente
    } catch (error) {
        console.error("Error en registro:", error);
        IS_REGISTERING = false;
        btnRegister.textContent = "Completar Registro";
        btnRegister.disabled = false;
        Modal.show("Error al registrar", error.message, null);
    }
});

btnCancelRegister.addEventListener('click', () => window.location.replace('./'));

/* =========================================
   MÓDULO TPV (Punto de Venta)
   ========================================= */
const TPV = {
    modal: document.getElementById('modulo-tpv'),
    stylistSelect: document.getElementById('tpv-estilista'),
    clientSelect: document.getElementById('tpv-clienta'),
    cartContainer: document.getElementById('tpv-carrito'),
    totalDisplay: document.getElementById('tpv-total'),
    paymentMethodSelect: document.getElementById('tpv-metodo-pago'),
    btnConfirm: document.getElementById('tpv-confirm'),
    fullCatalog: [],
    cart: [],
    
    async open() {
        if (!CURRENT_TENANT_ID) return Modal.show("Error", "No se ha identificado un salón.", null);
        this.reset();
        await this.loadData();
        const tpvTab = document.querySelector('[data-tab="modulo-tpv"]');
        if (tpvTab) tpvTab.click();
    },
    close() { this.reset(); },
    reset() {
        this.cart = []; this.fullCatalog = [];
        if (this.stylistSelect) this.stylistSelect.innerHTML = '<option value="">Asignar profesional...</option>';
        if (this.clientSelect) this.clientSelect.value = '';
        this.renderCart();
    },
    async openWithPreload(stylistId, serviceId) {
        await this.open();
        if (this.stylistSelect) this.stylistSelect.value = stylistId;
        const item = this.fullCatalog.find(i => i.id === serviceId);
        if (item) {
            this.addToCart(serviceId, item.precio);
        }
    },
    async loadData() {
        if (!this.stylistSelect) return;
        const stylistsSnapshot = await db.collection("estilistas_turnos").where("tenantId", "==", CURRENT_TENANT_ID).get();
        this.stylistSelect.innerHTML = '<option value="">Asignar profesional...</option>';
        stylistsSnapshot.forEach(doc => {
            const stylist = doc.data();
            this.stylistSelect.innerHTML += `<option value="${doc.id}" data-name="${stylist.nombre}">${stylist.nombre}</option>`;
        });

        const clientsSnapshot = await db.collection("clientes").where("tenantId", "==", CURRENT_TENANT_ID).get();
        if (this.clientSelect) {
            this.clientSelect.innerHTML = '<option value="">Cliente Ocasional / Sin registrar...</option>';
            clientsSnapshot.forEach(doc => {
                const client = doc.data();
                this.clientSelect.innerHTML += `<option value="${doc.id}">${client.nombre}</option>`;
            });
        }

        const catalogSnapshot = await db.collection("articulos_salones").where("tenantId", "==", CURRENT_TENANT_ID).get();
        const grid = document.getElementById('tpv-catalog-grid');
        if (grid) grid.innerHTML = '';
        this.fullCatalog = [];
        
        catalogSnapshot.forEach(doc => {
            const item = doc.data();
            if (item.tipo === 'interno') return; // Oculta insumos internos en la TPV
            this.fullCatalog.push({ id: doc.id, ...item });
            
            if (grid) {
                const btn = document.createElement('button');
                btn.className = 'btn-outline';
                btn.style.cssText = "display:flex; flex-direction:column; padding:12px; align-items:flex-start; text-align:left; justify-content:center; min-height:80px; width:100%; border:1px solid #334155; background:var(--card-bg);";
                btn.innerHTML = `<strong style="color:var(--text-main); font-size:0.85rem; line-height:1.2;">${item.nombre}</strong><span class="text-sm" style="color:var(--success); margin-top:4px;">$${item.precio.toFixed(2)}</span>`;
                btn.onclick = () => this.addToCart(doc.id, item.precio);
                grid.appendChild(btn);
            }
        });
    },
    addToCart(itemId, customPrice) {
        const item = this.fullCatalog.find(i => i.id === itemId);
        if (item) { this.cart.push({ ...item, precio: customPrice }); this.renderCart(); }
    },
    removeFromCart(index) { this.cart.splice(index, 1); this.renderCart(); },
    renderCart() {
        if (!this.cartContainer) return;
        if (this.cart.length === 0) {
            this.cartContainer.innerHTML = '<p class="text-sm text-center" style="padding: 20px 0;">El carrito está vacío.</p>';
            if (this.totalDisplay) this.totalDisplay.textContent = '$0.00'; 
            return;
        }
        this.cartContainer.innerHTML = '';
        let total = 0;
        this.cart.forEach((item, index) => {
            total += item.precio;
            this.cartContainer.innerHTML += `
                <div class="cart-item">
                    <span class="cart-item-name" style="font-size:0.85rem;">${item.nombre}</span>
                    <span class="cart-item-price" style="font-size:0.85rem;">$${item.precio.toFixed(2)}</span>
                    <button class="cart-item-remove" onclick="TPV.removeFromCart(${index})">&times;</button>
                </div>`;
        });
        if (this.totalDisplay) this.totalDisplay.textContent = `$${total.toFixed(2)}`;
    },
    async finalizeSale() {
        const stylistId = this.stylistSelect.value;
        const selectedOption = this.stylistSelect.options[this.stylistSelect.selectedIndex];
        const stylistName = selectedOption ? selectedOption.dataset.name : 'N/A';
        
        const clientId = this.clientSelect ? this.clientSelect.value : null;
        const selectedClientOption = this.clientSelect ? this.clientSelect.options[this.clientSelect.selectedIndex] : null;
        const clientName = (clientId && selectedClientOption) ? selectedClientOption.text : 'Mostrador / Ocasional';

        if (!stylistId) return Modal.show("Faltan Datos", "Debes seleccionar la estilista que realizó el servicio.", null);
        if (this.cart.length === 0) return Modal.show("Venta Vacía", "Debes agregar al menos un artículo.", null);

        const total = this.cart.reduce((sum, item) => sum + item.precio, 0);
        const saleData = {
            tenantId: CURRENT_TENANT_ID, createdByUid: auth.currentUser.uid,
            estilistaId: stylistId, estilistaNombre: stylistName,
            clientId: clientId || null,
            clientName: clientName,
            items: this.cart, total: total, metodoPago: this.paymentMethodSelect.value,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        };

        this.btnConfirm.textContent = "Guardando...";
        try {
            // Utilizamos un Batch para guardar la venta y descontar stock al mismo tiempo
            const batch = db.batch();
            const saleRef = db.collection("ventas").doc();
            batch.set(saleRef, saleData);
            
            this.cart.forEach(item => {
                if (item.tipo === 'reventa') {
                    const itemRef = db.collection("articulos_salones").doc(item.id);
                    batch.update(itemRef, { stock: firebase.firestore.FieldValue.increment(-1) });
                }
            });
            
            // Actualizar total gastado del cliente
            if (clientId) {
                const clientRef = db.collection("clientes").doc(clientId);
                batch.update(clientRef, { gastado: firebase.firestore.FieldValue.increment(total) });
            }
            
            // Liberar a la estilista automáticamente al finalizar la venta
            const stylistRef = db.collection("estilistas_turnos").doc(stylistId);
            batch.update(stylistRef, { estado: 'libre', ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp() });

            await batch.commit();
            Modal.show("Éxito", "Venta registrada con éxito.", null);
            this.reset();
            this.loadData();
        } catch (error) {
            console.error("Error al guardar la venta:", error);
            Modal.show("Error de Red", "No se pudo registrar la venta. Revisa tu conexión.", null);
        } finally {
            this.btnConfirm.textContent = "Finalizar Venta";
        }
    },
    init() {
        this.btnConfirm.addEventListener('click', () => this.finalizeSale());
    }
};

document.addEventListener('DOMContentLoaded', () => {
    TPV.init();
});

/* =========================================
   MÓDULO DE AGENDA Y CITAS
   ========================================= */
const Agenda = {
    modal: document.getElementById('agenda-modal'),
    clientSelect: document.getElementById('agd-clienta'),
    stylistSelect: document.getElementById('agd-estilista'),
    serviceSelect: document.getElementById('agd-servicio'),
    timeInput: document.getElementById('agd-hora'),
    dateInput: document.getElementById('agd-fecha'),
    btnOpen: document.getElementById('btn-abrir-agenda'),
    btnCancel: document.getElementById('btn-agd-cancel'),
    btnSave: document.getElementById('btn-agd-save'),

    async open() {
        if (!CURRENT_TENANT_ID) return;
        this.clientSelect.innerHTML = '<option value="">Cargando...</option>';
        this.stylistSelect.innerHTML = '<option value="">Cargando...</option>';
        this.serviceSelect.innerHTML = '<option value="">Cargando...</option>';
        this.timeInput.value = '';
        
        // Colocar la fecha de hoy por defecto en el campo de fecha
        const localDate = new Date();
        this.dateInput.value = localDate.toISOString().split('T')[0];

        this.modal.style.display = 'flex';
        
        // Cargar datos
        const [clients, stylists, services] = await Promise.all([
            db.collection("clientes").where("tenantId", "==", CURRENT_TENANT_ID).get(),
            db.collection("estilistas_turnos").where("tenantId", "==", CURRENT_TENANT_ID).get(),
            db.collection("articulos_salones").where("tenantId", "==", CURRENT_TENANT_ID).where("tipo", "==", "servicio").get()
        ]);

        this.clientSelect.innerHTML = '<option value="">Seleccione una clienta</option>';
        clients.forEach(c => this.clientSelect.innerHTML += `<option value="${c.id}" data-name="${c.data().nombre}" data-phone="${c.data().telefono || ''}">${c.data().nombre} (${c.data().telefono})</option>`);
        
        this.stylistSelect.innerHTML = '<option value="">Seleccione profesional</option>';
        stylists.forEach(s => this.stylistSelect.innerHTML += `<option value="${s.id}" data-name="${s.data().nombre}">${s.data().nombre}</option>`);
        
        this.serviceSelect.innerHTML = '<option value="">Seleccione servicio</option>';
        services.forEach(s => this.serviceSelect.innerHTML += `<option value="${s.id}" data-name="${s.data().nombre}">${s.data().nombre} ($${s.data().precio})</option>`);
    },
    
    async save() {
        const clientId = this.clientSelect.value;
        const stylistId = this.stylistSelect.value;
        const serviceId = this.serviceSelect.value;
        const time = this.timeInput.value;
        const dateVal = this.dateInput.value;

        if (!clientId || !stylistId || !serviceId || !time || !dateVal) return Modal.show("Aviso", "Todos los campos son obligatorios.", null);

        const [year, month, day] = dateVal.split('-');
        const [hours, minutes] = time.split(':');
        const appointmentDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
        
        // Determinar si la cita es para el día actual
        const today = new Date();
        const isToday = appointmentDate.getDate() === today.getDate() &&
                        appointmentDate.getMonth() === today.getMonth() &&
                        appointmentDate.getFullYear() === today.getFullYear();

        try {
            // Usamos un Batch para agendar la cita y ocupar a la estilista a la vez
            const batch = db.batch();
            const citaRef = db.collection("citas").doc();
            batch.set(citaRef, {
                tenantId: CURRENT_TENANT_ID, clientId, stylistId, serviceId,
                clientName: this.clientSelect.options[this.clientSelect.selectedIndex].dataset.name,
                clientPhone: this.clientSelect.options[this.clientSelect.selectedIndex].dataset.phone || '',
                stylistName: this.stylistSelect.options[this.stylistSelect.selectedIndex].dataset.name,
                serviceName: this.serviceSelect.options[this.serviceSelect.selectedIndex].dataset.name,
                fechaHora: firebase.firestore.Timestamp.fromDate(appointmentDate),
                estado: 'pendiente'
            });
            
            // Solo ocupar a la empleada si la reserva es para hoy
            if (isToday) {
                const estilistaRef = db.collection("estilistas_turnos").doc(stylistId);
                batch.update(estilistaRef, { estado: 'ocupada', ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp() });
            }
            
            await batch.commit();
            this.modal.style.display = 'none';
        } catch (e) { Modal.show("Error", "No se pudo agendar la cita.", null); }
    },
    
    init() {
        this.btnOpen.addEventListener('click', () => this.open());
        this.btnCancel.addEventListener('click', () => this.modal.style.display = 'none');
        this.btnSave.addEventListener('click', () => this.save());
    }
};

document.addEventListener('DOMContentLoaded', () => {
    TPV.init();
    Agenda.init();
});

/* =========================================
   MÓDULO: SUPERADMIN (Selección de Salones)
   ========================================= */
async function cargarSuperAdminDashboard() {
    cargarSalones();
    cargarInvitacionesGlobales();
    cargarKpisGlobales();
}

async function cargarSalones() {
    const contenedor = document.getElementById('lista-salones');
    contenedor.innerHTML = '<p class="text-sm">Buscando salones...</p>';
    
    try {
        // Buscamos a todos los usuarios con rol 'admin' (Dueñas de salón)
        const snapshot = await db.collection("users").where("role", "==", "admin").get();
        
        if (snapshot.empty) {
            return contenedor.innerHTML = '<p class="text-sm">No hay salones registrados en la base de datos.</p>';
        }

        contenedor.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            contenedor.innerHTML += `
                <div class="card">
                    <div class="card-info" style="cursor: pointer; flex: 1;" onclick="inspeccionarSalon('${data.tenantId}', '${data.nombre}')">
                        <p><strong>${data.nombre}</strong></p>
                        <p class="text-sm">ID: ${data.tenantId} ${data.email ? '<br>✉️ ' + data.email : ''}</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-secondary" onclick="inspeccionarSalon('${data.tenantId}', '${data.nombre}')">Ver</button>
                        <button class="btn-outline" style="color: var(--danger); border-color: var(--danger); padding: 0 10px; min-width: 44px;" onclick="eliminarSalon('${doc.id}', '${data.nombre}')">X</button>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error cargando salones:", error);
        contenedor.innerHTML = '<p class="text-sm" style="color: var(--danger);">Error al conectar con el directorio.</p>';
    }
}

window.eliminarSalon = function(userId, nombre) {
    Modal.show("Deshabilitar Salón", `¿Estás seguro de remover el acceso del salón '${nombre}'? Esto revocará el acceso de la dueña al sistema.`, async () => {
        try {
            await db.collection("users").doc(userId).delete();
            cargarSalones();
        } catch (error) {
            console.error("Error eliminando salón:", error);
            Modal.show("Error", "No tienes permisos para realizar esta acción.", null);
        }
    });
};

window.inspeccionarSalon = function(tenantId, nombre) {
    CURRENT_TENANT_ID = tenantId;
    uiSuperAdmin.style.display = 'none';
    uiDashboard.style.display = 'block';
    btnBackSuperAdmin.style.display = 'block';
    if (btnAbrirTpv) btnAbrirTpv.style.display = 'none'; // SuperAdmin solo inspecciona, no vende.
    const uiMainNav = document.getElementById('main-nav');
    if (uiMainNav) uiMainNav.style.display = 'flex';
    uiUserInfo.textContent = `Inspeccionando: ${nombre}`;
    if (uiHeaderSalonName) uiHeaderSalonName.textContent = nombre;
    document.title = `${nombre} — TPV`;
    const scEstilista = document.getElementById('admin-shortcut-estilista');
    if (scEstilista) scEstilista.style.display = 'block';
    iniciarEscuchas();
};

btnBackSuperAdmin.addEventListener('click', () => {
    detenerEscuchas();
    CURRENT_TENANT_ID = "ALL";
    uiDashboard.style.display = 'none';
    const uiMainNav = document.getElementById('main-nav');
    if (uiMainNav) uiMainNav.style.display = 'none';
    uiSuperAdmin.style.display = 'block';
    btnBackSuperAdmin.style.display = 'none';
    if (btnAbrirTpv) btnAbrirTpv.style.display = 'none';
    uiUserInfo.textContent = 'SuperAdmin View - Control Total';
    cargarSuperAdminDashboard();
});

async function cargarInvitacionesGlobales() {
    const tableBody = document.getElementById('table-invitaciones-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-sm text-center">Cargando...</td></tr>';
    
    try {
        const snap = await db.collection("invitaciones").get();
        if (snap.empty) return tableBody.innerHTML = '<tr><td colspan="4" class="text-sm text-center">No hay invitaciones generadas.</td></tr>';
        
        let invitaciones = [];
        snap.forEach(doc => invitaciones.push({ id: doc.id, ...doc.data() }));
        invitaciones.sort((a, b) => (b.expires ? b.expires.toDate() : 0) - (a.expires ? a.expires.toDate() : 0));
        
        tableBody.innerHTML = '';
        const now = new Date();
        invitaciones.slice(0, 20).forEach(data => {
            const expDate = data.expires ? data.expires.toDate() : new Date();
            const isExpired = expDate < now;
            let status = 'Activa';
            let badgeClass = 'libre';
            
            if (data.used) {
                status = 'Usada';
                badgeClass = 'ocupada';
            } else if (isExpired) {
                status = 'Expirada';
                badgeClass = 'ocupada';
            }
            
            tableBody.innerHTML += `
                <tr>
                    <td style="font-family: monospace; font-size: 0.75rem;">${data.id.substring(0, 8)}...</td>
                    <td class="text-sm" style="color:var(--text-main);">${data.tenantId}</td>
                    <td class="text-sm">${expDate.toLocaleDateString()}</td>
                    <td><span class="badge ${badgeClass}" style="font-size: 0.6rem;">${status}</span></td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Error invitaciones", e);
        tableBody.innerHTML = '<tr><td colspan="4" class="text-sm text-center" style="color:var(--danger);">Error al cargar.</td></tr>';
    }
}

async function cargarKpisGlobales() {
    const kpiSalones = document.getElementById('sa-kpi-salones');
    const kpiUsuarios = document.getElementById('sa-kpi-usuarios');
    const kpiVentas = document.getElementById('sa-kpi-ventas');
    const chartContainer = document.getElementById('sa-chart-container');
    
    if (!kpiSalones) return;
    
    try {
        const [salonesSnap, usersSnap, ventasSnap] = await Promise.all([
            db.collection("users").where("role", "==", "admin").get(),
            db.collection("users").get(),
            db.collection("ventas").get()
        ]);
        
        kpiSalones.textContent = salonesSnap.size;
        kpiUsuarios.textContent = usersSnap.size;
        
        let totalVentas = 0;
        let ventasPorSalon = {};
        
        ventasSnap.forEach(doc => {
            const v = doc.data();
            totalVentas += (v.total || 0);
            
            const tid = v.tenantId || 'Desconocido';
            if (!ventasPorSalon[tid]) ventasPorSalon[tid] = 0;
            ventasPorSalon[tid] += (v.total || 0);
        });
        
        kpiVentas.textContent = `$${totalVentas.toFixed(0)}`;
        
        if (chartContainer) {
            chartContainer.innerHTML = '';
            const maxVenta = Math.max(...Object.values(ventasPorSalon), 1);
            
            if (Object.keys(ventasPorSalon).length === 0) {
                chartContainer.innerHTML = '<p class="text-sm">No hay datos de ventas.</p>';
            } else {
                for (const [salon, monto] of Object.entries(ventasPorSalon)) {
                    const pct = Math.round((monto / maxVenta) * 100);
                    chartContainer.innerHTML += `
                        <div style="margin-bottom: 15px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                                <span class="text-sm" style="color:var(--text-main);"><strong>${salon}</strong></span>
                                <span class="text-sm" style="color:var(--success); font-weight:bold;">$${monto.toFixed(2)}</span>
                            </div>
                            <div style="width: 100%; height: 12px; background: var(--card-bg); border-radius: 6px; box-shadow: var(--neu-in); overflow: hidden;">
                                <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, var(--fandango), var(--cyclamen)); border-radius: 6px;"></div>
                            </div>
                        </div>
                    `;
                }
            }
        }
    } catch (e) {
        console.error("Error KPIs", e);
    }
}

/* =========================================
   MÓDULO: CREAR NUEVO SALÓN (SuperAdmin)
   ========================================= */
btnCreateSalon.addEventListener('click', () => {
    document.getElementById('new-salon-name').value = '';
    document.getElementById('new-salon-tenant').value = '';
    document.getElementById('new-salon-email').value = '';
    document.getElementById('new-salon-password').value = '';
    modalCreateSalon.style.display = 'flex';
});

btnCancelSalon.addEventListener('click', () => modalCreateSalon.style.display = 'none');

btnConfirmSalon.addEventListener('click', async () => {
    const name = document.getElementById('new-salon-name').value.trim();
    const tenant = document.getElementById('new-salon-tenant').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const email = document.getElementById('new-salon-email').value.trim();
    const pass = document.getElementById('new-salon-password').value;

    if (!name || !tenant || !email || !pass) return Modal.show("Aviso", "Completa todos los campos", null);
    if (pass.length < 6) return Modal.show("Aviso", "La contraseña debe tener al menos 6 caracteres", null);

    btnConfirmSalon.textContent = "Creando...";
    btnConfirmSalon.disabled = true;

    try {
        // 1. Crear usuario en Auth (App secundaria)
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
        
        // 2. Guardar perfil y permisos en la Base de Datos
        await db.collection("users").doc(userCred.user.uid).set({
            nombre: name, role: "admin", tenantId: tenant, email: email
        });

        // 3. Crear estructuras iniciales para el sistema de ventas de esta Admin
        await Promise.all([
            db.collection("articulos_salones").add({
                tenantId: tenant, tipo: "servicio", nombre: "Corte Básico (Demo)", precio: 100.0, duracionMinutos: 30, rolRequerido: "estilista"
            }),
            db.collection("estilistas_turnos").add({
                tenantId: tenant, nombre: name + " (Dueña)", rol: "stylist", estado: "libre", ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
            }),
            db.collection("clientes").add({
                tenantId: tenant, nombre: "Cliente Mostrador", telefono: "000-000-0000", tipo: "Nueva", gastado: 0
            })
        ]);

        modalCreateSalon.style.display = 'none';
        Modal.show("Éxito", `El salón '${name}' ha sido creado exitosamente con el ID: ${tenant}`, () => cargarSalones());
    } catch (error) {
        console.error(error);
        Modal.show("Error al crear salón", error.message, null);
    } finally {
        btnConfirmSalon.textContent = "Crear Salón";
        btnConfirmSalon.disabled = false;
    }
});

/* =========================================
   MÓDULOS DE GESTIÓN (Exclusivos para el Admin del Salón)
   ========================================= */

// 1. Gestión de Catálogo e Inventario
btnAdminCatalog?.addEventListener('click', () => {
    modalCatalogList.style.display = 'flex';
    loadCatalogList();
});

btnCloseCatalogList?.addEventListener('click', () => modalCatalogList.style.display = 'none');

btnNewCatalogItem?.addEventListener('click', () => {
    EDITING_CATALOG_ID = null;
    document.getElementById('cat-nombre').value = '';
    document.getElementById('cat-precio').value = '';
    document.getElementById('cat-duracion').value = '';
    document.getElementById('cat-stock').value = '';
    document.getElementById('cat-categoria').value = 'Capilar';
    modalCatalog.style.display = 'flex';
});

document.getElementById('btn-cat-cancel').addEventListener('click', () => modalCatalog.style.display = 'none');

async function loadCatalogList() {
    const tableBody = document.getElementById('table-inventario-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-sm" style="text-align:center;">Cargando catálogo...</td></tr>';
    try {
        const snapshot = await db.collection("articulos_salones").where("tenantId", "==", CURRENT_TENANT_ID).get();
        if (snapshot.empty) return tableBody.innerHTML = '<tr><td colspan="4" class="text-sm" style="text-align:center;">El catálogo está vacío. Agrega tu primer artículo.</td></tr>';
        
        tableBody.innerHTML = '';
        CACHED_CATALOG = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            CACHED_CATALOG[doc.id] = data;
            tableBody.innerHTML += `
                <tr data-tipo="${data.tipo}">
                    <td><strong>${data.nombre}</strong><br><span class="badge" style="background:var(--slate);font-size:0.65rem;">${data.tipo.toUpperCase()} • ${data.categoria || 'GENERAL'}</span></td>
                    <td>$${data.precio.toFixed(2)}${data.tipo === 'servicio' ? '<br><span class="text-sm" style="color:var(--text-muted);">'+(data.duracionMinutos||30)+' min</span>' : ''}</td>
                    <td>${data.tipo === 'servicio' ? '<span class="text-sm">'+(data.rolRequerido||'N/A')+'</span>' : (data.stock||0) + ' ' + (data.unidadMedida||'u')}</td>
                    <td style="display:flex; gap:5px;">
                        <button class="btn-secondary" style="min-width: 32px; min-height: 32px; padding: 0 8px; font-size: 0.8rem;" onclick="editarArticulo('${doc.id}')">✏️</button>
                        <button class="btn-outline" style="min-width: 32px; min-height: 32px; padding: 0 8px; font-size: 0.8rem; color: var(--danger); border-color: var(--danger);" onclick="borrarArticulo('${doc.id}', '${data.nombre}')">🗑️</button>
                    </td>
                </tr>`;
        });
        
        const activePill = document.querySelector('.filter-pills .pill.active');
        if (activePill) activePill.click();
    } catch (e) { tableBody.innerHTML = `<tr><td colspan="4" class="text-sm" style="color:var(--danger); text-align:center;">Error al cargar.</td></tr>`; }
}

window.editarArticulo = function(id) {
    EDITING_CATALOG_ID = id;
    const data = CACHED_CATALOG[id];
    document.getElementById('cat-tipo').value = data.tipo;
    document.getElementById('cat-nombre').value = data.nombre;
    document.getElementById('cat-precio').value = data.precio;
    document.getElementById('cat-tipo').dispatchEvent(new Event('change'));
    document.getElementById('cat-categoria').value = data.categoria || 'Capilar';

    if (data.tipo === 'servicio') {
        document.getElementById('cat-duracion').value = data.duracionMinutos || 30;
        document.getElementById('cat-rol').value = data.rolRequerido || 'estilista';
    } else {
        document.getElementById('cat-medida').value = data.unidadMedida || 'unidad';
        document.getElementById('cat-stock').value = data.stock || 0;
    }
    modalCatalog.style.display = 'flex';
};

window.borrarArticulo = function(id, nombre) {
    Modal.show("Borrar Artículo", `¿Estás segura de eliminar permanentemente '${nombre}'?`, async () => {
        try {
            await db.collection("articulos_salones").doc(id).delete();
            loadCatalogList(); // Refrescar vista
        } catch (e) { Modal.show("Error", e.message, null); }
    });
};

document.getElementById('btn-cat-save').addEventListener('click', async () => {
    const tipo = catTipo.value;
    const categoria = document.getElementById('cat-categoria').value;
    const nombre = document.getElementById('cat-nombre').value.trim();
    const precio = parseFloat(document.getElementById('cat-precio').value) || 0;
    
    if (!nombre) return Modal.show("Aviso", "El nombre es obligatorio.", null);
    if (!CURRENT_TENANT_ID || CURRENT_TENANT_ID === 'ALL') {
        return Modal.show("Aviso", "Por seguridad, debes estar operando dentro de un salón específico para agregar artículos.", null);
    }

    const articulo = {
        tenantId: CURRENT_TENANT_ID,
        tipo: tipo,
        categoria: categoria,
        nombre: nombre,
        precio: precio,
        createdByUid: auth.currentUser ? auth.currentUser.uid : 'sistema',
        fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (tipo === 'servicio') {
        articulo.duracionMinutos = parseInt(document.getElementById('cat-duracion').value) || 30;
        articulo.rolRequerido = document.getElementById('cat-rol').value;
    } else {
        articulo.unidadMedida = document.getElementById('cat-medida').value;
        articulo.stock = parseFloat(document.getElementById('cat-stock').value) || 0;
    }

    try {
        if (EDITING_CATALOG_ID) {
            await db.collection("articulos_salones").doc(EDITING_CATALOG_ID).update(articulo);
            Modal.show("Actualizado", `${nombre} actualizado correctamente.`, null);
        } else {
            await db.collection("articulos_salones").add(articulo);
            Modal.show("Guardado", `${nombre} añadido al catálogo correctamente.`, null);
        }
        modalCatalog.style.display = 'none';
        if (document.getElementById('modulo-inventario').classList.contains('active-content')) loadCatalogList();
        if (document.getElementById('modulo-tpv').classList.contains('active-content')) TPV.loadData();
    } catch (e) { Modal.show("Error", e.message, null); }
});

// 2. Gestión de Directorio de Clientes
btnAdminClients.addEventListener('click', () => {
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-telefono').value = '';
    modalClient.style.display = 'flex';
});
document.getElementById('btn-cli-cancel').addEventListener('click', () => modalClient.style.display = 'none');

document.getElementById('btn-cli-save').addEventListener('click', async () => {
    const nombre = document.getElementById('cli-nombre').value.trim();
    if (!nombre) return Modal.show("Aviso", "El nombre de la clienta es obligatorio.", null);

    try {
        await db.collection("clientes").add({
            tenantId: CURRENT_TENANT_ID, nombre: nombre,
            telefono: document.getElementById('cli-telefono').value.trim(),
            tipo: document.getElementById('cli-tipo').value, gastado: 0,
            notas: ""
        });
        modalClient.style.display = 'none';
        Modal.show("Guardado", `Clienta ${nombre} registrada con éxito.`, () => {
            if (document.getElementById('modulo-clientes').classList.contains('active-content')) loadClientsList();
        });
    } catch (e) { Modal.show("Error", e.message, null); }
});

async function loadClientsList() {
    const tableBody = document.getElementById('table-clientes-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-sm text-center">Cargando clientas...</td></tr>';
    try {
        const snapshot = await db.collection("clientes").where("tenantId", "==", CURRENT_TENANT_ID).get();
        if (snapshot.empty) return tableBody.innerHTML = '<tr><td colspan="4" class="text-sm text-center">No hay clientas registradas.</td></tr>';
        
        tableBody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            tableBody.innerHTML += `
                <tr>
                    <td><strong>${data.nombre}</strong></td>
                    <td>${data.telefono || 'N/A'}</td>
                    <td><span class="badge" style="background:var(--slate);">${data.tipo || 'Regular'}</span></td>
                    <td>$${(data.gastado || 0).toFixed(2)}</td>
                    <td>
                        <button class="btn-secondary" style="min-width: 32px; min-height: 32px; padding: 0 10px; font-size: 0.8rem;" onclick="verHistorialCliente('${doc.id}', '${data.nombre}')">Ver Historial</button>
                    </td>
                </tr>`;
        });
    } catch (e) { tableBody.innerHTML = `<tr><td colspan="4" class="text-sm text-center" style="color:var(--danger);">Error al cargar clientas.</td></tr>`; }
}

let CURRENT_VIEWING_CLIENT_ID = null;
window.verHistorialCliente = async function(clientId, clientName) {
    CURRENT_VIEWING_CLIENT_ID = clientId;
    const modal = document.getElementById('cliente-historial-modal');
    document.getElementById('historial-nombre-cliente').textContent = `Historial: ${clientName}`;
    const notasInput = document.getElementById('historial-notas-cliente');
    const listaHistorial = document.getElementById('lista-historial-ventas');
    
    notasInput.value = 'Cargando...';
    listaHistorial.innerHTML = '<p class="text-sm">Buscando historial...</p>';
    modal.style.display = 'flex';

    try {
        const clientDoc = await db.collection("clientes").doc(clientId).get();
        if (clientDoc.exists) notasInput.value = clientDoc.data().notas || '';

        const ventasSnap = await db.collection("ventas").where("tenantId", "==", CURRENT_TENANT_ID).where("clientId", "==", clientId).get();

        if (ventasSnap.empty) {
            listaHistorial.innerHTML = '<p class="text-sm">Esta clienta aún no tiene servicios registrados.</p>';
        } else {
            let ventas = [];
            ventasSnap.forEach(doc => ventas.push(doc.data()));
            ventas.sort((a, b) => (b.fecha ? b.fecha.toDate() : 0) - (a.fecha ? a.fecha.toDate() : 0));

            listaHistorial.innerHTML = '';
            ventas.forEach(venta => {
                const fecha = venta.fecha ? venta.fecha.toDate().toLocaleDateString() : 'Sin fecha';
                const itemsHtml = venta.items.map(i => `• ${i.nombre}`).join('<br>');
                listaHistorial.innerHTML += `
                    <div class="card" style="margin-bottom: 10px; display: block; padding: 10px; box-shadow:none; border: 1px solid var(--slate);">
                        <div style="display:flex; justify-content:space-between; margin-bottom: 5px;">
                            <span class="text-sm" style="color:var(--fandango); font-weight:bold;">${fecha}</span>
                            <span class="text-sm">Por: ${venta.estilistaNombre}</span>
                        </div>
                        <p style="font-size: 0.85rem; color:var(--text-main); line-height: 1.4;">${itemsHtml}</p>
                    </div>`;
            });
        }
    } catch (e) {
        listaHistorial.innerHTML = '<p class="text-sm" style="color:var(--danger)">Error al cargar historial.</p>';
        notasInput.value = '';
    }
};

document.getElementById('btn-save-notas-cliente')?.addEventListener('click', async () => {
    if (!CURRENT_VIEWING_CLIENT_ID) return;
    const notas = document.getElementById('historial-notas-cliente').value;
    const btn = document.getElementById('btn-save-notas-cliente');
    btn.textContent = "Guardando...";
    try {
        await db.collection("clientes").doc(CURRENT_VIEWING_CLIENT_ID).update({ notas: notas });
        btn.textContent = "¡Guardado!";
        setTimeout(() => btn.textContent = "Guardar Notas", 2000);
    } catch(e) { Modal.show("Error", "No se pudieron guardar las notas.", null); btn.textContent = "Guardar Notas"; }
});

// 3. Control de Caja (Apertura y Cierre)
async function loadCajaStatus() {
    const cajaBodyTab = document.getElementById('caja-interactive-body');
    const cajaStatusBadge = document.getElementById('caja-status-badge');
    if (!cajaBodyTab) return;
    
    cajaBodyTab.innerHTML = '<p class="text-sm">Consultando estado de caja...</p>';
    try {
        const cajaSnap = await db.collection("cajas").where("tenantId", "==", CURRENT_TENANT_ID).where("estado", "==", "abierta").limit(1).get();

        if (cajaSnap.empty) {
            CAJA_ACTUAL_ID = null;
            if(cajaStatusBadge) { cajaStatusBadge.textContent = "Cerrada"; cajaStatusBadge.className = "badge ocupada"; }
            cajaBodyTab.innerHTML = `
                <p class="text-sm" style="margin-bottom: 10px;">No hay una caja abierta. Ingresa la caja chica inicial para comenzar a operar.</p>
                <input type="number" id="tab-caja-apertura-monto" class="input-field" placeholder="Fondo inicial (Ej: 500.00)" style="margin-bottom:15px;">
                <button class="btn-primary" onclick="abrirCajaTab()" style="width:100%;">Abrir Caja</button>
            `;
        } else {
            const caja = cajaSnap.docs[0];
            CAJA_ACTUAL_ID = caja.id;
            const data = caja.data();
            if(cajaStatusBadge) { cajaStatusBadge.textContent = "Abierta"; cajaStatusBadge.className = "badge libre"; }
            
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            const ventasSnap = await db.collection("ventas").where("tenantId", "==", CURRENT_TENANT_ID).get();
            
            let efectivo = 0; let tarjetas = 0; let totalVentas = 0;
            ventasSnap.forEach(v => {
                const vd = v.data();
                if (vd.fecha && vd.fecha.toDate() >= hoy) {
                    totalVentas += vd.total;
                    if (vd.metodoPago === 'Efectivo') efectivo += vd.total;
                    else tarjetas += vd.total;
                }
            });

        const movsSnap = await db.collection("movimientos_caja").where("cajaId", "==", CAJA_ACTUAL_ID).get();
        let ingresosExternos = 0; let gastosExternos = 0;
        movsSnap.forEach(m => {
            const md = m.data();
            if (md.tipo === 'ingreso') ingresosExternos += md.monto;
            else gastosExternos += md.monto;
        });

        const esperado = data.montoApertura + efectivo + ingresosExternos - gastosExternos;

            cajaBodyTab.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <p><strong>Fondo Inicial:</strong> $${data.montoApertura.toFixed(2)}</p>
                    <div class="divider" style="margin: 8px 0;"></div>
                <p><strong>Ingresos por Ventas (Efectivo):</strong> $${efectivo.toFixed(2)}</p>
                <p><strong>Ingresos por Ventas (Tarjeta/Trans):</strong> $${tarjetas.toFixed(2)}</p>
                <p><strong>Otros Ingresos (Efectivo):</strong> <span style="color:var(--success);">+$${ingresosExternos.toFixed(2)}</span></p>
                <p><strong>Gastos/Retiros (Efectivo):</strong> <span style="color:var(--danger);">-$${gastosExternos.toFixed(2)}</span></p>
                    <div class="divider" style="margin: 8px 0;"></div>
                <p style="font-size: 1.2rem; color: var(--marigold);"><strong>Efectivo Esperado en Caja:</strong> $${esperado.toFixed(2)}</p>
                
                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button class="btn-secondary" style="flex:1;" onclick="abrirModalMovimientoCaja()">Ingreso / Gasto</button>
                    <button class="btn-outline" style="flex:1; border-color:var(--danger); color:var(--danger);" onclick="cerrarCajaTab(${data.montoApertura}, ${efectivo}, ${tarjetas}, ${totalVentas}, ${ingresosExternos}, ${gastosExternos})">Cerrar (Corte Z)</button>
                </div>
                </div>
            `;
        }
    } catch (e) { 
        console.error("Error al cargar caja:", e);
        cajaBodyTab.innerHTML = '<p class="text-sm" style="color:var(--danger)">Error al cargar caja.</p>'; 
    }
}

window.abrirCajaTab = async function() {
    const monto = parseFloat(document.getElementById('tab-caja-apertura-monto').value) || 0;
    await db.collection("cajas").add({ tenantId: CURRENT_TENANT_ID, montoApertura: monto, fechaApertura: firebase.firestore.FieldValue.serverTimestamp(), estado: 'abierta' });
    Modal.show("Caja Abierta", `Caja iniciada exitosamente con $${monto.toFixed(2)}`, () => loadCajaStatus());
};

window.cerrarCajaTab = function(apertura, efectivo, tarjetas, total, ingresos, gastos) {
    const esperado = apertura + efectivo + ingresos - gastos;
    Modal.show("Confirmar Cierre", `Al cerrar, se asume que hay $${esperado.toFixed(2)} físicos en la gaveta.`, async () => {
        await db.collection("cajas").doc(CAJA_ACTUAL_ID).update({ 
            estado: 'cerrada', 
            fechaCierre: firebase.firestore.FieldValue.serverTimestamp(), 
            ventasEfectivo: efectivo, 
            ventasTarjetas: tarjetas, 
            totalVentasDia: total,
            ingresosExternos: ingresos,
            gastosExternos: gastos,
            efectivoFinalEsperado: esperado
        });
        Modal.show("Cierre Exitoso", "La caja ha sido cerrada y el turno finalizado.", () => loadCajaStatus());
    });
};

const modalMovCaja = document.getElementById('movimiento-caja-modal');
window.abrirModalMovimientoCaja = function() {
    document.getElementById('mov-concepto').value = '';
    document.getElementById('mov-monto').value = '';
    modalMovCaja.style.display = 'flex';
};

document.getElementById('btn-mov-cancel')?.addEventListener('click', () => {
    modalMovCaja.style.display = 'none';
});

document.getElementById('btn-mov-save')?.addEventListener('click', async () => {
    const tipo = document.getElementById('mov-tipo').value;
    const concepto = document.getElementById('mov-concepto').value.trim();
    const monto = parseFloat(document.getElementById('mov-monto').value) || 0;

    if (!concepto || monto <= 0) return Modal.show("Aviso", "Ingresa un concepto válido y un monto mayor a 0.", null);
    if (!CAJA_ACTUAL_ID) return Modal.show("Error", "No hay caja abierta.", null);

    const btnSave = document.getElementById('btn-mov-save');
    btnSave.textContent = "Registrando...";

    try {
        await db.collection("movimientos_caja").add({
            tenantId: CURRENT_TENANT_ID,
            cajaId: CAJA_ACTUAL_ID,
            tipo: tipo,
            concepto: concepto,
            monto: monto,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        modalMovCaja.style.display = 'none';
        Modal.show("Éxito", "Movimiento registrado.", () => loadCajaStatus());
    } catch (e) {
        Modal.show("Error", "No se pudo registrar.", null);
    } finally {
        btnSave.textContent = "Registrar";
    }
});

// 4. Reporte de Comisiones Diarias
document.getElementById('btn-trigger-commission-calc')?.addEventListener('click', async () => {
    const container = document.getElementById('comisiones-list-container');
    if(!container) return;
    container.innerHTML = '<p class="text-sm">Calculando...</p>';
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    
    try {
        const ventasSnap = await db.collection("ventas").where("tenantId", "==", CURRENT_TENANT_ID).get();

        const reporte = {};
        let hayVentas = false;
        ventasSnap.forEach(doc => {
            const v = doc.data();
            if (v.fecha && v.fecha.toDate() >= hoy) {
                hayVentas = true;
                if (!reporte[v.estilistaId]) reporte[v.estilistaId] = { nombre: v.estilistaNombre, vendido: 0, comision: 0 };
                reporte[v.estilistaId].vendido += v.total;
                reporte[v.estilistaId].comision += (v.total * 0.40); // 40% Estándar demo
            }
        });

        if (!hayVentas) return container.innerHTML = '<p class="text-sm">No hay ventas registradas el día de hoy.</p>';

        container.innerHTML = '';
        for (const est in reporte) {
            const r = reporte[est];
            container.innerHTML += `
                <div class="card" style="padding:10px;">
                    <div class="card-info">
                        <p><strong>${r.nombre}</strong></p>
                        <p class="text-sm">Vendió: $${r.vendido.toFixed(2)}</p>
                    </div>
                    <p style="color: var(--success); font-weight: bold; font-size:1.1rem;">$${r.comision.toFixed(2)}</p>
                </div>`;
        }
    } catch (e) { container.innerHTML = '<p class="text-sm" style="color:var(--danger)">Error al calcular.</p>'; }
});

// 5. Agregar Estilista Manualmente
const btnQuickAddEstilista = document.getElementById('btn-quick-add-estilista');
btnQuickAddEstilista?.addEventListener('click', () => {
    document.getElementById('est-manual-nombre').value = '';
    document.getElementById('estilista-manual-modal').style.display = 'flex';
});

document.getElementById('btn-est-manual-save')?.addEventListener('click', async () => {
    const nombre = document.getElementById('est-manual-nombre').value.trim();
    const rol = document.getElementById('est-manual-rol').value;
    if (!nombre) return Modal.show("Aviso", "El nombre es obligatorio.", null);

    try {
        await db.collection("estilistas_turnos").add({
            tenantId: CURRENT_TENANT_ID, nombre: nombre, rol: rol,
            estado: "libre", ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('estilista-manual-modal').style.display = 'none';
        Modal.show("Éxito", `${nombre} ha sido añadida al equipo.`, null);
    } catch (e) { Modal.show("Error", e.message, null); }
});

document.getElementById('btn-est-manual-cancel')?.addEventListener('click', () => {
    document.getElementById('estilista-manual-modal').style.display = 'none';
});

/* =========================================
   MÓDULO: INVITACIONES QR (Admin)
   ========================================= */
const btnInvitarEmpleada = document.getElementById('btn-invitar-empleada');
const uiQrModal = document.getElementById('qr-modal');
const qrCodeContainer = document.getElementById('qr-code-container');
const btnQrClose = document.getElementById('qr-close');

async function generarInvitacion() {
    if (!CURRENT_TENANT_ID || CURRENT_TENANT_ID === 'ALL') return Modal.show("Aviso", "Debes estar dentro de un salón para generar un código.", null);
    qrCodeContainer.innerHTML = '<p class="text-sm">Generando código seguro...</p>';
    uiQrModal.style.display = 'flex';
    try {
        const expires = new Date();
        expires.setDate(expires.getDate() + 1); // Expira en 24 horas
        const invitationRef = await db.collection("invitaciones").add({
            tenantId: CURRENT_TENANT_ID,
            expires: firebase.firestore.Timestamp.fromDate(expires),
            used: false
        });
        const registrationUrl = `${window.location.origin}${window.location.pathname}?invite=${invitationRef.id}`;
        document.getElementById('invitation-link-input').value = registrationUrl;
        qrCodeContainer.innerHTML = '';
        new QRCode(qrCodeContainer, {
            text: registrationUrl, width: 256, height: 256,
            colorDark : "#F8FAFC", colorLight : "#1E293B",
            correctLevel : QRCode.CorrectLevel.H
        });
    } catch (error) {
        console.error("Error generando invitación:", error);
        qrCodeContainer.innerHTML = '<p class="text-sm" style="color: var(--danger);">No se pudo generar el código.</p>';
        qrCodeContainer.innerHTML = `<p class="text-sm" style="color: var(--danger);">No se pudo generar el código:<br>${error.message}</p>`;
    }
}

async function handleInvitation(token) {
    uiLogin.style.display = 'none';
    uiDashboard.style.display = 'none';
    uiSuperAdmin.style.display = 'none';
    
    try {
        const inviteDoc = await db.collection("invitaciones").doc(token).get();
        if (!inviteDoc.exists) return Modal.show("Inválido", "El código de invitación no existe.", () => window.location.replace('./'));
        
        const inviteData = inviteDoc.data();
        const now = new Date();
        
        if (inviteData.used) return Modal.show("Enlace usado", "Esta invitación ya fue utilizada.", () => window.location.replace('./'));
        if (inviteData.expires.toDate() < now) return Modal.show("Enlace expirado", "Esta invitación ha caducado.", () => window.location.replace('./'));

        // Invitación válida
        INVITATION_TENANT_ID = inviteData.tenantId;
        INVITATION_TOKEN_ID = token;
        
        uiRegister.style.display = 'flex';
        registerSubtitle.textContent = `Te unirás al equipo del salón: ${INVITATION_TENANT_ID}`;
    } catch (error) {
        console.error("Error validando invitación:", error);
        Modal.show("Error", "No se pudo validar la invitación. Revisa tu red.", () => window.location.replace('./'));
    }
}

btnInvitarEmpleada.addEventListener('click', generarInvitacion);
document.getElementById('btn-superadmin-invitar')?.addEventListener('click', () => {
    Modal.show("Información", "Por favor, ingresa a un salón haciendo clic en 'Ver' para generar una invitación asociada a ese equipo.", null);
});
btnQrClose.addEventListener('click', () => uiQrModal.style.display = 'none');

/* =========================================
   MÚLTIPLES ESCUCHAS DE FIRESTORE
   ========================================= */
function iniciarEscuchas() {
    detenerEscuchas(); // Previene escuchas duplicadas
    escucharEstilistas();
    escucharVentasDia();
    escucharAgendaDia();

    // Simular clic en la pestaña activa para cargar sus datos iniciales al iniciar sesión
    setTimeout(() => {
        const activeTab = document.querySelector('.tab-link.active');
        if (activeTab) activeTab.click();
    }, 100);
}

function detenerEscuchas() {
    if (unsubscribeEstilistas) unsubscribeEstilistas();
    if (unsubscribeVentas) unsubscribeVentas();
    if (unsubscribeAgenda) unsubscribeAgenda();
}

/* =========================================
   MÓDULO: ESTILISTAS EN TURNO
   ========================================= */
function escucharEstilistas() {
    if (!CURRENT_TENANT_ID) return;

    unsubscribeEstilistas = db.collection("estilistas_turnos")
      .where("tenantId", "==", CURRENT_TENANT_ID)
      .onSnapshot((snapshot) => {
          const contenedor = document.getElementById('lista-estilistas');
          contenedor.innerHTML = '';
          
          if (snapshot.empty) {
              contenedor.innerHTML = '<p class="text-sm">No hay estilistas en turno hoy.</p>';
              return;
          }

          snapshot.forEach((doc) => {
              const data = doc.data();
              const esOcupada = data.estado === 'ocupada';
              
              const card = document.createElement('div');
              card.className = 'card';
              card.innerHTML = `
                  <div class="card-info">
                      <p><strong>${data.nombre}</strong></p>
                      <span class="badge ${data.estado}">${data.estado}</span>
                  </div>
                  <div>
                      ${esOcupada 
                        ? `<button class="btn-accent" onclick="confirmarLiberacion('${doc.id}', '${data.nombre}')">Liberar</button>` 
                        : `<button class="btn-outline" disabled style="opacity:0.5;">En espera</button>`}
                  </div>
              `;
              contenedor.appendChild(card);
          });
      });
}

/* =========================================
   MÓDULO: AGENDA DEL DÍA (ESCUCHA EN TIEMPO REAL)
   ========================================= */
function escucharAgendaDia() {
    if (!CURRENT_TENANT_ID) return;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);

    unsubscribeAgenda = db.collection("citas")
      .where("tenantId", "==", CURRENT_TENANT_ID)
      .onSnapshot(async (snapshot) => {
          const contenedor = document.getElementById('kanban-agenda-container');
          const floatingBubble = document.getElementById('floating-next-appt');
          const floatingText = document.getElementById('floating-next-appt-text');

          if (!contenedor) return;
          contenedor.innerHTML = '';
          let nextApptFound = false;

          let citasDelDia = [];
          let citasFuturas = [];
          snapshot.forEach((doc) => {
              const data = doc.data();
              if (data.fechaHora) {
                  const fecha = data.fechaHora.toDate();
                  if (fecha >= hoy && fecha < manana) {
                      citasDelDia.push({ id: doc.id, ...data, dateObj: fecha });
                  } else if (fecha >= manana) {
                      citasFuturas.push({ id: doc.id, ...data, dateObj: fecha });
                  }
              }
          });
          
          citasDelDia.sort((a, b) => a.dateObj - b.dateObj);
          citasFuturas.sort((a, b) => a.dateObj - b.dateObj);

          // Extraemos los estilistas activos para crear las columnas del Kanban
          const stylistsSnap = await db.collection("estilistas_turnos").where("tenantId", "==", CURRENT_TENANT_ID).get();
          let stylists = [];
          stylistsSnap.forEach(doc => stylists.push({ id: doc.id, ...doc.data() }));
          
          if (stylists.length === 0) {
              return contenedor.innerHTML = '<p class="text-sm" style="width:100%; text-align:center;">Agrega profesionales al turno para visualizar la agenda del día.</p>';
          }
          
          stylists.forEach(stylist => {
              const col = document.createElement('div');
              col.className = 'kanban-col';
              
              col.innerHTML = `
                  <div class="kanban-col-header">
                      <span>👤 ${stylist.nombre}</span><br>
                      <span class="badge ${stylist.estado}">${stylist.estado}</span>
                  </div>
              `;
              
              const timeline = document.createElement('div');
              timeline.className = 'timeline-container';
              
              const citasEstilista = citasDelDia.filter(c => c.stylistId === stylist.id);
              const futurasEstilista = citasFuturas.filter(c => c.stylistId === stylist.id);
              
              if(citasEstilista.length === 0) {
                  timeline.innerHTML = `<p class="text-sm" style="opacity: 0.6;">Sin citas asignadas hoy.</p>`;
              } else {
                  citasEstilista.forEach(data => {
                      const hora = data.dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                      const isPendiente = data.estado === 'pendiente';
                      
                      timeline.innerHTML += `
                          <div class="timeline-item">
                              <div class="timeline-dot" style="background: ${isPendiente ? 'var(--marigold)' : 'var(--success)'};"></div>
                              <div class="timeline-time">${hora}</div>
                              <div class="card" style="box-shadow: var(--neu-in); margin-bottom: 0; display: block; border-left: 4px solid ${isPendiente ? 'var(--marigold)' : 'var(--success)'};">
                                  <p style="margin-bottom: 4px; font-weight: bold; color: var(--text-main);">${data.clientName}</p>
                                  <p class="text-sm" style="margin-bottom: 12px;">${data.serviceName}</p>
                                  <div style="display: flex; gap: 8px;">
                                      ${isPendiente && data.clientPhone ? `<a href="https://wa.me/${data.clientPhone.replace(/\D/g, '')}" target="_blank" class="btn-outline" style="font-size: 0.75rem; padding: 4px 10px; min-height: auto; text-decoration: none;">WhatsApp</a>` : ''}
                                      ${isPendiente ? `<button class="btn-primary" style="font-size: 0.75rem; padding: 4px 10px; min-height: auto;" onclick="cobrarCita('${data.id}', '${data.stylistId}', '${data.serviceId}')">Cobrar</button>` : `<span class="badge libre" style="font-size:0.6rem;">COMPLETADA</span>`}
                                  </div>
                              </div>
                          </div>
                      `;
                      
                      if (isPendiente && !nextApptFound && floatingBubble) {
                          nextApptFound = true;
                          floatingText.textContent = `${hora} - ${data.clientName} (${data.stylistName})`;
                          floatingBubble.style.display = 'block';
                          floatingBubble.onclick = () => cobrarCita(data.id, data.stylistId, data.serviceId);
                      }
                  });
              }
              
              // Renderizar citas futuras al final de la columna
              if (futurasEstilista.length > 0) {
                  let htmlFuturas = `<div style="margin-top: 20px; border-top: 2px dashed var(--slate); padding-top: 15px;">
                      <p class="text-sm" style="font-weight:bold; margin-bottom:10px; color: var(--text-main);">📅 Próximos Días:</p>`;
                  futurasEstilista.forEach(data => {
                      const isPendiente = data.estado === 'pendiente';
                      if (isPendiente) { // Solo mostrar si no se ha cobrado
                          const diaStr = data.dateObj.toLocaleDateString([], {day:'2-digit', month:'short'});
                          const horaStr = data.dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                          htmlFuturas += `
                              <div class="card" style="box-shadow: none; border: 1px solid var(--slate); margin-bottom: 8px; padding: 10px; display: block; border-left: 3px solid var(--blue);">
                                  <p style="font-size:0.8rem; margin-bottom:4px; color: var(--blue);"><strong>${diaStr} a las ${horaStr}</strong></p>
                                  <p style="font-size:0.85rem; color:var(--text-main); margin-bottom:2px; font-weight: 500;">${data.clientName}</p>
                                  <p class="text-sm" style="font-size:0.75rem;">${data.serviceName}</p>
                              </div>
                          `;
                      }
                  });
                  htmlFuturas += `</div>`;
                  timeline.innerHTML += htmlFuturas;
              }
              
              col.appendChild(timeline);
              contenedor.appendChild(col);
          });

          if (!nextApptFound && floatingBubble) floatingBubble.style.display = 'none';
      }, (error) => {
          console.error("Error agenda:", error);
          document.getElementById('lista-agenda').innerHTML = '<p class="text-sm" style="color:var(--danger)">Error al cargar la agenda.</p>';
      });
}

window.cobrarCita = async function(citaId, stylistId, serviceId) {
    if (TPV.openWithPreload) {
        await TPV.openWithPreload(stylistId, serviceId);
    } else {
        await TPV.open();
    }
    db.collection("citas").doc(citaId).update({ estado: 'completada' });
};

window.confirmarLiberacion = function(estilistaId, nombre) {
    // Opcional: Validación de Roles en frontend
    // if (CURRENT_USER_ROLE !== 'admin') return Modal.show("Denegado", "Solo la administradora puede liberar manualmente.", null);

    Modal.show("Liberar Estilista", `¿Marcar a ${nombre} como LIBRE?`, () => {
        db.collection("estilistas_turnos").doc(estilistaId).update({
            estado: 'libre',
            ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
        });
    });
};

/* =========================================
   MÓDULO: VENTAS DEL DÍA
   ========================================= */
function escucharVentasDia() {
    if (!CURRENT_TENANT_ID) return;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    unsubscribeVentas = db.collection("ventas")
      .where("tenantId", "==", CURRENT_TENANT_ID)
      .onSnapshot((snapshot) => {
          const contenedor = document.getElementById('lista-ventas');
          const kpiVentas = document.getElementById('rep-kpi-ventas');
          const kpiServicios = document.getElementById('rep-kpi-servicios');
          const lblEfectivo = document.getElementById('lbl-pct-efectivo');
          const lblTarjeta = document.getElementById('lbl-pct-tarjeta');
          const lblTransfer = document.getElementById('lbl-pct-transfer');
          const chartContainer = document.querySelector('.concentric-rings-chart');
          
          if (!contenedor) return;
          contenedor.innerHTML = '';
          let totalDiario = 0;
          let ventasEfectivo = 0;
          let ventasTarjeta = 0;
          let ventasTransferencia = 0;

          let ventasDelDia = [];
          snapshot.forEach((doc) => {
              const data = doc.data();
              if (data.fecha) {
                  const fecha = data.fecha.toDate();
                  if (fecha >= hoy) {
                      ventasDelDia.push({ id: doc.id, ...data, dateObj: fecha });
                  }
              }
          });
          
          ventasDelDia.sort((a, b) => b.dateObj - a.dateObj);

          if (ventasDelDia.length === 0) {
              if (kpiVentas) kpiVentas.textContent = '$0.00';
              if (kpiServicios) kpiServicios.textContent = '0';
              if (lblEfectivo) lblEfectivo.textContent = '0%';
              if (lblTarjeta) lblTarjeta.textContent = '0%';
              if (lblTransfer) lblTransfer.textContent = '0%';
              if (chartContainer) chartContainer.style.background = 'conic-gradient(var(--slate) 0% 100%)';
              return contenedor.innerHTML = '<p class="text-sm">Sin ventas hoy.</p>';
          }

          ventasDelDia.forEach((data) => {
              const monto = parseFloat(data.total || 0);
              totalDiario += monto;
              
              if (data.metodoPago === 'Efectivo') ventasEfectivo += monto;
              else if (data.metodoPago === 'Tarjeta') ventasTarjeta += monto;
              else ventasTransferencia += monto;

              const hora = data.dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

              contenedor.innerHTML += `
                  <div class="card">
                      <div class="card-info"><p><strong>#${data.id.slice(-5).toUpperCase()}</strong></p><p class="text-sm">${data.estilistaNombre}</p></div>
                      <div style="text-align: right;"><p style="color: var(--success); font-weight: bold;">$${monto.toFixed(2)}</p><p class="text-sm">${hora} • ${data.metodoPago || 'N/A'}</p></div>
                  </div>`;
          });
          
          if (kpiVentas) kpiVentas.textContent = `$${totalDiario.toFixed(2)}`;
          if (kpiServicios) kpiServicios.textContent = ventasDelDia.length.toString();

          const pctEfectivo = totalDiario > 0 ? Math.round((ventasEfectivo / totalDiario) * 100) : 0;
          const pctTarjeta = totalDiario > 0 ? Math.round((ventasTarjeta / totalDiario) * 100) : 0;
          const pctTransferencia = totalDiario > 0 ? (100 - pctEfectivo - pctTarjeta) : 0;

          if (lblEfectivo) lblEfectivo.textContent = `${pctEfectivo}%`;
          if (lblTarjeta) lblTarjeta.textContent = `${pctTarjeta}%`;
          if (lblTransfer) lblTransfer.textContent = `${pctTransferencia}%`;

          if (chartContainer) {
              chartContainer.style.background = `conic-gradient(
                  var(--blue) 0% ${pctTarjeta}%, 
                  var(--success) ${pctTarjeta}% ${pctTarjeta + pctEfectivo}%, 
                  var(--marigold) ${pctTarjeta + pctEfectivo}% 100%
              )`;
          }
      }, (error) => {
          console.error("Error ventas:", error);
          document.getElementById('lista-ventas').innerHTML = '<p class="text-sm" style="color:var(--danger)">Error al cargar ventas.</p>';
      });
}

/* =========================================
   MÓDULO: CONSUMO DE QUÍMICOS Y REPORTES
   ========================================= */
const btnOpenConsumo = document.getElementById('btn-open-consumo');
const modalConsumo = document.getElementById('consumo-modal');
const consEstilista = document.getElementById('cons-estilista');
const consArticulo = document.getElementById('cons-articulo');
const consCantidad = document.getElementById('cons-cantidad');

btnOpenConsumo?.addEventListener('click', async () => {
    if (!CURRENT_TENANT_ID) return;
    consEstilista.innerHTML = '<option value="">Cargando...</option>';
    consArticulo.innerHTML = '<option value="">Cargando...</option>';
    consCantidad.value = '';
    modalConsumo.style.display = 'flex';

    try {
        const [stylistsSnap, catalogSnap] = await Promise.all([
            db.collection("estilistas_turnos").where("tenantId", "==", CURRENT_TENANT_ID).get(),
            db.collection("articulos_salones").where("tenantId", "==", CURRENT_TENANT_ID).get()
        ]);

        consEstilista.innerHTML = '<option value="">Seleccione profesional...</option>';
        stylistsSnap.forEach(s => {
            consEstilista.innerHTML += `<option value="${s.id}" data-name="${s.data().nombre}">${s.data().nombre}</option>`;
        });
        
        consArticulo.innerHTML = '<option value="">Seleccione insumo...</option>';
        catalogSnap.forEach(c => {
            const d = c.data();
            if (d.tipo === 'interno') {
                consArticulo.innerHTML += `<option value="${c.id}" data-name="${d.nombre}" data-unit="${d.unidadMedida || 'u'}">${d.nombre} (Stock actual: ${d.stock || 0} ${d.unidadMedida || 'u'})</option>`;
            }
        });
    } catch (e) {
        Modal.show("Error", "No se pudo cargar la información.", null);
        modalConsumo.style.display = 'none';
    }
});

document.getElementById('btn-cons-cancel')?.addEventListener('click', () => modalConsumo.style.display = 'none');

document.getElementById('btn-cons-save')?.addEventListener('click', async () => {
    const estilistaId = consEstilista.value;
    const articuloId = consArticulo.value;
    const cantidad = parseFloat(consCantidad.value) || 0;

    if (!estilistaId || !articuloId || cantidad <= 0) return Modal.show("Aviso", "Todos los campos son obligatorios y la cantidad debe ser mayor a 0.", null);

    const estilistaName = consEstilista.options[consEstilista.selectedIndex].dataset.name;
    const articuloName = consArticulo.options[consArticulo.selectedIndex].dataset.name;
    const unidad = consArticulo.options[consArticulo.selectedIndex].dataset.unit;

    const btnConsSave = document.getElementById('btn-cons-save');
    btnConsSave.textContent = "Guardando...";
    
    try {
        const batch = db.batch();
        
        const artRef = db.collection("articulos_salones").doc(articuloId);
        batch.update(artRef, { stock: firebase.firestore.FieldValue.increment(-cantidad) });

        const consRef = db.collection("consumos_internos").doc();
        batch.set(consRef, {
            tenantId: CURRENT_TENANT_ID,
            estilistaId: estilistaId, estilistaNombre: estilistaName,
            articuloId: articuloId, articuloNombre: articuloName,
            cantidad: cantidad, unidad: unidad,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        modalConsumo.style.display = 'none';
        Modal.show("Éxito", `Se han descontado ${cantidad}${unidad} de ${articuloName}.`, () => {
            if (document.getElementById('modulo-inventario').classList.contains('active-content')) {
                if (typeof loadCatalogList === "function") loadCatalogList();
            }
        });
    } catch (e) {
        Modal.show("Error", "Hubo un problema al registrar: " + e.message, null);
    } finally {
        if (btnConsSave) btnConsSave.textContent = "Descontar Stock";
    }
});

document.getElementById('btn-load-consumos')?.addEventListener('click', async () => {
    const container = document.getElementById('lista-consumos');
    if(!container || !CURRENT_TENANT_ID) return;
    
    container.innerHTML = '<p class="text-sm">Calculando datos de la semana...</p>';
    const unaSemanaAtras = new Date();
    unaSemanaAtras.setDate(unaSemanaAtras.getDate() - 7);
    
    try {
        const consumosSnap = await db.collection("consumos_internos").where("tenantId", "==", CURRENT_TENANT_ID).get();

        const reporte = {};
        let hayConsumos = false;

        consumosSnap.forEach(doc => {
            const c = doc.data();
            if (c.fecha && c.fecha.toDate() >= unaSemanaAtras) {
                hayConsumos = true;
                if (!reporte[c.estilistaId]) reporte[c.estilistaId] = { nombre: c.estilistaNombre, items: {} };
                if (!reporte[c.estilistaId].items[c.articuloNombre]) reporte[c.estilistaId].items[c.articuloNombre] = { cantidad: 0, unidad: c.unidad || 'u' };
                reporte[c.estilistaId].items[c.articuloNombre].cantidad += c.cantidad;
            }
        });

        if (!hayConsumos) return container.innerHTML = '<p class="text-sm">No hay consumos registrados en los últimos 7 días.</p>';

        container.innerHTML = '';
        for (const estId in reporte) {
            const est = reporte[estId];
            let htmlItems = '';
            for (const artName in est.items) {
                const item = est.items[artName];
                htmlItems += `<p class="text-sm" style="margin-top:4px; display:flex; justify-content:space-between; border-bottom:1px dashed var(--slate); padding-bottom:4px;">
                    <span>${artName}</span><strong>${item.cantidad} ${item.unidad}</strong></p>`;
            }
            container.innerHTML += `
                <div class="card" style="padding:15px; display:block; border-left: 4px solid var(--fandango); box-shadow: var(--neu-in);">
                    <p style="color:var(--text-main); margin-bottom:8px; font-size:1.05rem;"><strong>👤 ${est.nombre}</strong></p>
                    ${htmlItems}
                </div>`;
        }
    } catch (e) {
        container.innerHTML = '<p class="text-sm" style="color:var(--danger)">Error al cargar reporte: ' + e.message + '</p>';
    }
});

/* =========================================
   NAVEGACIÓN POR PESTAÑAS (REDISEÑO VISUAL)
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-link');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active-content'));
            
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            const target = document.getElementById(targetId);
            if (target) {
                target.classList.add('active-content');
                
                // Cargar los datos dinámicamente al entrar a cada pestaña
                if (targetId === 'modulo-tpv') TPV.loadData();
                if (targetId === 'modulo-caja') loadCajaStatus();
                if (targetId === 'modulo-clientes') loadClientsList();
                if (targetId === 'modulo-inventario') loadCatalogList();
                if (targetId === 'modulo-reportes') {
                    const btnConsumos = document.getElementById('btn-load-consumos');
                    if (btnConsumos) btnConsumos.click();
                }
            }
        });
    });

    setInterval(() => {
        const clock = document.getElementById('global-clock');
        if (clock) clock.textContent = new Date().toLocaleTimeString();
    }, 1000);
});