import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ChatConversationViewNode,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  DisclosureRow,
  IconThinkOutline14,
  MarkdownText,
  MessageText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { en, NS, zh } from '../locales.ts'
import css from '../ExecutionFoldView.module.css'

export const inject = ['slots', 'sessions', 'locale']

interface FoldInjected {
  readonly loadOlder: () => void
}

type FoldProps = ConvViewProps
  & InjectFace<FoldInjected>
  & PropsLocale<typeof NS>

export interface FoldableTurn {
  readonly turn: number
  readonly keys: readonly string[]
  readonly retainedKeys: readonly string[]
  readonly processKeys: readonly string[]
  readonly reasoningKey: string | undefined
  readonly finalKey: string | undefined
  readonly tailKey: string | undefined
  readonly complete: boolean
}

type NodeStore = { get: (key: string) => ChatConversationViewNode | undefined }
type RenderMode = 'all' | 'answer' | 'reasoning'
type AssistantBlock = {
  readonly kind?: string
  readonly text?: unknown
  readonly [key: string]: unknown
}

function turnOf(node: ChatConversationViewNode): number | undefined {
  if (node.location.kind === 'turn' || node.location.kind === 'step') return node.location.turn.turn
  return undefined
}

function isUserNode(node: ChatConversationViewNode | undefined): boolean {
  return node?.kind === 'user'
}

function hasFinalText(node: ChatConversationViewNode | undefined): boolean {
  if (node?.kind !== 'assistant-step') return false
  const data = node.data as {
    readonly status?: string
    readonly finalNode?: unknown
    readonly blocks?: readonly { readonly kind?: string; readonly text?: unknown }[]
  }
  return data.status !== 'running'
    && data.finalNode !== undefined
    && (data.blocks ?? []).some(block => block.kind === 'text'
      && typeof block.text === 'string' && block.text.trim() !== '')
}

function hasReasoning(node: ChatConversationViewNode | undefined): boolean {
  if (node?.kind !== 'assistant-step') return false
  const blocks = (node.data as { readonly blocks?: readonly { readonly kind?: string }[] }).blocks ?? []
  return blocks.some(block => block.kind === 'reasoning')
}

/**
 * Turns become foldable as soon as execution content exists. Every hidden key
 * still points to the original immutable conversation node; a running group
 * can therefore stay open while it streams and become the same completed
 * group without remounting when its final answer arrives.
 */
export function foldableTurns(order: readonly string[], nodes: NodeStore): ReadonlyMap<number, FoldableTurn> {
  const grouped = new Map<number, string[]>()
  for (const key of order) {
    const node = nodes.get(key)
    const turn = node === undefined ? undefined : turnOf(node)
    if (turn === undefined) continue
    const keys = grouped.get(turn) ?? []
    keys.push(key)
    grouped.set(turn, keys)
  }

  const result = new Map<number, FoldableTurn>()
  for (const [turn, keys] of grouped) {
    const retainedKeys = keys.filter(key => isUserNode(nodes.get(key)))
    const executionKeys = keys.filter(key => !isUserNode(nodes.get(key)))
    const tailKey = executionKeys.findLast(key => nodes.get(key)?.kind === 'turn-tail')
    const finalKey = executionKeys.findLast(key => hasFinalText(nodes.get(key)))
    const complete = tailKey !== undefined && finalKey !== undefined
    const processKeys = complete
      ? executionKeys.filter(key => key !== finalKey && key !== tailKey)
      : executionKeys.filter(key => key !== tailKey)
    const reasoningKey = complete && hasReasoning(nodes.get(finalKey)) ? finalKey : undefined
    if (processKeys.length === 0 && reasoningKey === undefined) continue
    result.set(turn, {
      turn,
      keys,
      retainedKeys,
      processKeys,
      reasoningKey,
      finalKey,
      tailKey,
      complete,
    })
  }
  return result
}

/**
 * Derive the disclosure state at a run-status boundary. Running owns the
 * disclosure; after the run ends, a settled manual choice owns it again.
 */
export function disclosureOpenAfterStatus(
  currentOpen: boolean,
  wasRunning: boolean,
  running: boolean,
): boolean {
  if (running) return true
  if (wasRunning) return false
  return currentOpen
}

/** Preserve every text block; non-text blocks remain visible through the raw fallback. */
export function contentText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map((item) => {
    if (typeof item === 'string') return item
    if (typeof item !== 'object' || item === null) return ''
    const block = item as { readonly text?: unknown; readonly type?: unknown; readonly kind?: unknown }
    if (typeof block.text === 'string') return block.text
    if (block.type === 'image' || block.kind === 'image') return '[image]'
    return ''
  }).filter(Boolean).join('\n')
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * Match the stock conversation surface: protocol tool blocks are represented
 * by their dedicated tool nodes, so repeating their call ids and wire payloads
 * inside the assistant message would expose transport noise rather than more
 * conversation content.
 */
