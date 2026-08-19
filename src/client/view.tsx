import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ChatConversationViewNode,
  ConversationSnapshot,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {
  ChatNode,
  ChatNodeKind,
  ChatNodeOwnerProps,
  ConversationController,
  ConvViewProps,
  UseChatNodeTurnData,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  SnapshotSelectorHook,
} from '@deepseek-ai/dsh-client-ui-slots'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { en, NS, zh } from '../locales.ts'
import css from '../ExecutionFoldView.module.css'

export const inject = ['slots', 'sessions', 'workspaces', 'conversation', 'locale']

interface FoldInjected {
  readonly loadOlder: () => void
  readonly loadImage: ChatNodeOwnerProps['loadImage']
  readonly openFile: ChatNodeOwnerProps['openFile']
  readonly inspectCall: ChatNodeOwnerProps['inspectCall']
  readonly forkAt: ChatNodeOwnerProps['forkAt']
  readonly fileMentions: ChatNodeOwnerProps['fileMentions']
}

type FoldProps = ConvViewProps
  & PropsRenderSlots<'conversation.chat.node'>
  & InjectFace<FoldInjected>
  & PropsLocale<typeof NS>

export interface FoldableTurn {
  readonly turn: number
  readonly keys: readonly string[]
  readonly retainedKeys: readonly string[]
  readonly processKeys: readonly string[]
  readonly reasoningKey: string | undefined
  readonly finalKey: string
  readonly tailKey: string
}

type NodeStore = { get: (key: string) => ChatConversationViewNode | undefined }
type RenderMode = 'all' | 'answer' | 'reasoning'
type DisclosureRoot = {
  querySelector: (selector: string) => { click: () => void } | null
}

function resolveWorkspacePath(cwd: string | undefined, path: string): string {
  if (path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')) return path
  if (cwd === undefined || cwd === '') return path
  return `${cwd.replace(/[/\\]+$/, '')}/${path.replace(/^[/\\]+/, '')}`
}

const CHAT_NODE_INJECT = {
  hooks: {
    turnData: (
      { useSession }: { useSession: SnapshotSelectorHook<ConversationSnapshot> },
      nodeKey: string,
    ): UseChatNodeTurnData => function useTurnData(key) {
      return useSession((snapshot) => {
        const location = snapshot.chat.nodes.get(nodeKey)?.location
        return location?.kind === 'turn' || location?.kind === 'step'
          ? location.turn.data.get(key)
          : undefined
      })
    },
  },
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
 * Closed turns collapse presentation only. Every hidden key still points to
 * the original immutable conversation node, so opening the disclosure can
 * dispatch the stock renderer with the full payload.
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
    if (tailKey === undefined || finalKey === undefined) continue

    const processKeys = executionKeys.filter(key => key !== finalKey && key !== tailKey)
    const reasoningKey = hasReasoning(nodes.get(finalKey)) ? finalKey : undefined
    if (processKeys.length === 0 && reasoningKey === undefined) continue
    result.set(turn, {
      turn,
      keys,
      retainedKeys,
      processKeys,
      reasoningKey,
      finalKey,
      tailKey,
    })
  }
  return result
}

function projectedNode(node: ChatConversationViewNode, mode: RenderMode): ChatConversationViewNode {
  if (mode === 'all' || node.kind !== 'assistant-step') return node
  const data = node.data as {
    readonly blocks?: readonly { readonly kind?: string }[]
    readonly [key: string]: unknown
  }
  const blocks = (data.blocks ?? []).filter(block => mode === 'reasoning'
    ? block.kind === 'reasoning'
    : block.kind !== 'reasoning')
  return { ...node, data: { ...data, blocks } }
}

/** Open rc.7's nested context disclosure so the outer execution fold is the only disclosure. */
export function expandNestedContext(root: DisclosureRoot): boolean {
  const disclosure = root.querySelector('[data-disclosure-row][aria-expanded="false"]')
  if (disclosure === null) return false
  disclosure.click()
  return true
}

