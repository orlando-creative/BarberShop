import { auth, db, supabase, formatCurrency } from './config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, updateDoc, doc, query, orderBy, getDoc, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        // Verificación de rol de administrador
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
                // El usuario es admin, cargar el dashboard
                loadDashboardData();
                loadServicesAdmin();
                setupNavigation();
            } else {
                // No es admin o no tiene el rol definido, redirigir
                console.error("Acceso denegado: El usuario no tiene rol de 'admin'.");
                if (userDocSnap.exists()) {
                    console.log(`Rol encontrado en la base de datos: '${userDocSnap.data().role}'. Se esperaba 'admin'.`);
                } else {
                    console.log(`No se encontró el documento para el usuario con UID: ${user.uid} en la colección 'users'.`);
                }
                // Usamos replace para evitar que la página de admin quede en el historial del navegador y se creen bucles con el botón "atrás".
                window.location.replace('index.html');
            }
        } catch (error) {
            console.error("Error al verificar el rol de administrador:", error);
            window.location.replace('index.html');
        }
    });

    const adminLogoutBtn = document.getElementById('admin-logout');
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.replace('index.html');
        });
    }

    function setupNavigation() {
        const buttons = {
            appointments: document.getElementById('view-appointments'),
            stats: document.getElementById('view-stats'),
            services: document.getElementById('view-services')
        };
        const sections = {
            appointments: document.getElementById('appointments-section'),
            stats: document.querySelector('.stats-grid'),
            services: document.getElementById('services-section')
        };

        const showSection = (sectionName) => {
            Object.keys(sections).forEach(key => {
                const isVisible = key === sectionName || (sectionName === 'appointments' && key === 'stats');
                sections[key].classList.toggle('hidden', !isVisible);
                if (buttons[key]) buttons[key].classList.toggle('active', key === sectionName);
            });
        };

        buttons.appointments.addEventListener('click', () => showSection('appointments'));
        buttons.stats.addEventListener('click', () => showSection('appointments')); // Stats se muestra con citas
        buttons.services.addEventListener('click', () => showSection('services'));
    }

    const serviceForm = document.getElementById('service-form');
    serviceForm.addEventListener('submit', handleServiceFormSubmit);

    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    cancelEditBtn.addEventListener('click', () => {
        resetServiceForm();
    });

    async function loadDashboardData() {
        const q = query(collection(db, "appointments"), orderBy("appointment_date", "desc"));
        
        try {
            const querySnapshot = await getDocs(q);

        const today = new Date().toISOString().split('T')[0];
        let todayCount = 0;
        let monthIncome = 0;
        let uniqueClients = new Set();

        const tbody = document.querySelector('#admin-appointments-table > tbody');
        tbody.innerHTML = '';

            querySnapshot.forEach((docSnap) => {
                const app = docSnap.data();
                const appId = docSnap.id;

                if (app.appointment_date.startsWith(today)) todayCount++;
                if (app.status !== 'cancelled') monthIncome += (app.service_price || 0);
                if (app.user_email) uniqueClients.add(app.user_email);

                const tr = document.createElement('tr');
                
                const clientName = app.user_name || 'Desconocido';
                const clientEmail = app.user_email || '';
                const serviceName = app.service_name || 'Servicio';
                const price = app.service_price || 0;

                tr.innerHTML = `
                    <td data-label="Cliente">${clientName}<br><small>${clientEmail}</small></td>
                    <td data-label="Servicio">${serviceName}</td>
                    <td data-label="Barbero">${app.barber_name}</td>
                    <td data-label="Fecha">${new Date(app.appointment_date).toLocaleString('es-BO')}</td>
                    <td data-label="Precio">${formatCurrency(price)}</td>
                    <td data-label="Ref.">${app.image_url ? `<a href="${app.image_url}" target="_blank" style="color:var(--accent-color)">Ver</a>` : '-'}</td>
                    <td data-label="Estado" style="color:${getStatusColor(app.status)}">${app.status}</td>
                    <td data-label="Acción">
                        ${app.status === 'pending' ? `<button class="btn-action-confirm" data-id="${appId}">✓</button>` : ''}
                        ${app.status !== 'cancelled' ? `<button class="btn-action-cancel" data-id="${appId}">X</button>` : ''}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Event listeners para botones dinámicos
            document.querySelectorAll('.btn-action-confirm').forEach(btn => {
                btn.addEventListener('click', () => updateStatus(btn.dataset.id, 'confirmed'));
                btn.style.cssText = "color:var(--accent-color); background:none; border:1px solid var(--accent-color); cursor:pointer; margin-right:5px;";
            });
            document.querySelectorAll('.btn-action-cancel').forEach(btn => {
                btn.addEventListener('click', () => updateStatus(btn.dataset.id, 'cancelled'));
                btn.style.cssText = "color:red; background:none; border:1px solid red; cursor:pointer;";
            });

            document.getElementById('count-today').textContent = todayCount;
            document.getElementById('income-month').textContent = formatCurrency(monthIncome);
            document.getElementById('total-clients').textContent = uniqueClients.size;
        } catch (error) {
            console.error("Error loading dashboard:", error);
        }
    }

    async function loadServicesAdmin() {
        const listContainer = document.getElementById('admin-services-list');
        listContainer.innerHTML = '<p>Cargando servicios...</p>';
        try {
            const querySnapshot = await getDocs(collection(db, "services"));
            listContainer.innerHTML = '';
            if (querySnapshot.empty) {
                listContainer.innerHTML = '<p>No hay servicios creados.</p>';
                return;
            }
            querySnapshot.forEach(doc => {
                const service = doc.data();
                const card = document.createElement('div');
                card.className = 'admin-service-card';
                card.innerHTML = `
                    <img src="${service.image_url || 'https://via.placeholder.com/300x200.png?text=Sin+Imagen'}" alt="${service.name}">
                    <div class="admin-service-card-content">
                        <h4>${service.name}</h4>
                        <div class="admin-service-card-info">
                            <span>${formatCurrency(service.price_bob)}</span>
                            <span>${service.duration_minutes} min</span>
                        </div>
                        <div class="admin-service-card-actions">
                            <button class="btn-action-edit">Editar</button>
                            <button class="btn-action-delete">Eliminar</button>
                        </div>
                    </div>
                `;
                card.querySelector('.btn-action-edit').addEventListener('click', () => populateServiceForm(doc.id, service));
                card.querySelector('.btn-action-delete').addEventListener('click', () => deleteService(doc.id, service.image_path));
                listContainer.appendChild(card);
            });
        } catch (error) {
            console.error("Error cargando servicios para admin:", error);
            listContainer.innerHTML = '<p>Error al cargar servicios.</p>';
        }
    }

    async function handleServiceFormSubmit(e) {
        e.preventDefault();
        const submitButton = e.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Guardando...';

        const serviceId = document.getElementById('service-id').value;
        const name = document.getElementById('service-name').value;
        const price = parseFloat(document.getElementById('service-price').value);
        const duration = parseInt(document.getElementById('service-duration').value);
        const imageFile = document.getElementById('service-image').files[0];

        const serviceData = {
            name: name,
            price_bob: price,
            duration_minutes: duration,
        };

        try {
            if (imageFile) {
                // Lógica de subida con Supabase
                const imagePath = `service-images/${Date.now()}-${imageFile.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('service-images')
                    .upload(imagePath, imageFile);

                if (uploadError) throw uploadError;

                // Obtener la URL pública de la imagen subida
                const { data: urlData } = supabase.storage.from('service-images').getPublicUrl(imagePath);
                serviceData.image_url = urlData.publicUrl;
                serviceData.image_path = imagePath; // Guardamos la ruta para poder borrarla
            }

            if (serviceId) {
                // Actualizando un servicio existente
                const serviceRef = doc(db, "services", serviceId);
                await updateDoc(serviceRef, serviceData);
                alert('Servicio actualizado con éxito.');
            } else {
                // Creando un nuevo servicio
                await addDoc(collection(db, "services"), serviceData);
                alert('Servicio creado con éxito.');
            }
            resetServiceForm();
            loadServicesAdmin();
        } catch (error) {
            console.error("Error guardando servicio:", error);
            alert("Error al guardar el servicio: " + error.message);
        } finally {
            // Restablecer el botón sin importar si hubo éxito o error
            submitButton.disabled = false;
            submitButton.textContent = 'Guardar Servicio';
        }
    }

    function populateServiceForm(id, service) {
        document.getElementById('service-id').value = id;
        document.getElementById('form-title').textContent = 'Editar Servicio';
        document.getElementById('service-name').value = service.name;
        document.getElementById('service-price').value = service.price_bob;
        document.getElementById('service-duration').value = service.duration_minutes;
        document.getElementById('cancel-edit-btn').classList.remove('hidden');
        window.scrollTo(0, 0); // Sube al inicio de la página para ver el formulario
    }

    function resetServiceForm() {
        serviceForm.reset();
        document.getElementById('service-id').value = '';
        document.getElementById('form-title').textContent = 'Añadir Nuevo Servicio';
        document.getElementById('cancel-edit-btn').classList.add('hidden');
    }

    async function deleteService(id, imagePath) {
        if (!confirm('¿Estás seguro de que quieres eliminar este servicio? Esta acción no se puede deshacer.')) return;
        try {
            await deleteDoc(doc(db, "services", id));
            // Borrar imagen de Supabase
            if (imagePath) {
                await supabase.storage.from('service-images').remove([imagePath]);
            }
            loadServicesAdmin();
        } catch (error) {
            console.error("Error eliminando servicio:", error);
        }
    }

    async function updateStatus(id, newStatus) {
        if(!confirm(`¿Cambiar estado a ${newStatus}?`)) return;
        try {
            const appRef = doc(db, "appointments", id);
            await updateDoc(appRef, { status: newStatus });
            loadDashboardData();
        } catch (e) {
            alert("Error actualizando: " + e.message);
        }
    };

    function getStatusColor(status) {
        if (status === 'confirmed') return 'var(--accent-color)';
        if (status === 'cancelled') return 'red';
        return 'orange';
    }
});