export function assistantBlocksForDisplay(
  blocks: readonly AssistantBlock[],
  mode: RenderMode,
): readonly AssistantBlock[] {
  if (mode === 'reasoning') return blocks.filter(block => block.kind === 'reasoning')
  const conversational = blocks.filter(block => block.kind !== 'tool-call' && block.kind !== 'tool-result')
  if (mode === 'answer') return conversational.filter(block => block.kind !== 'reasoning')
  return conversational
}

function blocksOf(node: ChatConversationViewNode, mode: RenderMode) {
  if (node.kind !== 'assistant-step') return []
  const blocks = (node.data as { readonly blocks?: readonly AssistantBlock[] }).blocks ?? []
  return assistantBlocksForDisplay(blocks, mode)
}

function ProcessLabel({ children }: { readonly children: ReactNode }) {
  return <div className={css.processLabel}>{children}</div>
}

function ExecutionDisclosure({
  running,
  count,
  t,
  children,
}: {
  readonly running: boolean
  readonly count: number
  readonly t: FoldProps['t']
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(running)
  const wasRunning = useRef(running)

  useEffect(() => {
    setOpen(current => disclosureOpenAfterStatus(current, wasRunning.current, running))
    wasRunning.current = running
  }, [running])

  return (
    <div className={css.process} data-open={open || undefined} data-running={running || undefined}>
      <DisclosureRow
        rowClassName={css.summary}
        leadingClassName={css.summaryLeading}
        chevronClassName={css.summaryChevron}
        titleClassName={css.summaryTitle}
        icon={<IconThinkOutline14 size={14} />}
        title={running ? t('execution.running') : t('execution.process')}
        open={open}
        expandable
        expandOnRowClick
        keepContentWhenOpen
        onToggle={() => { setOpen(value => !value) }}
        collapsedContent={running ? (
          <span className={css.runningDot} aria-hidden />
        ) : (
          <span className={css.processCount}>{count}</span>
        )}
      />
      <div className={css.processBody} aria-hidden={!open}>
        <div className={css.processBodyInner}>
          <div className={css.items}>{children}</div>
        </div>
      </div>
    </div>
  )
}

function AssistantNode({ node, mode, t }: {
  readonly node: ChatConversationViewNode
  readonly mode: RenderMode
  readonly t: FoldProps['t']
}) {
  return (
    <div className={mode === 'answer' ? css.answer : css.assistantProcess}>
      {blocksOf(node, mode).map((block, index) => {
        if ((block.kind === 'text' || block.kind === 'reasoning') && typeof block.text === 'string') {
          return (
            <div className={block.kind === 'reasoning' ? css.reasoning : css.assistantText} key={index}>
              {block.kind === 'reasoning' && <ProcessLabel>{t('node.reasoning')}</ProcessLabel>}
              <MarkdownText text={block.text} />
            </div>
          )
        }
        return (
          <div className={css.rawBlock} key={index}>
            <ProcessLabel>{block.kind ?? t('node.details')}</ProcessLabel>
            <pre>{safeJson(block)}</pre>
          </div>
        )
      })}
    </div>
  )
}

function ToolNode({ node, t }: { readonly node: ChatConversationViewNode; readonly t: FoldProps['t'] }) {
  const root = (node.data as { readonly root?: Record<string, unknown> }).root ?? {}
  const call = typeof root.call === 'object' && root.call !== null
    ? root.call as Record<string, unknown>
    : undefined
  const name = typeof root.name === 'string'
    ? root.name
    : typeof call?.name === 'string'
      ? call.name
      : typeof root.callId === 'string' ? root.callId : t('node.tool')
  const args = typeof root.argsRaw === 'string'
    ? root.argsRaw
    : typeof call?.argsRaw === 'string' ? call.argsRaw : undefined
  const result = contentText(root.content)
  return (
    <div className={css.toolBlock}>
      <ProcessLabel>{t('node.tool')} · {name}</ProcessLabel>
      {args !== undefined && args.trim() !== '' && <pre>{args}</pre>}
      {result !== '' && <div className={css.toolResult}><MessageText text={result} /></div>}
      {result === '' && <pre>{safeJson(root)}</pre>}
    </div>
  )
}

function renderConversationNode(
  node: ChatConversationViewNode,
  mode: RenderMode,
  t: FoldProps['t'],
): ReactNode {
  if (node.kind === 'assistant-step') return <AssistantNode node={node} mode={mode} t={t} />
  if (node.kind === 'user') {
    const text = contentText((node.data as { readonly content?: unknown }).content)
    return <div className={css.user}><MessageText text={text || safeJson(node.data)} /></div>
  }
  if (node.kind === 'steering') {
    const text = contentText((node.data as { readonly content?: unknown }).content)
    return (
      <div className={css.messageBlock}>
        <ProcessLabel>{t('node.steering')}</ProcessLabel>
        <MessageText text={text || safeJson(node.data)} />
      </div>
    )
  }
  if (node.kind === 'context') {
    const text = contentText((node.data as { readonly content?: unknown }).content)
    return (
      <div className={css.contextBlock}>
        <ProcessLabel>{t('node.context')}</ProcessLabel>
        <pre data-context-injection-body>{text || safeJson(node.data)}</pre>
      </div>
    )
  }
  if (node.kind === 'tool-call' || node.kind === 'tool') return <ToolNode node={node} t={t} />
  if (node.kind === 'turn-tail') return null
  return (
    <div className={css.rawBlock}>
      <ProcessLabel>{node.kind}</ProcessLabel>
      <pre>{safeJson(node.data)}</pre>
    </div>
  )
}

function FoldedChatView({
  useSession,
  sessionId,
  loadOlder,
  t,
}: FoldProps) {
  const order = useSession(snapshot => snapshot.chat.order)
  const nodes = useSession(snapshot => snapshot.chat.nodes)
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const loadingOlder = useSession(snapshot => snapshot.loadingOlder)
  const running = useSession(snapshot => snapshot.running)
  const folded = useMemo(() => foldableTurns(order, nodes), [order, nodes])
  const latestTurn = useMemo(() => {
    let latest: number | undefined
    for (const key of order) {
      const source = nodes.get(key)
      const candidate = source === undefined ? undefined : turnOf(source)
      if (candidate !== undefined) latest = candidate
    }
    return latest
  }, [order, nodes])

  const renderNode = (key: string, mode: RenderMode = 'all'): ReactNode => {
    const source = nodes.get(key)
    if (source === undefined) return null
    return (
      <div
        className={css.flowItem}
        data-chat-anchor-key={source.key}
        data-chat-flow-key={source.key}
        data-chat-flow-kind={source.kind}
      >
        {renderConversationNode(source, mode, t)}
      </div>
    )
  }

  const renderedTurns = new Set<number>()
  const rows: ReactNode[] = []
  for (const nodeKey of order) {
    const node = nodes.get(nodeKey)
    const turn = node === undefined ? undefined : turnOf(node)
    const group = turn === undefined ? undefined : folded.get(turn)
    if (group === undefined) {
      rows.push(<div key={nodeKey}>{renderNode(nodeKey)}</div>)
      continue
    }
    if (renderedTurns.has(group.turn)) continue
    renderedTurns.add(group.turn)
    const processCount = group.processKeys.length + (group.reasoningKey === undefined ? 0 : 1)
    rows.push(
      <section className={css.turn} key={`turn-${group.turn}`} data-execution-fold-turn={group.turn}>
        {group.retainedKeys.map(key => <div key={key}>{renderNode(key)}</div>)}
        <ExecutionDisclosure
          running={running && latestTurn === group.turn}
          count={processCount}
          t={t}
        >
            {group.processKeys.map(key => <div key={key}>{renderNode(key)}</div>)}
            {group.reasoningKey !== undefined && (
              <div key={`${group.reasoningKey}-reasoning`}>{renderNode(group.reasoningKey, 'reasoning')}</div>
            )}
        </ExecutionDisclosure>
        {group.finalKey !== undefined && renderNode(group.finalKey, 'answer')}
        {group.tailKey !== undefined && renderNode(group.tailKey)}
      </section>,
    )
  }

  return (
    <div className={css.root} data-execution-fold-view={sessionId}>
      <div className={css.column}>
        {hasMore && (
          <div className={css.older}>
            <button className={css.loadEarlier} type="button" disabled={loadingOlder} onClick={loadOlder}>
              {loadingOlder ? t('history.loading') : t('history.loadEarlier')}
            </button>
          </div>
        )}
        {rows}
      </div>
    </div>
  )
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-execution-fold: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'folded-chat',
    order: -10,
    locale: NS,
    label: () => t('view.executionFold'),
    inject: (sessionId: SessionId): FoldInjected => ({
      loadOlder: () => { void ctx.sessions.binding(sessionId)?.session.loadOlder() },
    }),
  }, FoldedChatView))
}
