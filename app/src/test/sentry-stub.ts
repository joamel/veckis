// Test-stub för @sentry/react-native. Riktiga paketet drar in react-native-
// interna moduler som inte laddas i vitest (node/jsdom) → aliasas hit i
// vitest.config.ts så app-kod som importerar Sentry kan köras i test.
export function init(): void {}
export function captureException(): string { return 'test-event-id'; }
export function flush(): Promise<boolean> { return Promise.resolve(true); }
export function getClient(): undefined { return undefined; }
