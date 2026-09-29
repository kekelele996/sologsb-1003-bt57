'use client'

import {
  AlertTriangle, ArrowLeft, Code2, FileText, Link2, Link2Off, PencilLine, Variable,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  extractInlineOccurrences, headingLevel, splitFencedCode, tokenizeInline,
  type InlineOccurrence, type InlineToken,
} from '@/lib/markdown'
import type { Segment, SegmentStatus, TranslationIssue } from '@/lib/types'
import { cn } from '@/lib/utils'

const kindIcon = {
  heading: <FileText className="h-3.5 w-3.5" />,
  paragraph: <FileText className="h-3.5 w-3.5" />,
  code: <Code2 className="h-3.5 w-3.5" />,
  link: <Link2 className="h-3.5 w-3.5" />,
  variable: <Variable className="h-3.5 w-3.5" />,
}
const kindLabel = { heading: '标题', paragraph: '段落', code: '代码块', link: '链接', variable: '占位符' } as const
const statusClass: Record<SegmentStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  'needs-work': 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  returned: 'bg-red-100 text-red-800',
}
const statusLabel: Record<SegmentStatus, string> = {
  draft: '草稿', 'needs-work': '待处理', confirmed: '已确认', returned: '已退回',
}
const issueLabel: Record<TranslationIssue['type'], string> = {
  'missing-translation': '漏译', 'missing-variable': '变量缺失', 'link-mismatch': '链接不一致',
  glossary: '术语不一致', 'code-format': '代码格式',
}

/* ---------------- 位置对齐：把源文与译文的受保护标记按出现顺序配对 ---------------- */

type AlignNode =
  | { kind: 'token'; token: InlineToken }
  | { kind: 'missing'; occurrence: InlineOccurrence }

const buildAlignedNodes = (text: string, sourceOccurrences: InlineOccurrence[] | null): AlignNode[] => {
  const tokens = tokenizeInline(text)
  if (!sourceOccurrences) return tokens.map((token) => ({ kind: 'token' as const, token }))

  const pending: Array<InlineOccurrence & { used: boolean }> =
    sourceOccurrences.map((occurrence) => ({ ...occurrence, used: false }))
  const nodes: AlignNode[] = []
  for (const token of tokens) {
    if (token.type === 'text' || token.type === 'code') {
      nodes.push({ kind: 'token', token })
      continue
    }
    const matched = pending.find((item) => {
      if (item.used || item.type !== token.type) return false
      return token.type === 'link' ? item.value === token.url : item.value === token.raw
    })
    if (matched) {
      matched.used = true
      nodes.push({ kind: 'token', token })
      continue
    }
    // 同类型标记已有成功配对后又出现新的（数量变多/顺序错位）：在当前位置补上最近漏掉的源文标记
    const paired = pending.some((item) => item.type === token.type && item.used)
    if (paired) {
      const next = pending.find((item) => !item.used && item.type === token.type)
      if (next) nodes.push({ kind: 'missing', occurrence: { type: next.type, value: next.value, label: next.label } })
    }
    nodes.push({ kind: 'token', token })
  }
  pending.filter((item) => !item.used)
    .forEach((item) => nodes.push({ kind: 'missing', occurrence: { type: item.type, value: item.value, label: item.label } }))
  return nodes
}

/* ---------------- 行内强调（粗体 / 斜体 / 删除线） ---------------- */

const renderEmphasis = (raw: string, keyPrefix: string) => {
  const parts = raw.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~)/g)
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (/^(?:\*\*|__).+(?:\*\*|__)$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (/^~~.+~~$/.test(part)) return <del key={key}>{part.slice(2, -2)}</del>
    if (/^(?:\*|_).+(?:\*|_)$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>
    return <span key={key}>{part}</span>
  })
}

interface InlineProps {
  nodes: AlignNode[]
  /** 源码内部：不渲染行内代码底色、保留空白 */
  insidePre?: boolean
  fallback?: boolean
  onLocate: () => void
}

