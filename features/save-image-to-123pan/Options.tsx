import { useEffect, useId, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { pan123AuthItem, pan123FolderItem, PAN123_HOME, refreshAuthFromOpenTabs } from './auth';
import { Pan123Client } from './client';

type Status = { kind: 'checking' } | { kind: 'loggedOut' } | { kind: 'ok'; name: string } | { kind: 'error'; message: string };

export default function Pan123Options() {
  const folderId = useId();
  const [folder, setFolder] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'checking' });

  useEffect(() => {
    void pan123FolderItem.getValue().then(setFolder);
    void check();
  }, []);

  async function check() {
    setStatus({ kind: 'checking' });
    const auth = (await pan123AuthItem.getValue()) ?? (await refreshAuthFromOpenTabs());
    if (!auth) return setStatus({ kind: 'loggedOut' });
    try {
      const info = await new Pan123Client(auth).getUserInfo();
      const name = String(info.Nickname ?? info.nickname ?? info.Passport ?? '');
      setStatus({ kind: 'ok', name });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const checking = status.kind === 'checking';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={folderId} className="shrink-0 text-xs font-normal text-muted-foreground">
          文件夹
        </Label>
        <Input
          id={folderId}
          placeholder="根目录"
          className="h-7 w-36 bg-background px-2 text-xs md:text-xs"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          onBlur={() => pan123FolderItem.setValue(folder.trim())}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              status.kind === 'ok' ? 'bg-emerald-500' : status.kind === 'checking' ? 'bg-neutral-400' : 'bg-rose-500',
            )}
          />
          <span className={cn('truncate', status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground')} title={status.kind === 'error' ? status.message : undefined}>
            {checking && '检测中…'}
            {status.kind === 'ok' && (status.name || '已登录')}
            {status.kind === 'error' && status.message}
            {status.kind === 'loggedOut' && (
              <a className="text-foreground underline underline-offset-2" href={PAN123_HOME} target="_blank" rel="noreferrer">
                未登录，去登录
              </a>
            )}
          </span>
        </span>
        <Button variant="ghost" size="icon-xs" onClick={check} disabled={checking} title="重新检测" aria-label="重新检测登录状态">
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>
    </div>
  );
}