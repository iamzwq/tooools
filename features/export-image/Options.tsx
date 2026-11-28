import { useEffect, useId, useRef, useState } from 'react';
import { Ban, Eye } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { matchesSite, siteOf } from '@/lib/sites';
import { exportImageSettingsItem, getExportImageSettings, type ExportImageSettings } from './settings';

/** storage.sync allows ~120 writes/minute; a color picker fires input events continuously while dragging. */
const SAVE_DELAY = 400;

/** Hostname of the active tab, if it's a web page where the hover button can appear. */
async function currentHostname(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab?.url ?? '');
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.hostname || null : null;
  } catch {
    return null;
  }
}

export default function ExportImageOptions() {
  const qualityId = useId();
  const backgroundId = useId();
  const saveAsId = useId();
  const hoverCopyId = useId();
  const [settings, setSettings] = useState<ExportImageSettings | null>(null);
  const [quality, setQuality] = useState('');
  const [hostname, setHostname] = useState<string | null>(null);
  const pending = useRef<ExportImageSettings | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = () => {
    clearTimeout(saveTimer.current);
    if (!pending.current) return;
    void exportImageSettingsItem.setValue(pending.current);
    pending.current = null;
  };

  useEffect(() => {
    void getExportImageSettings().then((s) => {
      setSettings(s);
      setQuality(String(s.quality));
    });
    void currentHostname().then(setHostname);
    // The popup can close right after a change; save what's pending.
    addEventListener('pagehide', flush);
    return () => removeEventListener('pagehide', flush);
  }, []);

  if (!settings) return null;

  function update(patch: Partial<ExportImageSettings>, { debounce = false } = {}) {
    const next = { ...settings!, ...patch };
    setSettings(next);
    pending.current = next;
    clearTimeout(saveTimer.current);
    if (debounce) saveTimer.current = setTimeout(flush, SAVE_DELAY);
    else flush();
  }

  function commitQuality() {
    const n = Math.round(Number(quality));
    const value = Number.isFinite(n) && quality.trim() ? Math.min(100, Math.max(1, n)) : settings!.quality;
    setQuality(String(value));
    if (value !== settings!.quality) update({ quality: value });
  }

  const blockedBy = hostname ? settings.hoverCopyBlockedSites.filter((site) => matchesSite(hostname, site)) : [];
  const toggleSite = () => {
    if (!hostname) return;
    const sites = settings.hoverCopyBlockedSites;
    update({
      hoverCopyBlockedSites: blockedBy.length
        ? sites.filter((site) => !matchesSite(hostname, site))
        : [...new Set([...sites, siteOf(hostname)])],
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={hoverCopyId} className="text-xs font-normal text-muted-foreground">
          鼠标移到图片上显示「复制」按钮
        </Label>
        <Switch
          id={hoverCopyId}
          size="sm"
          checked={settings.hoverCopy}
          onCheckedChange={(checked) => update({ hoverCopy: checked })}
        />
      </div>
      {settings.hoverCopy && hostname && (
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate text-muted-foreground"
            title={blockedBy.length ? `已设置不在 ${blockedBy.join('、')} 显示` : siteOf(hostname)}
          >
            {blockedBy.length ? `已设置不在 ${blockedBy.join('、')} 显示` : `当前网站：${siteOf(hostname)}`}
          </span>
          <Button size="xs" variant="outline" className="shrink-0" onClick={toggleSite}>
            {blockedBy.length ? <Eye /> : <Ban />}
            {blockedBy.length ? '恢复显示' : '在此网站不显示'}
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={qualityId} className="text-xs font-normal text-muted-foreground">
          JPG / WebP 质量
        </Label>
        <Input
          id={qualityId}
          type="number"
          min={1}
          max={100}
          className="h-7 w-16 bg-background px-2 text-xs md:text-xs"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          onBlur={commitQuality}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={backgroundId} className="text-xs font-normal text-muted-foreground">
          JPG 透明背景
        </Label>
        <Input
          id={backgroundId}
          type="color"
          className="h-7 w-16 bg-background p-0.5"
          value={settings.jpegBackground}
          onChange={(e) => update({ jpegBackground: e.target.value }, { debounce: true })}
          onBlur={flush}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={saveAsId} className="text-xs font-normal text-muted-foreground">
          每次询问保存位置
        </Label>
        <Switch
          id={saveAsId}
          size="sm"
          checked={settings.saveAs}
          onCheckedChange={(checked) => update({ saveAs: checked })}
        />
      </div>
    </div>
  );
}
