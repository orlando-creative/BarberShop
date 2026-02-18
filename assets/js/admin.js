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
    
    // Event listeners para acciones masivas
    const bulkConfirmBtn = document.getElementById('bulk-confirm');
    const bulkCancelBtn = document.getElementById('bulk-cancel');
    
    if(bulkConfirmBtn) bulkConfirmBtn.addEventListener('click', () => processBulkAction('confirmed'));
    if(bulkCancelBtn) bulkCancelBtn.addEventListener('click', () => processBulkAction('cancelled'));

    // --- LÓGICA MODAL EDICIÓN ---
    const modal = document.getElementById('edit-appointment-modal');
    const closeModal = document.querySelector('.close-modal');
    const editForm = document.getElementById('edit-appointment-form');

    if(closeModal) {
        closeModal.addEventListener('click', () => modal.classList.add('hidden'));
    }
    window.addEventListener('click', (e) => {
        if (e.target == modal) modal.classList.add('hidden');
    });

    if(editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-app-id').value;
            const newDate = document.getElementById('edit-app-date').value;
            const newBarber = document.getElementById('edit-app-barber').value;

            if(!id || !newDate || !newBarber) return;

            try {
                await updateDoc(doc(db, "appointments", id), {
                    appointment_date: new Date(newDate).toISOString(),
                    barber_name: newBarber
                });
                alert('Cita actualizada correctamente');
                modal.classList.add('hidden');
                loadDashboardData();
            } catch (error) {
                console.error("Error actualizando cita:", error);
                alert("Error al actualizar.");
            }
        });
    }

    let selectedAppointments = new Set();

    async function loadDashboardData() {
        const q = query(collection(db, "appointments"), orderBy("appointment_date", "desc"));
        
        try {
            const querySnapshot = await getDocs(q);

        const today = new Date().toISOString().split('T')[0];
        let todayCount = 0;
        let monthIncome = 0;
        let uniqueClients = new Set();

        const agendaContainer = document.getElementById('appointments-agenda');
        agendaContainer.innerHTML = '';
        selectedAppointments.clear();
        updateBulkUI();

        // Agrupar citas por fecha
        const appointmentsByDate = {};

            querySnapshot.forEach((docSnap) => {
                const app = docSnap.data();
                const appId = docSnap.id;
                app.id = appId; // Guardar ID en el objeto

                if (app.appointment_date.startsWith(today)) todayCount++;
                if (app.status !== 'cancelled') monthIncome += (app.service_price || 0);
                if (app.user_email) uniqueClients.add(app.user_email);

                const dateKey = app.appointment_date.split('T')[0];
                if (!appointmentsByDate[dateKey]) appointmentsByDate[dateKey] = [];
                appointmentsByDate[dateKey].push(app);
            });

            // Ordenar fechas (más reciente primero)
            const sortedDates = Object.keys(appointmentsByDate).sort((a, b) => new Date(b) - new Date(a));

            sortedDates.forEach(date => {
                const dateGroup = document.createElement('div');
                dateGroup.className = 'date-group';

                // Header de Fecha
                const dateObj = new Date(date + 'T12:00:00');
                const dateString = dateObj.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });
                
                const header = document.createElement('div');
                header.className = 'date-header';
                header.innerHTML = `<span>${dateString}</span> <span>${appointmentsByDate[date].length} citas</span>`;
                dateGroup.appendChild(header);

                // Grid de Tarjetas
                const grid = document.createElement('div');
                grid.className = 'appointments-grid-view';

                // Ordenar citas por hora dentro del día
                appointmentsByDate[date].sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));

                appointmentsByDate[date].forEach(app => {
                    const card = document.createElement('div');
                    card.className = `app-card`;
                    card.dataset.id = app.id;

                    const time = new Date(app.appointment_date).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
                    
                    card.innerHTML = `
                        <div class="checkbox-wrapper">
                            <input type="checkbox" class="app-checkbox" value="${app.id}">
                        </div>
                        <div class="app-card-content">
                            <div class="app-card-header">
                                <span class="app-time">${time}</span>
                                <span class="app-status status-${app.status}">${app.status}</span>
                            </div>
                            <div class="app-client">${app.user_name || 'Cliente'}</div>
                            <div class="app-service">${app.service_name} - ${formatCurrency(app.service_price)}</div>
                            <div class="app-barber"><i class='bx bx-user'></i> ${app.barber_name} ${app.image_url ? ` | <a href="${app.image_url}" target="_blank" style="color:var(--accent-color)">Ver Foto</a>` : ''}</div>
                            <div class="app-actions">
                                <button class="btn-icon edit" title="Editar" data-id="${app.id}" data-date="${app.appointment_date}" data-barber="${app.barber_name}"><i class='bx bx-edit'></i></button>
                                <button class="btn-icon delete" title="Eliminar" data-id="${app.id}"><i class='bx bx-trash'></i></button>
                            </div>
                        </div>
                    `;

                    // Lógica de selección
                    card.addEventListener('click', (e) => {
                        if (e.target.tagName === 'A') return; // Permitir clic en enlaces
                        if (e.target.closest('.btn-icon')) return; // Ignorar clic si es en botones de acción
                        const checkbox = card.querySelector('.app-checkbox');
                        // Si no se hizo clic directamente en el checkbox, invertirlo
                        if (e.target !== checkbox) {
                            checkbox.checked = !checkbox.checked;
                        }
                        
                        if (checkbox.checked) {
                            selectedAppointments.add(app.id);
                            card.classList.add('selected');
                        } else {
                            selectedAppointments.delete(app.id);
                            card.classList.remove('selected');
                        }
                        updateBulkUI();
                    });

                    // Eventos botones editar/eliminar
                    const editBtn = card.querySelector('.edit');
                    const deleteBtn = card.querySelector('.delete');

                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEditModal(editBtn.dataset.id, editBtn.dataset.date, editBtn.dataset.barber);
                    });

                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if(confirm('¿Estás seguro de eliminar esta cita permanentemente?')) {
                            await deleteDoc(doc(db, "appointments", deleteBtn.dataset.id));
                            loadDashboardData();
                        }
                    });

                    grid.appendChild(card);
                });
                
                dateGroup.appendChild(grid);
                agendaContainer.appendChild(dateGroup);
            });

            document.getElementById('count-today').textContent = todayCount;
            document.getElementById('income-month').textContent = formatCurrency(monthIncome);
            document.getElementById('total-clients').textContent = uniqueClients.size;
        } catch (error) {
            console.error("Error loading dashboard:", error);
        }
    }

    function openEditModal(id, dateIso, barber) {
        document.getElementById('edit-app-id').value = id;
        // Convertir ISO a formato datetime-local (YYYY-MM-DDTHH:MM)
        const dateObj = new Date(dateIso);
        // Ajuste manual de zona horaria simple para el input
        const localIso = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        document.getElementById('edit-app-date').value = localIso;
        document.getElementById('edit-app-barber').value = barber;
        document.getElementById('edit-appointment-modal').classList.remove('hidden');
    }

    function updateBulkUI() {
        const count = selectedAppointments.size;
        const bulkDiv = document.getElementById('bulk-actions');
        const countSpan = document.getElementById('selection-count');
        
        countSpan.textContent = `${count} seleccionados`;
        if (count > 0) {
            bulkDiv.classList.remove('hidden');
        } else {
            bulkDiv.classList.add('hidden');
        }
    }

    async function processBulkAction(newStatus) {
        if (!confirm(`¿Estás seguro de cambiar ${selectedAppointments.size} citas a estado "${newStatus}"?`)) return;
        
        const promises = Array.from(selectedAppointments).map(id => {
            return updateDoc(doc(db, "appointments", id), { status: newStatus });
        });

        try {
            await Promise.all(promises);
            alert('Citas actualizadas correctamente.');
            loadDashboardData(); // Recargar
        } catch (error) {
            console.error("Error en acción masiva:", error);
            alert("Hubo un error al actualizar algunas citas.");
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

    function getStatusColor(status) {
        if (status === 'confirmed') return 'var(--accent-color)';
        if (status === 'cancelled') return 'red';
        return 'orange';
    }
});