import { auth, db, supabase, googleProvider, formatCurrency } from './config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, addDoc, query, where, orderBy, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Usamos una estructura más limpia para evitar errores de scope
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const bookingSection = document.getElementById('booking-section');
    const historySection = document.getElementById('history-section');
    const serviceGrid = document.getElementById('service-grid');
    const priceDisplay = document.getElementById('price-display');
    const bookingForm = document.getElementById('booking-form');
    
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');

    let currentUser = null;
    let servicesMap = {};
    let countdownInterval = null;

    // --- LÓGICA DE NAVEGACIÓN ---
    if(navToggle && navMenu) {
        navToggle.addEventListener('click', () => navMenu.classList.toggle('active'));
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => navMenu.classList.remove('active'));
        });
    }

    // --- ANIMACIÓN BARRA DE NAVEGACIÓN (Sticky Smart) ---
    let previousScrollPosition = 0;
    const header = document.querySelector('header');
    
    const handleScroll = () => {
        const scrollPosition = window.scrollY;
        
        if (scrollPosition === 0) {
            header.classList.remove('scroll-up', 'scroll-down');
            previousScrollPosition = 0;
            return;
        }
        
        const isScrollingDown = scrollPosition > previousScrollPosition;
        
        if (isScrollingDown) {
            header.classList.remove('scroll-up');
            header.classList.add('scroll-down');
        } else {
            header.classList.remove('scroll-down');
            header.classList.add('scroll-up');
        }
        
        previousScrollPosition = scrollPosition;
    };
    window.addEventListener('scroll', handleScroll);

    // --- CARRUSEL HERO ---
    const heroImages = document.querySelectorAll('.hero-slider img');
    if(heroImages.length > 0) {
        let currentImg = 0;
        setInterval(() => {
            heroImages[currentImg].classList.remove('active');
            currentImg = (currentImg + 1) % heroImages.length;
            heroImages[currentImg].classList.add('active');
        }, 5000); // Cambia cada 5 segundos
    }

    // --- OBSERVAR ESTADO DE AUTH ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // --- Redirección para administradores ---
            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
    
                if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
                    // Si es admin y está en la página principal, redirigir al dashboard
                    const path = window.location.pathname;
                    if (path.endsWith('/') || path.endsWith('index.html')) {
                        window.location.href = 'admin.html';
                        return; // Detener la ejecución para evitar cargar el resto de la página de usuario
                    }
                }
            } catch (error) {
                console.error("Error al verificar rol de admin en login:", error);
            }
            currentUser = user;
            const userNameDisplay = document.getElementById('user-name');
            if (userNameDisplay) userNameDisplay.textContent = user.displayName || user.email;
            
            // Mostrar/Ocultar secciones
            loginBtn?.classList.add('hidden');
            userInfo?.classList.remove('hidden');
            bookingSection?.classList.remove('hidden');
            historySection?.classList.remove('hidden');
            
            // Cargar datos
            loadServices();
            loadAppointments();
            initializePushNotifications(); // Iniciar lógica de notificaciones push
        } else {
            currentUser = null;
            loginBtn?.classList.remove('hidden');
            userInfo?.classList.add('hidden');
            bookingSection?.classList.add('hidden');
            historySection?.classList.add('hidden');
            if (countdownInterval) clearInterval(countdownInterval);
            document.getElementById('countdown-section')?.classList.add('hidden');
        }
    });

    // --- LÓGICA DE NOTIFICACIONES PUSH ---

    // Helper para convertir la clave VAPID a un formato usable
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function saveSubscription(subscription) {
        if (!currentUser) return;
        // Usaremos una nueva colección 'push_subscriptions' para guardar los datos.
        const subscriptionRef = doc(db, "push_subscriptions", currentUser.uid);
        try {
            // Firestore necesita un objeto plano, por eso convertimos la suscripción.
            const plainSubscription = JSON.parse(JSON.stringify(subscription));
            await setDoc(subscriptionRef, {
                subscription: plainSubscription,
                userId: currentUser.uid,
                updatedAt: new Date().toISOString()
            }, { merge: true }); // 'merge: true' crea o actualiza el documento.
            console.log('Suscripción para notificaciones guardada.');
        } catch (error) {
            console.error('Error al guardar la suscripción:', error);
        }
    }

    async function initializePushNotifications() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Las notificaciones push no son soportadas en este navegador.');
            return;
        }

        try {
            const swRegistration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registrado con éxito.');

            let subscription = await swRegistration.pushManager.getSubscription();
            if (subscription === null) {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    console.warn('El permiso para notificaciones no fue concedido.');
                    return;
                }

                // IMPORTANTE: Debes generar tus propias claves VAPID y poner la pública aquí.
                const VAPID_PUBLIC_KEY = "BOaRHX9yQ3W8E_Hbss8_Q0daLrpA1KY_-EUfx-IdG9YIhsH_iLbPZQUv6c0zxdHsoAtVoL6wFoHOP7nzj2aNyN8";
                const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
                
                subscription = await swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });
                await saveSubscription(subscription);
            }
        } catch (error) {
            console.error('Error con el Service Worker o la suscripción push:', error);
        }
    }

    // --- FUNCIONES ASÍNCRONAS CORREGIDAS ---

    // ERROR CORREGIDO: Se agregó 'async' a la función
    async function loadServices() {
        try {
            const querySnapshot = await getDocs(collection(db, "services"));
            serviceGrid.innerHTML = ''; // Limpiar grid
            
            querySnapshot.forEach((doc) => {
                const service = doc.data();
                servicesMap[doc.id] = { price: service.price_bob, name: service.name };
                
                // Crear tarjeta de servicio
                const card = document.createElement('div');
                card.className = 'service-option';
                card.innerHTML = `
                    <img src="${service.image_url || 'https://via.placeholder.com/150'}" alt="${service.name}">
                    <div class="service-option-info">
                        <h4>${service.name}</h4>
                        <span>${service.duration_minutes} min</span>
                    </div>
                `;
                
                card.addEventListener('click', () => {
                    // Remover selección previa
                    document.querySelectorAll('.service-option').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    document.getElementById('selected-service-id').value = doc.id;
                    priceDisplay.textContent = formatCurrency(service.price_bob);
                });
                serviceGrid.appendChild(card);
            });
        } catch (error) {
            console.error("Error cargando servicios:", error);
        }
    }

    async function loadAppointments() {
        if (!currentUser) return;

        // Nota: Si esto falla, revisa la consola. Firebase te pedirá crear un "Índice" (Index)
        const q = query(
            collection(db, "appointments"), 
            where("user_id", "==", currentUser.uid),
            orderBy("appointment_date", "desc")
        );

        const list = document.getElementById('appointments-list');
        list.innerHTML = '<p>Cargando citas...</p>';

        try {
            // Limpiar contador anterior antes de cargar nuevas citas
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            document.getElementById('countdown-section').classList.add('hidden');

            const querySnapshot = await getDocs(q);
            list.innerHTML = ''; // Limpiar mensaje de carga

            if (querySnapshot.empty) {
                list.innerHTML = '<p>No tienes citas reservadas.</p>';
                return;
            }

            const appointments = [];
            querySnapshot.forEach(doc => appointments.push(doc.data()));

            let nextAppointment = null;
            const now = new Date();

            // La lista está ordenada de más nueva a más vieja (desc).
            // Buscamos la próxima cita recorriendo la lista al revés.
            for (let i = appointments.length - 1; i >= 0; i--) {
                const app = appointments[i];
                const dateObjCheck = new Date(app.appointment_date);
                if (dateObjCheck > now && (app.status === 'pending' || app.status === 'confirmed')) {
                    nextAppointment = app;
                    break; // Encontramos la cita futura más cercana
                }
            }

            appointments.forEach((app) => {
                const dateObj = new Date(app.appointment_date);
                const card = document.createElement('div');
                card.className = 'card';
                card.style.padding = '20px';
                card.style.marginBottom = '10px';

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${app.service_name}</strong> con ${app.barber_name}<br>
                            <small>${dateObj.toLocaleString('es-BO')}</small>
                        </div>
                        <div style="text-align:right;">
                            <div style="color:var(--accent-color)">${formatCurrency(app.service_price)}</div>
                            <span style="color: ${app.status === 'confirmed' ? '#4CAF50' : '#FF9800'}">
                                ${app.status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                `;
                list.appendChild(card);
            });

            // Si se encontró una próxima cita, iniciar el contador
            if (nextAppointment) {
                const countdownSection = document.getElementById('countdown-section');
                countdownSection.classList.remove('hidden');
                startCountdown(
                    nextAppointment.appointment_date, 
                    `${nextAppointment.service_name} con ${nextAppointment.barber_name}`
                );
            }
            else {
                console.log("No se encontró una próxima cita válida para mostrar el contador.");
            }

        } catch (e) {
            console.error("Error cargando citas:", e);
            list.innerHTML = '<p>Error al cargar el historial.</p>';
        }
    }

    function startCountdown(targetDate, details) {
        if (countdownInterval) clearInterval(countdownInterval);

        const detailsEl = document.getElementById('next-appointment-details');
        detailsEl.textContent = details;

        const daysEl = document.getElementById('days');
        const hoursEl = document.getElementById('hours');
        const minutesEl = document.getElementById('minutes');
        const secondsEl = document.getElementById('seconds');

        const targetTime = new Date(targetDate).getTime();

        countdownInterval = setInterval(() => {
            const now = new Date().getTime();
            const distance = targetTime - now;

            if (distance < 0) {
                clearInterval(countdownInterval);
                document.getElementById('countdown-section').classList.add('hidden');
                return;
            }

            daysEl.textContent = String(Math.floor(distance / (1000 * 60 * 60 * 24))).padStart(2, '0');
            hoursEl.textContent = String(Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0');
            minutesEl.textContent = String(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
            secondsEl.textContent = String(Math.floor((distance % (1000 * 60)) / 1000)).padStart(2, '0');
        }, 1000);
    }

    // --- EVENTOS ---

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            try {
                await signInWithPopup(auth, googleProvider);
            } catch (error) {
                console.error("Error login:", error);
                alert("Error: " + error.message);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.reload();
        });
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const serviceId = document.getElementById('selected-service-id').value;
        const barber = document.getElementById('barber-select').value;
        const date = document.getElementById('appointment-date').value;
        const imageFile = document.getElementById('style-image').files[0];

        if(!serviceId || !date || !barber) return alert('Por favor, completa todos los campos.');

        // Validación de fecha futura
        const selectedDate = new Date(date);
        if (selectedDate < new Date()) {
            return alert('No puedes reservar una cita en una fecha pasada. Por favor, elige una fecha y hora futuras.');
        }

        let imageUrl = null;
        if (imageFile) {
            try {
                // Lógica de subida con Supabase
                const fileName = `${currentUser.uid}-${Date.now()}`;
                const { error: uploadError } = await supabase.storage
                    .from('appointment-images')
                    .upload(fileName, imageFile);

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('appointment-images').getPublicUrl(fileName);
                imageUrl = urlData.publicUrl;
            } catch (err) {
                console.error("Error subiendo imagen a Supabase:", err);
            }
        }

        try {
            const serviceData = servicesMap[serviceId];
            await addDoc(collection(db, "appointments"), {
                user_id: currentUser.uid,
                user_name: currentUser.displayName,
                user_email: currentUser.email,
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
            loadAppointments();
        } catch (error) {
            alert('Error al reservar: ' + error.message);
        }
    });
    }
});