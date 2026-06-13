import * as React from 'react';
import { pushApi } from '@/api/push';

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray.buffer;
}

function getDeviceName(): string {
  const browser = navigator.userAgent.includes('Firefox') ? 'Firefox'
    : navigator.userAgent.includes('Edg') ? 'Edge'
      : navigator.userAgent.includes('Chrome') ? 'Chrome'
        : navigator.userAgent.includes('Safari') ? 'Safari'
          : 'Browser';
  return `${browser} на ${navigator.platform || 'устройстве'}`;
}

export function usePushNotifications() {
  const [permission, setPermission] = React.useState<NotificationPermission>(() => (
    'Notification' in window ? Notification.permission : 'denied'
  ));
  const [isSubscribed, setIsSubscribed] = React.useState(false);
  const [isSupported] = React.useState(() => (
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  ));
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refreshSubscriptionState = React.useCallback(async () => {
    if (!isSupported) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') {
      await pushApi.subscribe({ ...subscription.toJSON(), deviceName: getDeviceName() });
    }
    setIsSubscribed(Boolean(subscription));
    setPermission(Notification.permission);
  }, [isSupported]);

  React.useEffect(() => {
    void refreshSubscriptionState().catch(() => undefined);
  }, [refreshSubscriptionState]);

  const subscribe = React.useCallback(async () => {
    if (!isSupported) {
      setError('Push-уведомления не поддерживаются этим браузером');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') return;

      const { publicKey, configured } = await pushApi.getVapidKey();
      if (!configured || !publicKey) {
        setError('Push-уведомления ещё не настроены на сервере');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKey),
      });

      await pushApi.subscribe({ ...subscription.toJSON(), deviceName: getDeviceName() });
      setIsSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось включить push-уведомления');
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = React.useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await pushApi.unsubscribe(subscription?.endpoint);
      await subscription?.unsubscribe();
      setIsSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отключить push-уведомления');
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const sendTest = React.useCallback(async () => {
    await pushApi.sendTest();
  }, []);

  return {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    sendTest,
    refreshSubscriptionState,
  };
}
