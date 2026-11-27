import { useEffect, useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { clearSummaryCache, countCachedSummaries } from '@/features/video-summary/cache';
import {
  getVideoSummarySettings,
  updateVideoSummarySettings,
  type SummaryDetail,
  type SummaryLanguage,
  type VideoSummarySettings,
} from '@/features/video-summary/settings';
import { Field, selectClass, textareaClass } from './fields';

const LANGUAGES: { value: SummaryLanguage; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: '跟随字幕语言' },
];

const DETAILS: { value: SummaryDetail; label: string; hint: string }[] = [
  { value: 'brief', label: '简洁', hint: '一句话总结 + 3～5 个核心要点' },
  { value: 'standard', label: '标准', hint: '一句话总结 + 5～8 个要点 + 内容脉络' },
  { value: 'detailed', label: '详细', hint: '8～12 个要点 + 逐段脉络与细节' },
];

export function VideoSummarySection() {
  const ids = { language: useId(), prompt: useId() };
  const [settings, setSettings] = useState<VideoSummarySettings | null>(null);
  const [prompt, setPrompt] = useState('');
  const [cacheCount, setCacheCount] = useState(0);

  useEffect(() => {
    void getVideoSummarySettings().then((s) => {
      setSettings(s);
      setPrompt(s.customPrompt);
    });
    void countCachedSummaries().then(setCacheCount);
  }, []);

  if (!settings) return null;

  const update = (patch: Partial<VideoSummarySettings>) => {
    setSettings({ ...settings, ...patch });
    void updateVideoSummarySettings(patch);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>视频 AI 总结</CardTitle>
        <CardDescription>在 B站 / YouTube 视频页点击小T（或扩展弹窗里的 ✨ 按钮），即可一键总结视频。</CardDescription>
      </CardHeader>
      <CardContent className="gap-5">
        <Field label="总结语言" htmlFor={ids.language}>
          <select
            id={ids.language}
            className={`${selectClass} sm:w-48`}
            value={settings.language}
            onChange={(e) => update({ language: e.target.value as SummaryLanguage })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="详细程度" hint={DETAILS.find((d) => d.value === settings.detail)?.hint}>
          <ButtonGroup>
            {DETAILS.map((d) => (
              <Button key={d.value} variant={settings.detail === d.value ? 'default' : 'outline'} onClick={() => update({ detail: d.value })}>
                {d.label}
              </Button>
            ))}
          </ButtonGroup>
        </Field>

        <Field label="额外要求" htmlFor={ids.prompt} hint="会附加在提示词末尾，对所有视频生效。">
          <textarea
            id={ids.prompt}
            className={textareaClass}
            value={prompt}
            placeholder={'例如：\n用通俗易懂的语言解释专业术语\n重点关注视频中的具体数据和操作步骤'}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={() => prompt !== settings.customPrompt && update({ customPrompt: prompt })}
          />
        </Field>

        <Field label="总结缓存" hint="同一个视频再次打开时直接显示上次的总结；在面板中点击「重新生成」可以刷新。">
          <div className="flex h-9 items-center gap-3 text-sm">
            <span className="text-muted-foreground">已缓存 {cacheCount} 个视频的总结</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!cacheCount}
              onClick={() => void clearSummaryCache().then(() => setCacheCount(0))}
            >
              <Trash2 />
              清空
            </Button>
          </div>
        </Field>
      </CardContent>
    </Card>
  );
}
