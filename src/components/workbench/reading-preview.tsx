'use client'

import type { ReactNode } from 'react'
import { CircleAlert, Code2, Eye, FileText, Link2, PencilLine, Variable } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { extractLinks } from '@/lib/markdown'
import type { Segment, SegmentStatus, TranslationIssue } from '@/lib/types'
import { cn } from '@/lib/utils'

const issueLabel: Record<TranslationIssue['type'], string> = {
  'missing-translation': '漏译', 'missing-variable': '变量缺失', 'link-mismatch': '链接不一致', glossary: '术语不一致', 'code-format': '代码格式',
}
const statusLabel: Record<SegmentStatus, string> = { draft: '草稿', 'needs-work': '待处理', confirmed: '已确认', returned: '已退回' }
const statusClass: Record<SegmentStatus, string> = {
  draft: 'bg-slate-100 text-slate-600', 'needs-work': 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800', returned: 'bg-red-100 text-red-800',
}
const headingClass = ['', 'text-2xl font-bold tracking-tight', 'text-xl font-bold tracking-tight', 'text-lg font-semibold', 'text-base font-semibold', 'text-sm font-semibold', 'text-xs font-semibold uppercase tracking-wide']
const headingTag = ['h1', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

interface InlineToken {
  kind: 'text' | 'link' | 'code' | 'bold' | 'italic' | 'variable'
  text: string
  url?: string
}

const INLINE_PATTERN = /(\[[^\]\n]+\]\([^)\n]+\))|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\{\{[^{}\n]+\}\}|\{[A-Za-z_][\w.-]*\}|%\([^)\n]+\)[sd]|%[sd])/g

const tokenizeInline = (text: string): InlineToken[] => {
  const tokens: InlineToken[] = []
  let cursor = 0
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, index) })
    const [full, link, code, bold, italic, variable] = match
    if (link) {
      const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(link)
      tokens.push({ kind: 'link', text: parts?.[1] ?? link, url: parts?.[2] ?? '' })
    } else if (code) tokens.push({ kind: 'code', text: code.slice(1, -1) })
    else if (bold) tokens.push({ kind: 'bold', text: bold.slice(2, -2) })
    else if (italic) tokens.push({ kind: 'italic', text: italic.slice(1, -1) })
    else if (variable) tokens.push({ kind: 'variable', text: variable })
    cursor = index + full.length
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) })
  return tokens
}

interface InlineProps {
  text: string
  sourceLinks: string[]
  linkIssue: boolean
}

