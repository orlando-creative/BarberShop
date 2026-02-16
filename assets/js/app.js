import { auth, db, storage, googleProvider, formatCurrency } from './config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, addDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

document.addEventListener('DOMContentLoaded', async () => {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const bookingSection = document.getElementById('booking-section');
    const historySection = document.getElementById('history-section');
    const serviceSelect = document.getElementById('service-select');
    const priceDisplay = document.getElementById('price-display');
    const bookingForm = document.getElementById('booking-form');

    let currentUser = null;
    let servicesMap = {};

    onAuthStateChanged(auth, (user) => {
        handleUserSession(user);
    });

    function handleUserSession(user) {
        if (user) {
            currentUser = user;
            document.getElementById('user-name').textContent = user.displayName || user.email;
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            bookingSection.classList.remove('hidden');
            historySection.classList.remove('hidden');
            loadServices();
            loadAppointments();
        } else {
            currentUser = null;
            loginBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');
            bookingSection.classList.add('hidden');
            historySection.classList.add('hidden');
        }
    }

    loginBtn.addEventListener('click', async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error(error);
            alert("Error al iniciar sesión: " + error.message);
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        window.location.reload();
    });

    async function loadServices() {
        const querySnapshot = await getDocs(collection(db, "services"));
        serviceSelect.innerHTML = '<option value="">Selecciona un servicio</option>';
        
        if (!querySnapshot.empty) {
            querySnapshot.forEach((doc) => {
                const service = doc.data();
                // Guardamos precio y nombre para usarlos al reservar
                servicesMap[doc.id] = { price: service.price_bob, name: service.name };
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = `${service.name} (${service.duration_minutes} min)`;
                serviceSelect.appendChild(option);
            });
        }
    }

    serviceSelect.addEventListener('change', (e) => {
        const serviceData = servicesMap[e.target.value];
        const price = serviceData ? serviceData.price : 0;
        priceDisplay.textContent = formatCurrency(price);
    });

    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const serviceId = serviceSelect.value;
        const barber = document.getElementById('barber-select').value;
        const date = document.getElementById('appointment-date').value;
        const imageFile = document.getElementById('style-image').files[0];

        if(!serviceId || !date) return alert('Completa todos los campos');

        let imageUrl = null;
        if (imageFile) {
            try {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${currentUser.uid}-${Date.now()}.${fileExt}`;
                const storageRef = ref(storage, `appointment-images/${fileName}`);
                const snapshot = await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            } catch (uploadError) {
                return alert('Error al subir imagen: ' + uploadError.message);
            }
        }

        try {
            const serviceData = servicesMap[serviceId];
            await addDoc(collection(db, "appointments"), {
                user_id: currentUser.uid,
                user_email: currentUser.email,
                user_name: currentUser.displayName || currentUser.email,
                service_id: serviceId,
                service_name: serviceData.name,
                service_price: serviceData.price,
                barber_name: barber,
                appointment_date: new Date(date).toISOString(),
                status: 'pending',
                image_url: imageUrl,
                created_at: new Date().toISOString()
            });
            
            alert('¡Cita reservada con éxito!');
            bookingForm.reset();
            priceDisplay.textContent = formatCurrency(0);
            loadAppointments();
        } catch (error) {
            alert('Error al reservar: ' + error.message);
        }
    });

    async function loadAppointments() {
        if (!currentUser) return;

        const q = query(
            collection(db, "appointments"), 
            where("user_id", "==", currentUser.uid),
            orderBy("appointment_date", "desc")
        );

        const list = document.getElementById('appointments-list');
        list.innerHTML = '';

        try {
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                const app = doc.data();
                const card = document.createElement('div');
                card.className = 'card';
                card.style.padding = '20px';
                const dateObj = new Date(app.appointment_date);
                
                const serviceName = app.service_name || "Servicio";
                const servicePrice = app.service_price || 0;

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${serviceName}</strong> con ${app.barber_name}<br>
                            <small>${dateObj.toLocaleString('es-BO')}</small>
                        </div>
                        <div style="text-align:right;">
                            <div style="color:var(--accent-color)">${formatCurrency(servicePrice)}</div>
                            <span style="color: ${app.status === 'confirmed' ? 'var(--accent-color)' : 'orange'}">
                                ${app.status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                `;
                list.appendChild(card);
            });
        } catch (e) {
            console.error("Error cargando citas:", e);
        }
    }
});