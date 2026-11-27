import { useEffect, useId, useState } from 'react';
import { CircleAlert, CircleCheck, ExternalLink, Eye, EyeOff, ListChecks, Loader2, PlugZap, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { chat, listModels } from '@/lib/ai/client';
import { AI_PROVIDERS, findProvider } from '@/lib/ai/providers';
import { aiModelSettingsItem, getAiModelSettings, toChatEndpoint, type AiModelSettings } from '@/lib/ai/settings';
import { cn } from '@/lib/utils';
import { Field, selectClass } from './fields';

type TestResult = { ok: true; text: string } | { ok: false; text: string };

export function AiModelSection() {
  const ids = { provider: useId(), baseUrl: useId(), apiKey: useId(), model: useId() };
  const [saved, setSaved] = useState<AiModelSettings | null>(null);
  const [draft, setDraft] = useState<AiModelSettings | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    void getAiModelSettings().then((s) => {
      setSaved(s);
      setDraft(s);
    });
  }, []);

  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(id);
  }, [justSaved]);

  if (!saved || !draft) return null;

  const provider = findProvider(draft.providerId);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const update = (patch: Partial<AiModelSettings>) => {
    setDraft({ ...draft, ...patch });
    setResult(null);
  };

  const selectProvider = (id: string) => {
    const next = findProvider(id);
    // Switching back to the saved provider restores its key and model; others start blank.
    const same = id === saved.providerId;
    update({
      providerId: id,
      baseUrl: same ? saved.baseUrl : (next?.baseUrl ?? ''),
      apiKey: same ? saved.apiKey : '',
      model: same ? saved.model : (next?.defaultModel ?? ''),
    });
    setModels(null);
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const list = await listModels(toChatEndpoint(draft), AbortSignal.timeout(15_000));
      setModels(list);
      if (!list.length) setResult({ ok: false, text: '服务商没有返回可用的模型列表，请手动填写模型名称' });
    } catch (err) {
      setResult({ ok: false, text: `获取模型列表失败：${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setLoadingModels(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    const started = performance.now();
    try {
      const reply = await chat(toChatEndpoint(draft), [{ role: 'user', content: '请只回复“连接成功”四个字。' }], AbortSignal.timeout(60_000));
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      setResult({ ok: true, text: `连接成功 · ${draft.model} · ${seconds} 秒 · 回复：${reply.content.trim().slice(0, 40)}` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const next = {
      ...draft,
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
    };
    await aiModelSettingsItem.setValue(next);
    setSaved(next);
    setDraft(next);
    setJustSaved(true);
  };

  const canTest = !!draft.baseUrl.trim() && !!draft.model.trim() && (!!draft.apiKey.trim() || !!provider?.keyOptional);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI 模型</CardTitle>
        <CardDescription>为「视频 AI 总结」等 AI 功能提供模型服务，支持所有兼容 OpenAI 接口格式的服务商。</CardDescription>
      </CardHeader>
      <CardContent className="gap-5">
        <Field label="服务商" htmlFor={ids.provider}>
          <select id={ids.provider} className={selectClass} value={draft.providerId} onChange={(e) => selectProvider(e.target.value)}>
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Base URL"
          htmlFor={ids.baseUrl}
          hint={
            provider?.baseUrl && draft.baseUrl.trim() !== provider.baseUrl ? (
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => update({ baseUrl: provider.baseUrl })}>
                恢复默认地址 {provider.baseUrl}
              </button>
            ) : (
              '请求会发送到「Base URL + /chat/completions」'
            )
          }
        >
          <Input
            id={ids.baseUrl}
            value={draft.baseUrl}
            placeholder="https://api.example.com/v1"
            spellCheck={false}
            onChange={(e) => update({ baseUrl: e.target.value })}
          />
        </Field>

        <Field
          label="API Key"
          htmlFor={ids.apiKey}
          hint={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{provider?.keyOptional ? '本地服务通常不需要 Key，可以留空。' : '只保存在本机浏览器，不会同步到云端。'}</span>
              {provider?.keyUrl && (
                <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2">
                  获取 API Key
                  <ExternalLink className="size-3" />
                </a>
              )}
            </span>
          }
        >
          <div className="flex gap-2">
            <Input
              id={ids.apiKey}
              type={showKey ? 'text' : 'password'}
              value={draft.apiKey}
              placeholder={provider?.keyOptional ? '可选' : 'sk-...'}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              onChange={(e) => update({ apiKey: e.target.value })}
            />
            <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)} title={showKey ? '隐藏' : '显示'} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
              {showKey ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </Field>

        <Field
          label="模型"
          htmlFor={ids.model}
          hint={
            models?.length ? (
              <span className="flex flex-wrap gap-1.5">
                {models.slice(0, 24).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => update({ model: m })}
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition hover:bg-muted',
                      m === draft.model && 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </span>
            ) : (
              '填写服务商提供的模型名称，也可以点击「获取列表」选择'
            )
          }
        >
          <div className="flex gap-2">
            <Input
              id={ids.model}
              value={draft.model}
              placeholder="例如 deepseek-flash"
              spellCheck={false}
              className="font-mono"
              onChange={(e) => update({ model: e.target.value })}
            />
            <Button variant="outline" onClick={() => void fetchModels()} disabled={loadingModels || !draft.baseUrl.trim()}>
              {loadingModels ? <Loader2 className="animate-spin" /> : <ListChecks />}
              获取列表
            </Button>
          </div>
        </Field>

        {provider?.thinkingParams && (
          <Field label="深度思考" hint="让模型先推理再作答，总结会更严谨，但等待时间会明显变长。">
            <div className="flex h-9 items-center">
              <Switch checked={draft.thinking} onCheckedChange={(checked) => update({ thinking: checked })} aria-label="深度思考" />
            </div>
          </Field>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-3 border-t">
        <Button variant="outline" onClick={() => void test()} disabled={testing || !canTest}>
          {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
          测试连接
        </Button>
        {result && (
          <span className={cn('flex min-w-0 flex-1 items-start gap-1.5 text-xs leading-5', result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
            {result.ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
            <span className="break-all">{result.text}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {justSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400">已保存</span>}
          {dirty && !justSaved && <span className="text-xs text-amber-600 dark:text-amber-400">有未保存的修改</span>}
          <Button onClick={() => void save()} disabled={!dirty}>
            <Save />
            保存
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
