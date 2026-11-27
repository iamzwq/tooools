import { Fragment, useMemo, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { parseTimestamp } from '../prompt';

/*
 * A small Markdown renderer for model output: headings, (nested) lists, quotes, rules, bold,
 * inline code, links and clickable [mm:ss] timestamps. It builds React nodes (no innerHTML), and
 * unfinished syntax while streaming just shows as plain text.
 */

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'item'; depth: number; ordinal: string | null; text: string }
  | { type: 'quote'; text: string }
  | { type: 'rule' }
  | { type: 'para'; text: string };

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'para', text: para.join(' ') });
    para = [];
  };
  for (const raw of markdown.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/))) {
      flush();
      blocks.push({ type: 'heading', level: (m[1] ?? '').length, text: (m[2] ?? '').replace(/\s+#+$/, '') });
    } else if (/^\s{0,3}([-*_])(\s*\1){2,}$/.test(line)) {
      flush();
      blocks.push({ type: 'rule' });
    } else if ((m = line.match(/^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/))) {
      flush();
      const indent = (m[1] ?? '').replace(/\t/g, '    ').length;
      const marker = m[2] ?? '';
      blocks.push({
        type: 'item',
        depth: indent === 0 ? 0 : indent < 6 ? 1 : 2,
        ordinal: /\d/.test(marker) ? marker.slice(0, -1) : null,
        text: m[3] ?? '',
      });
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flush();
      blocks.push({ type: 'quote', text: m[1] ?? '' });
    } else if (!para.length && blocks.at(-1)?.type === 'item' && /^\s/.test(line)) {
      // Indented continuation of the previous list item.
      (blocks.at(-1) as Extract<Block, { type: 'item' }>).text += ` ${line.trim()}`;
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

const TIME = String.raw`\d{1,2}(?::\d{2}){1,2}`;
const INLINE_RE = new RegExp(
  [
    String.raw`\[(${TIME})(?:\s*[-–~～]\s*(${TIME}))?\]`, // [mm:ss] or [mm:ss - mm:ss]
    String.raw`\*\*(.+?)\*\*`, // **bold**
    String.raw`\x60([^\x60]+)\x60`, // `code`
    String.raw`\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)`, // [text](url)
  ].join('|'),
  'g',
);

function TimeChip({ label, onSeek }: { label: string; onSeek: (seconds: number) => void }) {
  const seconds = parseTimestamp(label);
  if (seconds === null) return <>{label}</>;
  return (
    <button
      type="button"
      onClick={() => onSeek(seconds)}
      title={`跳转到 ${label}`}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-0.5 rounded-md bg-indigo-500/10 px-1.5 py-px align-middle font-mono text-[11px] leading-4 font-medium text-indigo-600 tabular-nums transition hover:bg-indigo-500 hover:text-white dark:bg-indigo-400/15 dark:text-indigo-300 dark:hover:bg-indigo-400 dark:hover:text-indigo-950"
    >
      <Play className="size-2.5 fill-current" />
      {label}
    </button>
  );
}

function renderInline(text: string, onSeek: (seconds: number) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const key = `${index}`;
    if (m[1]) {
      nodes.push(
        <Fragment key={key}>
          <TimeChip label={m[1]} onSeek={onSeek} />
          {m[2] && (
            <>
              –<TimeChip label={m[2]} onSeek={onSeek} />
            </>
          )}
        </Fragment>,
      );
    } else if (m[3]) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {renderInline(m[3], onSeek)}
        </strong>,
      );
    } else if (m[4]) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 font-mono text-[12px]">
          {m[4]}
        </code>,
      );
    } else if (m[5]) {
      nodes.push(
        <a key={key} href={m[6]} target="_blank" rel="noreferrer" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-300">
          {m[5]}
        </a>,
      );
    }
    last = index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({
  text,
  onSeek,
  streaming = false,
}: {
  text: string;
  onSeek: (seconds: number) => void;
  streaming?: boolean;
}) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="flex flex-col gap-1.5 text-[13px] leading-6 text-foreground/90">
      {blocks.map((block, i) => {
        const caret = streaming && i === blocks.length - 1 ? <span className="tva-caret" /> : null;
        switch (block.type) {
          case 'heading':
            return (
              <h3
                key={i}
                className={
                  block.level <= 2
                    ? 'mt-3 flex items-center gap-2 text-[14px] font-semibold text-foreground first:mt-0'
                    : 'mt-2 text-[13px] font-semibold text-foreground first:mt-0'
                }
              >
                {block.level <= 2 && <span className="h-3.5 w-1 shrink-0 rounded-full bg-gradient-to-b from-violet-400 to-indigo-500" />}
                <span>
                  {renderInline(block.text, onSeek)}
                  {caret}
                </span>
              </h3>
            );
          case 'item':
            return (
              <div key={i} className="flex gap-2" style={{ paddingLeft: block.depth * 16 }}>
                {block.ordinal ? (
                  <span className="min-w-4 shrink-0 font-medium text-indigo-500 tabular-nums">{block.ordinal}.</span>
                ) : (
                  <span
                    className={`mt-[9px] size-1.5 shrink-0 rounded-full ${block.depth ? 'border border-indigo-400' : 'bg-indigo-400'}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  {renderInline(block.text, onSeek)}
                  {caret}
                </div>
              </div>
            );
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-indigo-300 pl-3 text-muted-foreground dark:border-indigo-500/60">
                {renderInline(block.text, onSeek)}
                {caret}
              </blockquote>
            );
          case 'rule':
            return <hr key={i} className="my-1 border-border" />;
          default:
            return (
              <p key={i}>
                {renderInline(block.text, onSeek)}
                {caret}
              </p>
            );
        }
      })}
      {streaming && blocks.length === 0 && <span className="tva-caret" />}
    </div>
  );
}
