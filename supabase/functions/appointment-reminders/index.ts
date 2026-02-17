// supabase/functions/appointment-reminders/index.ts

// Usamos las versiones npm compatibles con Deno para mayor estabilidad
import admin from "npm:firebase-admin@11.11.0";
import webpush from "npm:web-push@3.6.7";

// 1. CONFIGURACIÓN DE FIREBASE (Base de datos)
// Leemos el archivo JSON de credenciales desde la variable de entorno (Secret)
const serviceAccountStr = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

if (!serviceAccountStr) {
  console.error("Falta el secreto FIREBASE_SERVICE_ACCOUNT");
} else {
  // Inicializamos Firebase solo si no existe ya una instancia
  if (admin.apps.length === 0) {
    try {
      const serviceAccount = JSON.parse(serviceAccountStr);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin inicializado correctamente.");
    } catch (e) {
      console.error("Error inicializando Firebase:", e);
    }
  }
}

const db = admin.firestore();

// 2. CONFIGURACIÓN DE WEB PUSH (Notificaciones)
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@ejemplo.com";

webpush.setVapidDetails(
  vapidSubject,
  vapidPublicKey,
  vapidPrivateKey
);

Deno.serve(async (req) => {
  console.log("--- Iniciando chequeo de recordatorios ---");

  try {
    // Calculamos el rango de tiempo para las citas (ej. citas en los próximos 30 min)
    const now = new Date();
    const startTime = new Date(now.getTime() + 15 * 60000); // Dentro de 15 min
    const endTime = new Date(now.getTime() + 30 * 60000);   // Hasta dentro de 30 min

    // Convertimos a ISO String para comparar con lo que guardaste en Firestore
    const startIso = startTime.toISOString();
    const endIso = endTime.toISOString();

    console.log(`Buscando citas entre ${startIso} y ${endIso}`);

    // 3. BUSCAR CITAS EN FIRESTORE
    // Nota: Asegúrate de que 'appointment_date' en Firestore sea un ISO String exacto
    const appointmentsSnapshot = await db.collection("appointments")
      .where("status", "==", "confirmed") // Solo citas confirmadas
      .where("appointment_date", ">=", startIso)
      .where("appointment_date", "<=", endIso)
      .get();

    if (appointmentsSnapshot.empty) {
      console.log("No se encontraron citas próximas para notificar.");
      return new Response(JSON.stringify({ message: "Sin citas pendientes." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let notificationsSent = 0;

    // 4. PROCESAR CADA CITA ENCONTRADA
    const promises = appointmentsSnapshot.docs.map(async (doc) => {
      const appointment = doc.data();
      const userId = appointment.user_id;

      // Verificar si ya notificamos esta cita (opcional, requiere guardar un flag en la cita)
      if (appointment.reminder_sent) return;

      console.log(`Cita encontrada para usuario ${userId}: ${appointment.service_name}`);

      // Buscar la suscripción push del usuario
      const subDoc = await db.collection("push_subscriptions").doc(userId).get();

      if (!subDoc.exists) {
        console.log(`El usuario ${userId} no tiene suscripción push activa.`);
        return;
      }

      const subscription = subDoc.data().subscription;
      
      // Contenido de la notificación
      const payload = JSON.stringify({
        title: "¡Tu cita se acerca!",
        body: `Tu servicio de ${appointment.service_name} con ${appointment.barber_name} es a las ${new Date(appointment.appointment_date).toLocaleTimeString('es-BO', {hour: '2-digit', minute:'2-digit'})}.`,
      });

      try {
        // Enviar la notificación
        await webpush.sendNotification(subscription, payload);
        console.log(`Notificación enviada a ${userId}`);
        notificationsSent++;

        // Marcar la cita como notificada para no enviarla doble (opcional)
        await db.collection("appointments").doc(doc.id).update({
            reminder_sent: true
        });

      } catch (error: any) {
        console.error(`Error enviando a ${userId}:`, error);
        if (error.statusCode === 410) {
            // La suscripción ya no es válida (usuario revocó permiso), borrarla
            await db.collection("push_subscriptions").doc(userId).delete();
            console.log("Suscripción expirada eliminada.");
        }
      }
    });

    await Promise.all(promises);

    return new Response(
      JSON.stringify({ success: true, notificationsSent }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (error: any) {
    console.error("Error general en la función:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
