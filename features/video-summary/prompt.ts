import type { ChatMessage } from '@/lib/ai/client';
import type { SummaryDetail, SummaryLanguage } from './settings';
import type { SummaryInput, TranscriptSegment } from './types';

export interface SummaryPrefs {
  language: SummaryLanguage;
  detail: SummaryDetail;
  customPrompt: string;
}

/** Transcript characters sent in a single request; longer videos are summarized in chunks first. */
const DIRECT_LIMIT = 120_000;
const CHUNK_LIMIT = 40_000;

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Parses `mm:ss` / `h:mm:ss` into seconds. */
export function parseTimestamp(text: string): number | null {
  const parts = text.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export interface TranscriptLine {
  start: number;
  text: string;
}

/** Merges short subtitle cues into lines of up to `maxChars` characters spanning at most `maxSeconds`. */
export function compactTranscript(segments: TranscriptSegment[], maxChars = 90, maxSeconds = 30): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let current: TranscriptLine | null = null;
  let lastCue = '';
  for (const seg of segments) {
    const text = seg.text.replace(/\s+/g, ' ').trim();
    // Auto captions sometimes repeat a cue verbatim.
    if (!text || text === lastCue) continue;
    lastCue = text;
    if (current && current.text.length + text.length < maxChars && seg.start - current.start < maxSeconds) {
      current.text += ` ${text}`;
    } else {
      current = { start: seg.start, text };
      lines.push(current);
    }
  }
  return lines;
}

export function transcriptToText(lines: TranscriptLine[]): string {
  return lines.map((line) => `[${formatTimestamp(line.start)}] ${line.text}`).join('\n');
}

const LANGUAGE_NAMES: Record<SummaryLanguage, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  auto: '与字幕相同的语言',
};

function systemPrompt(prefs: SummaryPrefs): string {
  return [
    '你是「Tooools 视频助手」，擅长把视频字幕整理成结构清晰、信息密度高的总结。',
    '规则：',
    '1. 只依据提供的视频信息和字幕内容，不编造字幕之外的事实；字幕可能是自动识别的，遇到错别字或同音字请结合上下文理解。',
    '2. 引用时间点时使用方括号时间戳，例如 [03:15] 或 [1:02:30]；时间戳必须取自字幕中实际出现的时间。',
    '3. 使用 Markdown，只用标题、列表和加粗，不要使用表格和代码块，不要输出开场白或结束语。',
    `4. 输出语言：${LANGUAGE_NAMES[prefs.language]}。`,
  ].join('\n');
}

function outputFormat(detail: SummaryDetail): string {
  const points = { brief: '3～5', standard: '5～8', detailed: '8～12' }[detail];
  const subItems = detail === 'detailed' ? '；需要时可用缩进的子列表补充细节' : '';
  return [
    '## 一句话总结\n用一句话概括视频的核心内容。',
    `## 核心要点\n${points} 条，按时间顺序，每条格式为：- [时间戳] **要点标题**：一到两句话说明，保留关键数据、结论和例子${subItems}。`,
    '只输出以上两节，不要添加其他章节。',
  ].join('\n\n');
}

function videoInfo(input: SummaryInput): string {
  const { video } = input;
  const rows = [`标题：${video.title}`];
  if (video.author) rows.push(`作者：${video.author}`);
  if (video.duration) rows.push(`时长：${formatTimestamp(video.duration)}`);
  const description = video.description?.replace(/\s+/g, ' ').trim();
  if (description) rows.push(`简介：${description.length > 600 ? `${description.slice(0, 600)}…` : description}`);
  if (video.chapters?.length) {
    rows.push(`章节：\n${video.chapters.map((c) => `[${formatTimestamp(c.start)}] ${c.title}`).join('\n')}`);
  }
  return rows.join('\n');
}

function finalMessages(input: SummaryInput, prefs: SummaryPrefs, material: string): ChatMessage[] {
  const parts = ['请总结下面这个视频。', `# 视频信息\n${videoInfo(input)}`, `# 输出格式\n${outputFormat(prefs.detail)}`];
  if (prefs.customPrompt.trim()) parts.push(`# 额外要求\n${prefs.customPrompt.trim()}`);
  parts.push(material);
  return [
    { role: 'system', content: systemPrompt(prefs) },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

function splitLines(lines: TranscriptLine[], limit: number): TranscriptLine[][] {
  const groups: TranscriptLine[][] = [];
  let group: TranscriptLine[] = [];
  let size = 0;
  for (const line of lines) {
    const length = line.text.length + 12;
    if (group.length && size + length > limit) {
      groups.push(group);
      group = [];
      size = 0;
    }
    group.push(line);
    size += length;
  }
  if (group.length) groups.push(group);
  return groups;
}

export interface SummaryPlan {
  /** Note-taking prompts for each part of a long transcript; empty when it fits in one request. */
  chunks: ChatMessage[][];
  /** The final summary prompt, given the notes produced for `chunks`. */
  final(notes: string[]): ChatMessage[];
}

export function planSummary(input: SummaryInput, prefs: SummaryPrefs, directLimit = DIRECT_LIMIT, chunkLimit = CHUNK_LIMIT): SummaryPlan {
  const lines = compactTranscript(input.segments);
  const text = transcriptToText(lines);
  if (text.length <= directLimit) {
    return { chunks: [], final: () => finalMessages(input, prefs, `# 字幕（${input.trackLabel}）\n${text}`) };
  }

  const groups = splitLines(lines, chunkLimit);
  const chunks = groups.map<ChatMessage[]>((group, i) => [
    { role: 'system', content: systemPrompt(prefs) },
    {
      role: 'user',
      content: [
        `下面是视频《${input.video.title}》字幕的第 ${i + 1}/${groups.length} 部分（${formatTimestamp(group[0]!.start)} - ${formatTimestamp(group.at(-1)!.start)}）。`,
        '请提取这一部分的关键信息，输出 6～15 条要点列表，每条以字幕中的时间戳开头（例如 - [12:30] ……），保留具体的数据、观点、例子和结论。只输出列表。',
        `# 字幕\n${transcriptToText(group)}`,
      ].join('\n\n'),
    },
  ]);
  return {
    chunks,
    final: (notes) =>
      finalMessages(
        input,
        prefs,
        `# 分段笔记\n以下是按时间顺序对字幕各部分整理的笔记，时间戳已保留：\n\n${notes
          .map((note, i) => `## 第 ${i + 1} 部分\n${note.trim()}`)
          .join('\n\n')}`,
      ),
  };
}
