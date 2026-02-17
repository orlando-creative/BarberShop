import { auth, db, formatCurrency } from './config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, updateDoc, doc, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        // Aquí podrías verificar si el usuario es admin consultando una colección 'users'
        // Por ahora cargamos el dashboard si está autenticado
        loadDashboardData();
    });

    const adminLogoutBtn = document.getElementById('admin-logout');
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.href = 'index.html';
        });
    }

    async function loadDashboardData() {
        const q = query(collection(db, "appointments"), orderBy("appointment_date", "desc"));
        
        try {
            const querySnapshot = await getDocs(q);

        const today = new Date().toISOString().split('T')[0];
        let todayCount = 0;
        let monthIncome = 0;
        let uniqueClients = new Set();

        const tbody = document.querySelector('#admin-appointments-table tbody');
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
                    <td>${clientName}<br><small>${clientEmail}</small></td>
                    <td>${serviceName}</td>
                    <td>${app.barber_name}</td>
                    <td>${new Date(app.appointment_date).toLocaleString('es-BO')}</td>
                    <td>${formatCurrency(price)}</td>
                    <td>${app.image_url ? `<a href="${app.image_url}" target="_blank" style="color:var(--accent-color)">Ver</a>` : '-'}</td>
                    <td style="color:${getStatusColor(app.status)}">${app.status}</td>
                    <td>
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