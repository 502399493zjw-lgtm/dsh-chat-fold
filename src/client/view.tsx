import {
  Component,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ChatConversationViewNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {
  ChatViewSlotProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  InjectFace,
  StoredEntry,
  Translate,
  TranslateNS,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconChevronRightOutline14,
  JsonBlock,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { en, NS, zh } from '../locales.ts'
import css from '../ExecutionFoldView.module.css'

export const inject = ['slots', 'sessions', 'locale']

interface FoldInjected {
  readonly foldT: TranslateNS<typeof NS>
  readonly nativeChat: ComponentType<ChatViewSlotProps>
}

type FoldProps = ChatViewSlotProps & InjectFace<FoldInjected>
interface MirrorRenderOptions {
  readonly entryKey?: string
  readonly hookContext?: unknown
  readonly fallback?: ReactNode
  readonly only?: string
  readonly overlay?: boolean
}
type MirroredRenderSlot = (key: string, owner: object, options?: MirrorRenderOptions) => ReactNode

export interface FoldableTurn {
  readonly turn: number
  readonly keys: readonly string[]
  readonly retainedKeys: readonly string[]
  readonly processKeys: readonly string[]
  /** A completed final assistant node whose reasoning is projected into the process group. */
  readonly reasoningKey: string | undefined
  readonly finalKey: string | undefined
  readonly tailKey: string | undefined
  readonly anchorKey: string
  readonly complete: boolean
}

type NodeStore = { get: (key: string) => ChatConversationViewNode | undefined }
type AssistantProjection = 'reasoning' | 'answer'

function turnOf(node: ChatConversationViewNode): number | undefined {
  if (node.location.kind === 'turn' || node.location.kind === 'step') return node.location.turn.turn
  return undefined
}

function isUserNode(node: ChatConversationViewNode | undefined): boolean {
  return node?.kind === 'user'
}

function assistantBlocks(node: ChatConversationViewNode): readonly { readonly kind?: string; readonly text?: unknown }[] {
  if (node.kind !== 'assistant-step') return []
  return (node.data as {
    readonly blocks?: readonly { readonly kind?: string; readonly text?: unknown }[]
  }).blocks ?? []
}

function hasFinalText(node: ChatConversationViewNode | undefined): boolean {
  if (node?.kind !== 'assistant-step') return false
  const data = node.data as {
    readonly status?: string
    readonly finalNode?: unknown
  }
  return data.status !== 'running'
    && data.finalNode !== undefined
    && assistantBlocks(node).some(block => block.kind === 'text'
      && typeof block.text === 'string' && block.text.trim() !== '')
}

function hasReasoning(node: ChatConversationViewNode | undefined): boolean {
  return node !== undefined && assistantBlocks(node).some(block => block.kind === 'reasoning')
}

/**
 * Split only the final assistant node at the native renderer boundary. Both
 * halves still pass through DSH's stock Assistant renderer: Think stays in
 * the execution disclosure, while the answer keeps its native message chrome.
 */
export function projectAssistantNode(
  node: ChatConversationViewNode,
  projection: AssistantProjection,
): ChatConversationViewNode {
  if (node.kind !== 'assistant-step') return node
  const data = node.data as Record<string, unknown> & {
    readonly blocks?: readonly { readonly kind?: string }[]
  }
  const blocks = (data.blocks ?? []).filter(block => (
    projection === 'reasoning' ? block.kind === 'reasoning' : block.kind !== 'reasoning'
  ))
  return {
    ...node,
    data: {
      ...data,
      blocks,
      // The process-only half must not acquire final-answer actions or file mentions.
      ...(projection === 'reasoning' ? { finalNode: undefined } : {}),
    },
  } as ChatConversationViewNode
}

/**
 * Group the immutable rc.8 chat projection without replacing any business
 * renderer. User and final-answer rows remain in the stock flow; everything
 * between them is available to the outer process disclosure.
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
    const anchorKey = processKeys[0] ?? reasoningKey
    if (anchorKey === undefined) continue
    result.set(turn, {
      turn,
      keys,
      retainedKeys,
      processKeys,
      reasoningKey,
      finalKey,
      tailKey,
      anchorKey,
      complete,
    })
  }
  return result
}

/** Running owns the disclosure; completion closes it once, then manual state wins. */
export function disclosureOpenAfterStatus(
  currentOpen: boolean,
  wasRunning: boolean,
  running: boolean,
): boolean {
  if (running) return true
  if (wasRunning) return false
  return currentOpen
}

/** Keep the count and its language-specific unit in one accessible label. */
export function executionProcessLabel(
  t: Translate<'execution.processCount'>,
  count: number,
): string {
  return t('execution.processCount', { count })
}

export function executionProcessCount(turn: FoldableTurn): number {
  return turn.processKeys.length + (turn.reasoningKey === undefined ? 0 : 1)
}

function ExecutionDisclosure({
  turn,
  running,
  t,
  children,
}: {
  readonly turn: FoldableTurn
  readonly running: boolean
  readonly t: Translate<'execution.processCount'>
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(running)
  const wasRunning = useRef(running)
  const bodyId = useId()
  useEffect(() => {
    setOpen(value => disclosureOpenAfterStatus(value, wasRunning.current, running))
    wasRunning.current = running
  }, [running])

  return (
    <section className={css.process} data-open={open || undefined} data-execution-fold-turn={turn.turn}>
      <button
        type="button"
        className={css.summary}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className={css.summaryLabel}>{executionProcessLabel(t, executionProcessCount(turn))}</span>
        <IconChevronRightOutline14 className={css.chevron} />
      </button>
      <div id={bodyId} className={css.processBody} aria-hidden={!open}>
        <div className={css.processBodyInner}>
          <div className={css.items}>{children}</div>
        </div>
      </div>
      <div className={css.divider} aria-hidden />
    </section>
  )
}

function nodeFromOwner(owner: object): ChatConversationViewNode | undefined {
  const node = (owner as { readonly node?: unknown }).node
  if (typeof node !== 'object' || node === null) return undefined
  const candidate = node as Partial<ChatConversationViewNode>
  return typeof candidate.key === 'string' && typeof candidate.kind === 'string'
    ? candidate as ChatConversationViewNode
    : undefined
}

function nativeNodeFallback(node: ChatConversationViewNode, t: ChatViewSlotProps['t']): ReactNode {
  return (
    <JsonBlock
      label={t('message.unknownSurface', { type: node.kind })}
      payload={node.data}
      truncatedLabel={total => t('json.truncated', { total })}
    />
  )
}

/**
 * The in-place wrapper calls the exact registered rc.8 Chat component. Its
 * only modification is this render-slot wrapper, which groups execution nodes
 * and delegates every visible node through Chat's original child-slot face.
 */
function FoldedChatView(props: FoldProps) {
  const {
    foldT,
    nativeChat: NativeChat,
    ...nativeProps
  } = props
  const nativeRenderSlot = props.renderSlot as unknown as MirroredRenderSlot
  const order = props.useSession(snapshot => snapshot.chat.order)
  const nodes = props.useSession(snapshot => snapshot.chat.nodes)
  const running = props.useSession(snapshot => snapshot.running)
  const turns = useMemo(() => foldableTurns(order, nodes), [nodes, order])

  const renderNativeNode = useCallback((
    node: ChatConversationViewNode,
    owner: object,
    options?: MirrorRenderOptions,
  ): ReactNode => nativeRenderSlot(
    'conversation.chat.node',
    { ...owner, node },
    {
      ...options,
      entryKey: node.kind,
      hookContext: node.key,
      fallback: nativeNodeFallback(node, props.t),
    },
  ), [nativeRenderSlot, props.t])

  const foldedRenderSlot = useCallback((
    key: string,
    owner: object,
    options?: MirrorRenderOptions,
  ): ReactNode => {
    if (key !== 'conversation.chat.node') return nativeRenderSlot(key, owner, options)
    const node = nodeFromOwner(owner)
    if (node === undefined) return nativeRenderSlot(key, owner, options)
    const turnNumber = turnOf(node)
    const turn = turnNumber === undefined ? undefined : turns.get(turnNumber)
    if (turn === undefined) return renderNativeNode(node, owner, options)

    const isProcessNode = turn.processKeys.includes(node.key)
    const isFinalNode = node.key === turn.finalKey
    if (isProcessNode && node.key !== turn.anchorKey) return null
    if (!isProcessNode && !isFinalNode) return renderNativeNode(node, owner, options)

    const answer = isFinalNode
      ? renderNativeNode(
          turn.reasoningKey === node.key ? projectAssistantNode(node, 'answer') : node,
          owner,
          options,
        )
      : null

    if (node.key !== turn.anchorKey) return answer

    const processRows: ReactNode[] = turn.processKeys.map((processKey) => {
      const processNode = nodes.get(processKey)
      return processNode === undefined ? null : (
        <div key={processKey} className={css.nativeFlowItem} data-execution-fold-node={processNode.kind}>
          {renderNativeNode(processNode, owner, options)}
        </div>
      )
    })
    if (turn.reasoningKey !== undefined) {
      const reasoningNode = nodes.get(turn.reasoningKey)
      if (reasoningNode !== undefined) {
        processRows.push(
          <div key={`${turn.reasoningKey}:reasoning`} className={css.nativeFlowItem} data-execution-fold-node="reasoning">
            {renderNativeNode(projectAssistantNode(reasoningNode, 'reasoning'), owner, options)}
          </div>,
        )
      }
    }

    const disclosure = (
      <ExecutionDisclosure turn={turn} running={!turn.complete && running} t={foldT}>
        {processRows}
      </ExecutionDisclosure>
    )
    return answer === null
      ? disclosure
      : <div className={css.anchorStack}>{disclosure}{answer}</div>
  }, [foldT, nativeRenderSlot, nodes, renderNativeNode, running, turns])

  return (
    <NativeChat
      {...nativeProps as Omit<ChatViewSlotProps, 'renderSlot'>}
      renderSlot={foldedRenderSlot as ChatViewSlotProps['renderSlot']}
    />
  )
}

interface NativeFallbackBoundaryProps {
  readonly children: ReactNode
  readonly nativeChat: ComponentType<ChatViewSlotProps>
  readonly nativeProps: ChatViewSlotProps
}

class NativeFallbackBoundary extends Component<NativeFallbackBoundaryProps, { readonly failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('execution-fold failed; rendering the untouched stock Chat view:', error)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const NativeChat = this.props.nativeChat
    return <NativeChat {...this.props.nativeProps} />
  }
}

function ExecutionFoldChatEntry(props: FoldProps) {
  const { foldT: _foldT, nativeChat, ...nativeProps } = props
  return (
    <NativeFallbackBoundary nativeChat={nativeChat} nativeProps={nativeProps as ChatViewSlotProps}>
      <FoldedChatView {...props} />
    </NativeFallbackBoundary>
  )
}

/**
 * rc.8-only short-term adapter: wrap the one stock Chat entry in place. This
 * keeps its id, tab, store, child-slot ownership and native renderSlot binding
 * intact; the plugin contributes no second conversation.view row.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'execution-fold: dictionaries')
  const foldT = ctx.locale.bind(NS)

  ctx.slots.inject('conversation.view', () => {
    let mountedStock: StoredEntry | undefined
    let restoreStock: (() => void) | undefined

    const mount = (): void => {
      const stock = ctx.slots.entries('conversation.view').find(entry =>
        entry.options.id === 'chat'
        && entry.children?.['conversation.chat.node'] !== undefined,
      )
      if (stock === mountedStock) return
      restoreStock?.()
      restoreStock = undefined
      mountedStock = stock
      if (stock === undefined || stock.inject === undefined) return

      const nativeChat = stock.component as ComponentType<ChatViewSlotProps>
      const stockInject = stock.inject as unknown as (...args: unknown[]) => Record<string, unknown>
      const wrappedInject = (...args: unknown[]): Record<string, unknown> => ({
        ...stockInject(...args),
        foldT,
        nativeChat,
      })
      stock.component = ExecutionFoldChatEntry
      stock.inject = wrappedInject as StoredEntry['inject']
      restoreStock = () => {
        if (stock.component === ExecutionFoldChatEntry) stock.component = nativeChat
        if (stock.inject === wrappedInject) stock.inject = stockInject as StoredEntry['inject']
      }
    }

    mount()
    const unsubscribe = ctx.slots.subscribe('conversation.view', mount)
    return () => {
      unsubscribe()
      restoreStock?.()
    }
  })
}
