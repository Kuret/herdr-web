// VAPID application server keys arrive base64url-encoded; PushManager wants raw bytes
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
        output[i] = raw.charCodeAt(i);
    }
    return output;
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration || !('pushManager' in registration)) {
        return null;
    }
    const keyResponse = await fetch('/push/public-key');
    const { publicKey } = (await keyResponse.json()) as { publicKey: string };
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
    await fetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
    });
    return subscription;
}

export async function unsubscribeFromPush(): Promise<void> {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) {
        return;
    }
    await fetch('/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
}