function InlineTokens({ text, sourceLinks, linkIssue }: InlineProps) {
  return (
    <>
      {tokenizeInline(text).map((token, index) => {
        if (token.kind === 'link') {
          const suspicious = linkIssue && !!token.url && !sourceLinks.includes(token.url)
          return (
            <a
              key={index}
              href={token.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              title={suspicious ? '链接目标与原文不一致' : token.url}
              className={cn('font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800', suspicious && 'text-amber-700 decoration-amber-500 decoration-wavy')}
            >{token.text}</a>
          )
        }
        if (token.kind === 'code') return <code key={index} className="markdown-code rounded bg-slate-100 px-1 py-0.5 text-[0.85em] text-slate-800">{token.text}</code>
        if (token.kind === 'bold') return <strong key={index} className="font-semibold text-slate-900">{token.text}</strong>
        if (token.kind === 'italic') return <em key={index}>{token.text}</em>
        if (token.kind === 'variable') return <code key={index} className="markdown-code rounded bg-blue-50 px-1 py-0.5 text-[0.85em] font-medium text-blue-700">{token.text}</code>
        return <span key={index}>{token.text}</span>
      })}
    </>
  )
}

function PreviewBody({ segment, text, sourceLinks, linkIssue }: InlineProps & { segment: Segment }) {
  const trimmed = text.trim()
  const fenced = /^```([^\n`]*)\n?([\s\S]*?)```\s*$/.exec(trimmed)
  if (segment.kind === 'code' || fenced) {
    const language = fenced?.[1]?.trim()
    const code = fenced ? fenced[2].replace(/\n$/, '') : trimmed
    return (
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400"><span>{language || 'code'}</span><Code2 className="h-3 w-3" /></div>
        <pre className="markdown-code overflow-x-auto p-3.5 text-xs leading-5 text-slate-100">{code}</pre>
      </div>
    )
  }
  const heading = /^(#{1,6})\s+([\s\S]+)$/.exec(trimmed)
  if (heading) {
    const level = heading[1].length
    const Tag = headingTag[level]
    return <Tag className={cn(headingClass[level], 'text-slate-900')}><InlineTokens text={heading[2]} sourceLinks={sourceLinks} linkIssue={linkIssue} /></Tag>
  }
  const lines: ReactNode[] = []
  text.split('\n').forEach((line, index) => {
    if (!line.trim()) return
    const list = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (list) {
      const ordered = /^\d/.test(list[2])
      lines.push(
        <div key={index} className="flex gap-2" style={{ paddingLeft: `${Math.min(list[1].length, 8) * 4}px` }}>
          <span className="shrink-0 text-slate-400">{ordered ? list[2] : '•'}</span>
          <span className="min-w-0"><InlineTokens text={list[3]} sourceLinks={sourceLinks} linkIssue={linkIssue} /></span>
        </div>,
      )
      return
    }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      lines.push(<div key={index} className="border-l-2 border-slate-300 pl-3 text-slate-500"><InlineTokens text={quote[1]} sourceLinks={sourceLinks} linkIssue={linkIssue} /></div>)
      return
    }
    lines.push(<p key={index}><InlineTokens text={line} sourceLinks={sourceLinks} linkIssue={linkIssue} /></p>)
  })
  return <div className="space-y-1.5 text-sm leading-6 text-slate-700">{lines}</div>
}

interface ReadingPreviewProps {
  segments: Segment[]
  issueMap: Record<string, TranslationIssue[]>
  selectedSegmentId?: string
  onSelect: (segmentId: string) => void
  onRevealIssue: (segmentId: string) => void
}

export function ReadingPreview({ segments, issueMap, selectedSegmentId, onSelect, onRevealIssue }: ReadingPreviewProps) {
  if (!segments.length) {
    return (
      <div className="grid min-h-52 place-items-center rounded-xl border bg-white text-center shadow-sm">
        <div>
          <Eye className="mx-auto h-7 w-7 text-blue-500" />
          <p className="mt-3 text-sm font-medium">当前预览范围没有片段</p>
          <p className="mt-1 text-xs text-slate-500">切换预览范围，或先运行本地术语检查。</p>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="px-1 text-[10px] leading-4 text-slate-400">阅读预览展示发布后的渲染效果，随草稿与检查结果实时更新；译文为空的片段回退原文并标记未翻译，变量缺失与链接不一致会直接标注在对应片段下方，点击提示可回到原片段。</p>
      {segments.map((segment) => {
        const segmentIssues = issueMap[segment.id] ?? []
        const fallback = !segment.targetText.trim()
        const text = fallback ? segment.sourceText : segment.targetText
        const sourceLinks = extractLinks(segment.sourceText)
        const linkIssue = segmentIssues.some((issue) => issue.type === 'link-mismatch')
        const isSelected = selectedSegmentId === segment.id
        return (
          <article
            id={`preview-${segment.id}`}
            key={segment.id}
            onClick={() => onSelect(segment.id)}
            className={cn('scroll-mt-32 cursor-pointer overflow-hidden rounded-xl border bg-white shadow-sm transition hover:border-blue-200', isSelected && 'ring-2 ring-blue-500/30', fallback && 'border-dashed border-amber-200')}
          >
            <header className="flex flex-wrap items-center gap-2 border-b bg-slate-50/80 px-4 py-2">
              <span className="text-[10px] font-semibold text-slate-400">#{String(segment.index).padStart(2, '0')}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', statusClass[segment.status])}>{statusLabel[segment.status]}</span>
              {fallback && <Badge variant="warning" className="gap-1 text-[10px]"><FileText className="h-3 w-3" />未翻译 · 已回退原文</Badge>}
              {!!segmentIssues.length && <Badge variant="destructive" className="text-[10px]">{segmentIssues.length} 个提示</Badge>}
              <button
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-blue-600 transition hover:bg-blue-50"
                onClick={(event) => { event.stopPropagation(); onRevealIssue(segment.id) }}
              ><PencilLine className="h-3 w-3" />回到片段</button>
            </header>
            <div className="px-5 py-4">
              <PreviewBody segment={segment} text={text} sourceLinks={sourceLinks} linkIssue={linkIssue} />
            </div>
            {!!segmentIssues.length && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-amber-100 bg-amber-50/70 px-4 py-2.5">
                <span className="text-[10px] font-semibold text-amber-700">位置提示</span>
                {segmentIssues.map((issue) => (
                  <button
                    key={issue.id}
                    title={`${issue.message}（点击回到原片段）`}
                    onClick={(event) => { event.stopPropagation(); onRevealIssue(segment.id) }}
                    className={cn('inline-flex max-w-full items-center gap-1 rounded-full border bg-white px-2 py-1 text-[10px] font-medium transition hover:shadow-sm', issue.severity === 'error' ? 'border-red-200 text-red-700 hover:border-red-300' : 'border-amber-200 text-amber-700 hover:border-amber-300')}
                  >
                    {issue.type === 'missing-variable' ? <Variable className="h-3 w-3 shrink-0" /> : issue.type === 'link-mismatch' ? <Link2 className="h-3 w-3 shrink-0" /> : <CircleAlert className="h-3 w-3 shrink-0" />}
                    <span>{issueLabel[issue.type]}</span>
                    {issue.expected && <code className="markdown-code max-w-56 truncate rounded bg-slate-100 px-1 text-[9px] text-slate-600">{issue.expected}</code>}
                  </button>
                ))}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
