import { useEffect, useId, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={folderId}>保存到文件夹</Label>
        <Input
          id={folderId}
          placeholder="留空为根目录"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          onBlur={() => pan123FolderItem.setValue(folder.trim())}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className={status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
          {checking && '检测中…'}
          {status.kind === 'ok' && `已登录${status.name ? `：${status.name}` : ''}`}
          {status.kind === 'error' && status.message}
          {status.kind === 'loggedOut' && (
            <>
              未登录，
              <a className="text-foreground underline underline-offset-4" href={PAN123_HOME} target="_blank" rel="noreferrer">
                打开 123云盘登录
              </a>
            </>
          )}
        </span>
        <Button variant="outline" size="sm" onClick={check} disabled={checking}>
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          检测
        </Button>
      </div>
    </div>
  );
}