function InlineContent({ nodes, insidePre = false, fallback = false, onLocate }: InlineProps) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.kind === 'missing') {
          const isLink = node.occurrence.type === 'link'
          return (
            <button
              key={`missing-${index}`}
              type="button"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onLocate() }}
              title="源文中存在但译文中缺失，点击回到该片段"
              className={cn(
                'mx-0.5 inline-flex max-w-full cursor-pointer items-center gap-0.5 rounded border border-dashed px-1 py-px align-baseline text-[0.85em] font-medium no-underline',
                insidePre
                  ? 'border-red-400/70 bg-red-500/20 text-red-200 hover:bg-red-500/30'
                  : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
              )}
            >
              {isLink ? <Link2Off className="h-3 w-3 shrink-0" /> : <Variable className="h-3 w-3 shrink-0" />}
              <span className="break-all">{node.occurrence.value}</span>
            </button>
          )
        }
        const { token } = node
        if (token.type === 'text') return <span key={`text-${token.index}`}>{renderEmphasis(token.raw, `em-${token.index}`)}</span>
        if (token.type === 'code') {
          if (insidePre) return <span key={`code-${token.index}`}>{token.raw}</span>
          return <code key={`code-${token.index}`} className={cn('markdown-code rounded px-1 py-px text-[0.88em]', fallback ? 'bg-slate-200/70 text-slate-600' : 'bg-slate-100 text-pink-700')}>{token.raw.slice(1, -1)}</code>
        }
        if (token.type === 'variable') {
          return <code key={`var-${token.index}`} className={cn('markdown-code rounded px-1 py-px text-[0.88em]', insidePre ? 'bg-blue-500/20 text-blue-200' : fallback ? 'bg-slate-200/70 text-slate-600' : 'bg-blue-50 text-blue-700')}>{token.raw}</code>
        }
        return (
          <a
            key={`link-${token.index}`}
            href={token.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className={cn('break-all text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900', fallback && 'text-slate-500 hover:text-slate-700')}
          >
            {token.label}
          </a>
        )
      })}
    </>
  )
}

/* ---------------- 代码块渲染（变量高亮 + 缺失标记） ---------------- */

function CodePreview({ text, sourceOccurrences, fallback, onLocate }: {
  text: string
  sourceOccurrences: InlineOccurrence[] | null
  fallback: boolean
  onLocate: () => void
}) {
  const fenced = splitFencedCode(text)
  const nodes = buildAlignedNodes(fenced ? fenced.body : text, sourceOccurrences)
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      {fenced && <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-[10px] font-medium text-slate-400"><Code2 className="h-3 w-3" />{fenced.language}</div>}
      <pre className="markdown-code overflow-x-auto p-3 text-xs leading-5 text-slate-100">
        <code><InlineContent nodes={nodes} insidePre fallback={fallback} onLocate={onLocate} /></code>
      </pre>
    </div>
  )
}

/* ---------------- 块级渲染：标题 / 列表 / 引用 / 段落 ---------------- */

/** 把对齐后的节点按行分配（missing 节点跟随最近一个有位置的 token） */
const groupNodesByLine = (lines: string[], nodes: AlignNode[]): AlignNode[][] => {
  const starts: number[] = []
  let acc = 0
  for (const line of lines) { starts.push(acc); acc += line.length + 1 }
  const lineOfPosition = (position: number) => {
    let lo = 0
    let hi = lines.length - 1
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (starts[mid] <= position) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const groups: AlignNode[][] = Array.from({ length: lines.length }, () => [])
  let lastLine = 0
  for (const node of nodes) {
    const line = node.kind === 'token' ? lineOfPosition(node.token.index) : lastLine
    groups[line].push(node)
    lastLine = line
  }
  return groups
}

function BlockPreview({ text, sourceOccurrences, fallback, onLocate }: {
  text: string
  sourceOccurrences: InlineOccurrence[] | null
  fallback: boolean
  onLocate: () => void
}) {
  const lines = text.split('\n')
  const groups = groupNodesByLine(lines, buildAlignedNodes(text, sourceOccurrences))

  return (
    <div className="space-y-2">
      {lines.map((line, lineIndex) => {
        const nodes = groups[lineIndex]
        if (!line.trim()) return <div key={lineIndex} className="h-2" />
        const level = headingLevel(line)
        if (level > 0) {
          const HeadingTag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
          const headingClass = {
            1: 'text-2xl font-bold tracking-tight text-slate-900',
            2: 'mt-1 text-xl font-bold tracking-tight text-slate-900',
            3: 'text-lg font-semibold text-slate-900',
            4: 'text-base font-semibold text-slate-800',
            5: 'text-sm font-semibold text-slate-800',
            6: 'text-sm font-medium text-slate-700',
          }[level]
          return <HeadingTag key={lineIndex} className={cn(headingClass, fallback && 'text-slate-500')}><InlineContent nodes={nodes} fallback={fallback} onLocate={onLocate} /></HeadingTag>
        }
        const unordered = line.match(/^(\s*)[-*+]\s+(.*)$/)
        if (unordered) {
          return (
            <div key={lineIndex} className="flex gap-2" style={{ paddingLeft: unordered[1].length * 12 }}>
              <span className="select-none text-slate-400">•</span>
              <p className="min-w-0 flex-1 text-sm leading-6"><InlineContent nodes={nodes} fallback={fallback} onLocate={onLocate} /></p>
            </div>
          )
        }
        const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/)
        if (ordered) {
          return (
            <div key={lineIndex} className="flex gap-2" style={{ paddingLeft: ordered[1].length * 12 }}>
              <span className="select-none font-medium text-slate-500">{ordered[2]}.</span>
              <p className="min-w-0 flex-1 text-sm leading-6"><InlineContent nodes={nodes} fallback={fallback} onLocate={onLocate} /></p>
            </div>
          )
        }
        const quote = line.match(/^>\s?(.*)$/)
        if (quote) {
          return <blockquote key={lineIndex} className={cn('border-l-4 border-slate-300 pl-3 text-sm leading-6 italic text-slate-600', fallback && 'border-slate-200 text-slate-400')}><InlineContent nodes={nodes} fallback={fallback} onLocate={onLocate} /></blockquote>
        }
        return <p key={lineIndex} className={cn('text-sm leading-7', fallback ? 'text-slate-500' : 'text-slate-700')}><InlineContent nodes={nodes} fallback={fallback} onLocate={onLocate} /></p>
      })}
    </div>
  )
}

