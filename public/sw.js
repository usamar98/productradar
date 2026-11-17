function openDeliveryStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("restock-radar-deliveries", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("events", { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function reserveEvent(id) {
  const database = await openDeliveryStore();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("events", "readwrite");
      const store = transaction.objectStore("events");
      let duplicate = false;
      const request = store.get(id);
      request.onsuccess = () => {
        duplicate = Boolean(request.result);
        if (!duplicate) store.put({ id, seenAt: Date.now() });
      };
      transaction.oncomplete = () => resolve(!duplicate);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data ? event.data.json() : {}; } catch { return; }
  const title = typeof payload.title === "string" ? payload.title : "Restock Radar";
  const body = typeof payload.body === "string" ? payload.body : "An update is available in your watch.";
  const url = payload.url || payload.data?.url || "/alerts/manage";
  event.waitUntil((async () => {
    const deliveryId = payload.notificationId || payload.tag || payload.eventId;
    if (typeof deliveryId === "string") {
      try { if (!(await reserveEvent(deliveryId))) return; }
      catch { /* A stable tag still replaces a prior notification if storage is unavailable. */ }
    }
    await self.registration.showNotification(title, { body, icon: "/radar-icon.svg", tag: deliveryId || "restock-radar", data: { url } });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url = new URL("/alerts/manage", self.location.origin);
  try {
    const requested = new URL(event.notification.data?.url, self.location.origin);
    if (requested.origin === self.location.origin) url = requested;
  } catch { /* Use the account page when a destination is invalid. */ }
  event.waitUntil(clients.openWindow(url.toString()));
});
