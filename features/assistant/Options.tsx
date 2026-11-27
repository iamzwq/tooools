import { useCallback, useEffect, useState } from 'react';
import { Ban, Eye, Settings2 } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { openOptionsPage } from '@/utils/options-page';
import { ASSISTANT_SHOW, ASSISTANT_STATUS, type AssistantPageStatus } from './messages';
import { blockSite, getAssistantSettings, unblockHost } from './settings';
import { matchesSite, siteOf } from './sites';

type PageState =
  | { kind: 'unsupported' }
  /** The tab was opened before the extension was installed or updated. */
  | { kind: 'reload' }
  | { kind: 'shown' | 'hidden'; tabId: number; site: string }
  | { kind: 'blocked'; hostname: string; by: string[] };

function parseUrl(href: string | undefined): URL | null {
  try {
    return href ? new URL(href) : null;
  } catch {
    return null;
  }
}

async function readPageState(): Promise<{ page: PageState; blockedCount: number }> {
  const { blockedSites } = await getAssistantSettings();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = parseUrl(tab?.url);
  const result = (page: PageState) => ({ page, blockedCount: blockedSites.length });
  if (tab?.id == null || !url || !/^(https?|file):$/.test(url.protocol)) return result({ kind: 'unsupported' });
  const by = blockedSites.filter((site) => matchesSite(url.hostname, site));
  if (url.hostname && by.length) return result({ kind: 'blocked', hostname: url.hostname, by });
  const status = (await browser.tabs
    .sendMessage(tab.id, { type: ASSISTANT_STATUS }, { frameId: 0 })
    .catch(() => undefined)) as AssistantPageStatus | undefined;
  if (!status) return result({ kind: 'reload' });
  return result({ kind: status.hidden ? 'hidden' : 'shown', tabId: tab.id, site: siteOf(url.hostname) });
}

export default function AssistantOptions() {
  const [state, setState] = useState<{ page: PageState; blockedCount: number } | null>(null);

  const refresh = useCallback(() => readPageState().then(setState), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!state) return null;
  const { page, blockedCount } = state;

  let status: string;
  let action: { label: string; icon: typeof Eye; run: () => Promise<unknown> } | null = null;
  switch (page.kind) {
    case 'unsupported':
      status = '当前页面无法显示小T';
      break;
    case 'reload':
      status = '刷新页面后显示小T';
      break;
    case 'shown':
      status = page.site ? `当前网站：${page.site}` : '当前页面';
      if (page.site) action = { label: '在此网站不显示', icon: Ban, run: () => blockSite(page.site) };
      break;
    case 'hidden':
      status = '已在当前页临时隐藏';
      action = {
        label: '恢复显示',
        icon: Eye,
        run: () => browser.tabs.sendMessage(page.tabId, { type: ASSISTANT_SHOW }, { frameId: 0 }),
      };
      break;
    case 'blocked':
      status = `已设置不在 ${page.by.join('、')} 显示`;
      action = { label: '恢复显示', icon: Eye, run: () => unblockHost(page.hostname) };
      break;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('truncate', page.kind === 'shown' ? 'text-muted-foreground' : 'text-foreground')} title={status}>
          {status}
        </span>
        {action && (
          <Button size="xs" variant="outline" className="shrink-0" onClick={() => void action.run().finally(refresh)}>
            <action.icon />
            {action.label}
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">不显示的网站：{blockedCount} 个</span>
        <Button size="xs" variant="outline" className="shrink-0" onClick={() => void openOptionsPage('assistant').then(() => window.close())}>
          <Settings2 />
          管理
        </Button>
      </div>
    </div>
  );
}
