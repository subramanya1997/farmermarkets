export type GoogleEventProperties = Record<string, string | number | boolean | null>;
type GoogleEventSender = (name: string, properties: GoogleEventProperties) => void;

/** Hold early client events until the property's first config command is sent. */
export function createGoogleAnalyticsQueue(maxPending = 100) {
  const pending: { name: string; properties: GoogleEventProperties }[] = [];
  let sender: GoogleEventSender | undefined;

  return {
    track(name: string, properties: GoogleEventProperties) {
      if (sender) {
        sender(name, properties);
        return;
      }
      // A blocked/disabled script should never cause unbounded memory growth.
      if (pending.length >= maxPending) pending.shift();
      pending.push({ name, properties: { ...properties } });
    },
    ready(send: GoogleEventSender) {
      sender = send;
      const events = pending.splice(0);
      for (const event of events) send(event.name, event.properties);
    },
  };
}