/* ---------------- 单个片段的阅读卡片 ---------------- */

interface MarkdownPreviewSegmentProps {
  segment: Segment
  issues: TranslationIssue[]
  selected: boolean
  onLocate: () => void
}

export function MarkdownPreviewSegment({ segment, issues, selected, onLocate }: MarkdownPreviewSegmentProps) {
  const fallback = !segment.targetText.trim()
  const previewText = fallback ? segment.sourceText : segment.targetText
  // 回退原文时只做纯渲染，不再把源文标记标记为“缺失”
  const sourceOccurrences = fallback ? null : extractInlineOccurrences(segment.sourceText)

  const inlineTypes = new Set(['missing-variable', 'link-mismatch'])
  const blockIssues = issues.filter((issue) => fallback || !inlineTypes.has(issue.type))

  return (
    <article
      id={`preview-${segment.id}`}
      onClick={onLocate}
      className={cn(
        'scroll-mt-32 cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow',
        selected && 'ring-2 ring-blue-500/30',
        issues.some((issue) => issue.severity === 'error') && 'border-red-200',
        segment.status === 'returned' && 'border-red-200',
      )}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-500">#{String(segment.index).padStart(2, '0')}</span>
        <Badge variant="outline" className="gap-1 text-[10px]">{kindIcon[segment.kind]}{kindLabel[segment.kind]}</Badge>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', statusClass[segment.status])}>{statusLabel[segment.status]}</span>
        {fallback && <Badge variant="warning" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" />未翻译 · 显示原文</Badge>}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-blue-600"><PencilLine className="h-3 w-3" />点击回到编辑片段<ArrowLeft className="h-3 w-3" /></span>
      </header>

      {fallback && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
          译文为空，以下为源文回退预览，发布前请完成翻译。
        </div>
      )}

      <div className={cn(fallback && '-m-1 rounded-lg bg-slate-50/70 p-3')}>
        {segment.kind === 'code'
          ? <CodePreview text={previewText} sourceOccurrences={sourceOccurrences} fallback={fallback} onLocate={onLocate} />
          : <BlockPreview text={previewText} sourceOccurrences={sourceOccurrences} fallback={fallback} onLocate={onLocate} />}
      </div>

      {!!blockIssues.length && (
        <div className="mt-3 space-y-1.5 rounded-md bg-red-50/60 px-3 py-2">
          {blockIssues.map((issue) => (
            <div key={issue.id} className="flex items-start gap-2 text-[11px]">
              <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', issue.severity === 'error' ? 'text-red-600' : 'text-amber-600')} />
              <span className={issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}>
                <b className="mr-1">[{issueLabel[issue.type]}]</b>{issue.message}
              </span>
            </div>
          ))}
        </div>
      )}
      {!fallback && issues.some((issue) => inlineTypes.has(issue.type)) && (
        <p className="mt-2 text-[10px] text-slate-400">变量缺失 / 链接不一致的位置已在正文处以红色虚线标记，点击标记可直接回到该片段。</p>
      )}
    </article>
  )
}
