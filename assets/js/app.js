import { auth, db, storage, googleProvider, formatCurrency } from './config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, addDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
        const headerElement = document.querySelector('header');
        
        if (scrollPosition === 0) {
            headerElement.classList.remove('scroll-up', 'scroll-down');
            previousScrollPosition = 0;
            return;
        }
        
        const isScrollingDown = scrollPosition > previousScrollPosition;
        
        if (isScrollingDown) {
            headerElement.classList.remove('scroll-up');
            headerElement.classList.add('scroll-down');
        } else {
            headerElement.classList.remove('scroll-down');
            headerElement.classList.add('scroll-up');
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
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('user-name').textContent = user.displayName || user.email;
            
            // Mostrar/Ocultar secciones
            loginBtn?.classList.add('hidden');
            userInfo?.classList.remove('hidden');
            bookingSection?.classList.remove('hidden');
            historySection?.classList.remove('hidden');
            
            // Cargar datos
            loadServices();
            loadAppointments();
        } else {
            currentUser = null;
            loginBtn?.classList.remove('hidden');
            userInfo?.classList.add('hidden');
            bookingSection?.classList.add('hidden');
            historySection?.classList.add('hidden');
        }
    });

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
                    <h4>${service.name}</h4>
                    <span>${service.duration_minutes} min</span>
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
            const querySnapshot = await getDocs(q);
            list.innerHTML = ''; // Limpiar mensaje de carga

            if (querySnapshot.empty) {
                list.innerHTML = '<p>No tienes citas reservadas.</p>';
                return;
            }

            querySnapshot.forEach((doc) => {
                const app = doc.data();
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
        } catch (e) {
            console.error("Error cargando citas:", e);
            list.innerHTML = '<p>Error al cargar el historial.</p>';
        }
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

    bookingForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const serviceId = document.getElementById('selected-service-id').value;
        const barber = document.getElementById('barber-select').value;
        const date = document.getElementById('appointment-date').value;
        const imageFile = document.getElementById('style-image').files[0];

        if(!serviceId || !date || !barber) return alert('Por favor, completa todos los campos.');

        let imageUrl = null;
        if (imageFile) {
            try {
                const fileName = `app-${currentUser.uid}-${Date.now()}`;
                const storageRef = ref(storage, `appointment-images/${fileName}`);
                const snapshot = await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            } catch (err) {
                console.error("Error subiendo imagen:", err);
            }
        }

        try {
            const serviceData = servicesMap[serviceId];
            await addDoc(collection(db, "appointments"), {
                user_id: currentUser.uid,
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
});