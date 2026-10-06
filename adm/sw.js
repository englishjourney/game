// Service Worker para disparar notificações em segundo plano
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Ouve mensagens enviadas pelo site principal para programar as notificações
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
        const aulasDeHoje = event.data.aulas;
        
        if (aulasDeHoje && aulasDeHoje.length > 0) {
            let corpoNotificacao = aulasDeHoje.map(a => `• ${a.time} - ${a.serie}${a.team}: ${a.activities.substring(0, 40)}...`).join('\n');
            
            self.registration.showNotification("📅 Suas Aulas de Hoje", {
                body: corpoNotificacao,
                icon: "https://cdn-icons-png.flaticon.com/512/3652/3652191.png",
                badge: "https://cdn-icons-png.flaticon.com/512/3652/3652191.png",
                tag: "planejamento-diario",
                requireInteraction: true
            });
        }
    }
});
