import { useEffect, useId, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ASSISTANT_FEATURE_ID } from '@/features/assistant/messages';
import { assistantSettingsItem, blockSite, getAssistantSettings, unblockSite } from '@/features/assistant/settings';
import { normalizeSite } from '@/features/assistant/sites';
import { Mascot } from '@/features/assistant/ui/Mascot';
import { getFeatureEnabledMap, setFeatureEnabled, watchFeatureEnabled } from '@/utils/feature-settings';
import { Field } from './fields';

export function AssistantSection() {
  const inputId = useId();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sites, setSites] = useState<string[] | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  // Also reflects changes made meanwhile from 小T's right-click menu or the popup.
  useEffect(() => {
    const loadEnabled = () => void getFeatureEnabledMap().then((map) => setEnabled(map[ASSISTANT_FEATURE_ID] !== false));
    const loadSites = () => void getAssistantSettings().then((s) => setSites(s.blockedSites));
    loadEnabled();
    loadSites();
    const unwatchFeatures = watchFeatureEnabled(loadEnabled);
    const unwatchSettings = assistantSettingsItem.watch(loadSites);
    return () => {
      unwatchFeatures();
      unwatchSettings();
    };
  }, []);

  if (enabled === null || !sites) return null;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const site = normalizeSite(input);
    if (!site) return setError('请输入有效的网址或域名，例如 example.com');
    if (sites.includes(site)) return setError(`${site} 已经在列表里了`);
    setError('');
    setInput('');
    await blockSite(site);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mascot mood="happy" className="size-6" />
          小T 悬浮助手
        </CardTitle>
        <CardDescription>
          在网页边缘显示小T：点击打开工具菜单，在 B站 / YouTube 视频页还能一键总结视频；右键小T 可以临时隐藏，或在当前网站不再显示。
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-5">
        <Field label="显示小T" hint="关闭后所有网页都不显示小T；在视频页仍可通过扩展弹窗里的 ✨ 按钮总结视频。">
          <div className="flex h-9 items-center">
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => {
                setEnabled(checked);
                void setFeatureEnabled(ASSISTANT_FEATURE_ID, checked);
              }}
              aria-label="在网页上显示小T"
            />
          </div>
        </Field>

        <Field
          label="不显示的网站"
          htmlFor={inputId}
          hint="同时对子域名生效，例如 example.com 也包括 www.example.com、docs.example.com。"
        >
          <form className="flex gap-2" onSubmit={(e) => void add(e)}>
            <Input
              id={inputId}
              value={input}
              placeholder="输入网址或域名，例如 example.com"
              spellCheck={false}
              aria-invalid={!!error || undefined}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
            />
            <Button type="submit" variant="outline" disabled={!input.trim()}>
              <Plus />
              添加
            </Button>
          </form>
          {error && <div className="text-xs text-destructive">{error}</div>}
          {sites.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {sites.map((site) => (
                <li key={site} className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-2 font-mono text-xs">
                  {site}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-5"
                    onClick={() => void unblockSite(site)}
                    title={`在 ${site} 恢复显示`}
                    aria-label={`移除 ${site}`}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-muted-foreground">还没有设置，小T 会在所有网页显示。</div>
          )}
        </Field>
      </CardContent>
    </Card>
  );
}
