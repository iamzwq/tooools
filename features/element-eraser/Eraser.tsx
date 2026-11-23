import { useEffect, useState } from 'react';
import { Check, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { HoverHighlight, OVERLAY_Z, useElementPicker } from '@/lib/element-picker';

export interface HiddenRecord {
  el: Element & ElementCSSInlineStyle;
  value: string;
  priority: string;
}

export interface EraserStore {
  getCount(): number;
  hide(el: Element): boolean;
  undo(): boolean;
  restoreAll(): number;
  subscribe(listener: () => void): () => void;
}

export function createEraserStore(): EraserStore {
  const stack: HiddenRecord[] = [];
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const fn of listeners) fn();
  };

  const restore = (record: HiddenRecord) => {
    if (record.value) record.el.style.setProperty('display', record.value, record.priority);
    else record.el.style.removeProperty('display');
  };

  return {
    getCount: () => stack.length,
    hide(el: Element) {
      if (el === document.documentElement || el === document.body) return false;
      if (!('style' in el)) return false;
      const styled = el as Element & ElementCSSInlineStyle;
      const record: HiddenRecord = {
        el: styled,
        value: styled.style.getPropertyValue('display'),
        priority: styled.style.getPropertyPriority('display'),
      };
      styled.style.setProperty('display', 'none', 'important');
      stack.push(record);
      emit();
      return true;
    },
    undo() {
      const record = stack.pop();
      if (!record) return false;
      restore(record);
      emit();
      return true;
    },
    restoreAll() {
      const count = stack.length;
      if (!count) return 0;
      while (stack.length) restore(stack.pop()!);
      emit();
      return count;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

interface Props {
  /** Shadow host of this UI; events coming from it are ours and must not be intercepted. */
  host: HTMLElement;
  store: EraserStore;
  onExit: () => void;
}

const isErasable = (el: Element) => el !== document.documentElement && el !== document.body;

export default function Eraser({ host, store, onExit }: Props) {
  const [count, setCount] = useState(() => store.getCount());

  useEffect(() => {
    setCount(store.getCount());
    return store.subscribe(() => setCount(store.getCount()));
  }, [store]);

  const { hoverBox, hoverLabel, clearHover } = useElementPicker({
    host,
    accept: isErasable,
    onPick: (el) => {
      if (store.hide(el)) clearHover();
    },
    onExit,
    onKeyDown: (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        if (store.undo()) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    },
  });

  return (
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: OVERLAY_Z }}>
      {hoverBox && <HoverHighlight box={hoverBox} label={hoverLabel} tone="rose" />}

      <div className="pointer-events-auto fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover/95 px-3 py-1.5 text-xs text-popover-foreground shadow-2xl backdrop-blur">
        <span className="px-1 font-medium">
          {count > 0 ? `已隐藏 ${count} 个元素` : '点击元素临时隐藏'}
        </span>
        <ButtonGroup>
          <Button
            size="xs"
            variant="outline"
            disabled={count === 0}
            onClick={() => store.undo()}
            title="撤销上一次隐藏（Ctrl+Z）"
          >
            <Undo2 />
            撤销
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={count === 0}
            onClick={() => store.restoreAll()}
            title="恢复当前页所有被隐藏的元素"
          >
            <RotateCcw />
            恢复全部
          </Button>
        </ButtonGroup>
        <Button size="xs" onClick={onExit} title="退出擦除模式并保留隐藏状态（Esc）">
          <Check />
          完成
        </Button>
      </div>
    </div>
  );
}
