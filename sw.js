// Este archivo es un "Service Worker". Se ejecuta en segundo plano
// para recibir notificaciones push incluso si la página no está abierta.

self.addEventListener('push', event => {
    // Intentamos leer los datos que vienen en la notificación.
    const data = event.data.json();
    console.log('Notificación push recibida:', data);

    const title = data.title || 'Recordatorio de Cita';
    const options = {
        body: data.body || 'Tu cita en Estilo & Corte está por comenzar.',
        icon: '/assets/images/favicon.png', // Puedes cambiar esto por el logo de tu barbería
        badge: '/assets/images/favicon.png' // Ícono para la barra de notificaciones (en Android)
    };

    // Mostramos la notificación.
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    // Al hacer clic en la notificación, abrimos la página principal.
    event.waitUntil(clients.openWindow('/index.html'));
});