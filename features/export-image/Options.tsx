import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { exportImageSettingsItem, getExportImageSettings, type ExportImageSettings } from './settings';

export default function ExportImageOptions() {
  const qualityId = useId();
  const backgroundId = useId();
  const saveAsId = useId();
  const [settings, setSettings] = useState<ExportImageSettings | null>(null);
  const [quality, setQuality] = useState('');

  useEffect(() => {
    void getExportImageSettings().then((s) => {
      setSettings(s);
      setQuality(String(s.quality));
    });
  }, []);

  if (!settings) return null;

  async function update(patch: Partial<ExportImageSettings>) {
    const next = { ...settings!, ...patch };
    setSettings(next);
    await exportImageSettingsItem.setValue(next);
  }

  function commitQuality() {
    const n = Math.round(Number(quality));
    const value = Number.isFinite(n) && quality.trim() ? Math.min(100, Math.max(1, n)) : settings!.quality;
    setQuality(String(value));
    if (value !== settings!.quality) void update({ quality: value });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={qualityId}>JPG / WebP 质量</Label>
          <Input
            id={qualityId}
            type="number"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            onBlur={commitQuality}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={backgroundId}>JPG 透明区域填充</Label>
          <Input
            id={backgroundId}
            type="color"
            className="p-1"
            value={settings.jpegBackground}
            onChange={(e) => void update({ jpegBackground: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={saveAsId}>每次询问保存位置</Label>
        <Switch id={saveAsId} checked={settings.saveAs} onCheckedChange={(checked) => void update({ saveAs: checked })} />
      </div>
    </div>
  );
}
