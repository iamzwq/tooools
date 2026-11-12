import { normalizeToken, pan123AuthItem, PAN123_MATCHES } from '@/features/save-image-to-123pan/auth';

/** Syncs the 123云盘 web login token into extension storage while a 123pan page is open. */
export default defineContentScript({
  matches: PAN123_MATCHES,
  runAt: 'document_idle',
  main(ctx) {
    let last: string | null = null;
    const sync = async () => {
      const token = normalizeToken(localStorage.getItem('authorToken'));
      if (!token || token === last) return;
      last = token;
      await pan123AuthItem.setValue({ token, origin: location.origin, updatedAt: Date.now() });
    };
    void sync();
    // localStorage changes in the same tab don't fire `storage` events, so poll for login.
    ctx.setInterval(() => void sync(), 3000);
  },
});