function ExpandedContext({ children }: { readonly children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef(false)
  useLayoutEffect(() => {
    if (expandedRef.current || rootRef.current === null) return
    expandedRef.current = expandNestedContext(rootRef.current)
  }, [])
  return <div ref={rootRef} className={css.expandedContext}>{children}</div>
}

function FoldedChatView({
  useSession,
  useSessions,
  sessionId,
  renderSlot,
  loadOlder,
  loadImage,
  openFile,
  inspectCall,
  forkAt,
  fileMentions,
  t,
}: FoldProps) {
  const order = useSession(snapshot => snapshot.chat.order)
  const nodes = useSession(snapshot => snapshot.chat.nodes)
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const loadingOlder = useSession(snapshot => snapshot.loadingOlder)
  const running = useSession(snapshot => snapshot.running)
  const cwd = useSessions(snapshot => snapshot.byId[sessionId]?.cwd)
  const folded = useMemo(() => foldableTurns(order, nodes), [order, nodes])
  const renderChatNode = renderSlot as unknown as (
    key: 'conversation.chat.node',
    owner: ChatNodeOwnerProps & { readonly node: ChatNode },
    options: {
      readonly entryKey: ChatNodeKind
      readonly hookContext: string
      readonly fallback: ReactNode
    },
  ) => ReactNode

  const renderNode = (key: string, mode: RenderMode = 'all'): ReactNode => {
    const source = nodes.get(key)
    if (source === undefined) return null
    const node = projectedNode(source, mode) as ChatNode
    const owner: ChatNodeOwnerProps & { readonly node: ChatNode } = {
      node,
      selectedCallId: undefined,
      cwd,
      openFile,
      inspectCall,
      forkAt,
      loadImage,
      fileMentions,
    }
    const rendered = renderChatNode('conversation.chat.node', owner, {
      entryKey: node.kind as ChatNodeKind,
      hookContext: source.key,
      fallback: <JsonBlock label={source.kind} payload={source.data} defaultOpen={source.kind === 'context'} />,
    })
    return (
      <div
        className={css.flowItem}
        data-chat-anchor-key={source.key}
        data-chat-flow-key={source.key}
        data-chat-flow-kind={source.kind}
      >
        {source.kind === 'context' ? <ExpandedContext>{rendered}</ExpandedContext> : rendered}
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
        <details className={css.process} open={running && turn === group.turn}>
          <summary className={css.summary}>
            <span className={css.chevron} aria-hidden />
            <span>{running ? t('execution.running') : t('execution.processCount', { count: processCount })}</span>
          </summary>
          <div className={css.items}>
            {group.processKeys.map(key => <div key={key}>{renderNode(key)}</div>)}
            {group.reasoningKey !== undefined && (
              <div key={`${group.reasoningKey}-reasoning`}>{renderNode(group.reasoningKey, 'reasoning')}</div>
            )}
          </div>
        </details>
        {renderNode(group.finalKey, 'answer')}
        {renderNode(group.tailKey)}
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
    children: {
      'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: CHAT_NODE_INJECT },
    },
    inject: (sessionId: SessionId): FoldInjected => ({
      loadOlder: () => { void ctx.sessions.binding(sessionId)?.session.loadOlder() },
      loadImage: attachment => (ctx.conversation as ConversationController).resolveImage(sessionId, attachment),
      openFile: (path) => {
        const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
        void ctx.workspaces.openPath(resolveWorkspacePath(cwd, path)).catch(() => {})
      },
      inspectCall: () => {},
      forkAt: (seq) => {
        void ctx.sessions.fork({ sessionId, atSeq: seq, increaseTitle: true })
          .then(childId => { ctx.sessions.open(childId) })
          .catch(() => {})
      },
      fileMentions: owner => ctx.get('chatFileMentions')?.forClosing(owner),
    }),
  }, FoldedChatView))
}
