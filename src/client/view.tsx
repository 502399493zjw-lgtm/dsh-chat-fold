import { useMemo } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ChatConversationViewNode, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { en, NS, zh } from '../locales.ts'
import css from '../ExecutionFoldView.module.css'

export const inject = ['slots', 'sessions', 'locale']

interface FoldInjected {
  readonly loadOlder: () => void
}

type FoldProps = ConvViewProps & InjectFace<FoldInjected> & PropsLocale<typeof NS>

interface FoldTurn {
  readonly turn: number
  readonly visible: readonly ChatConversationViewNode[]
  readonly process: readonly string[]
  readonly answer: string
  readonly running: boolean
}

function turnOf(node: ChatConversationViewNode): number | undefined {
  if (node.location.kind === 'turn' || node.location.kind === 'step') return node.location.turn.turn
  return undefined
}

function textFrom(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) return ''
    const part = item as { readonly type?: string; readonly text?: unknown }
    return part.type === 'text' && typeof part.text === 'string' ? part.text : ''
  }).join('')
}

function assistantText(node: ChatConversationViewNode): string {
  if (node.kind !== 'assistant-step') return ''
  const data = node.data as { readonly blocks?: readonly { readonly kind?: string; readonly text?: unknown }[] }
  return (data.blocks ?? []).filter(block => block.kind === 'text').map(block => textFrom(block.text)).join('')
}

function processLabel(node: ChatConversationViewNode): string {
  const data = node.data as { readonly root?: { readonly name?: unknown }; readonly command?: { readonly name?: unknown } }
  if (node.kind === 'tool') return typeof data.root?.name === 'string' ? `tool · ${data.root.name}` : 'tool call'
  if (node.kind === 'command') return typeof data.command?.name === 'string' ? `command · ${data.command.name}` : 'command'
  if (node.kind === 'assistant-step') {
    const blocks = (node.data as { readonly blocks?: readonly { readonly kind?: string }[] }).blocks ?? []
    if (blocks.some(block => block.kind === 'reasoning')) return 'think / reasoning'
    return 'assistant step'
  }
  if (node.kind === 'retry') return 'model retry'
  if (node.kind === 'compaction') return 'context compaction'
  return node.kind.replaceAll('-', ' ')
}

function userText(node: ChatConversationViewNode): string {
  const data = node.data as { readonly content?: unknown; readonly text?: unknown }
  return textFrom(data.content ?? data.text)
}

export function turnsOf(order: readonly string[], nodes: { get: (key: string) => ChatConversationViewNode | undefined }): FoldTurn[] {
  const grouped = new Map<number, ChatConversationViewNode[]>()
  for (const key of order) {
    const node = nodes.get(key)
    const turn = node === undefined ? undefined : turnOf(node)
    if (node === undefined || turn === undefined) continue
    const current = grouped.get(turn) ?? []
    current.push(node)
    grouped.set(turn, current)
  }
  return [...grouped].map(([turn, items]) => {
    const visible = items.filter(node => node.kind === 'user')
    const answers = items.filter(node => node.kind === 'assistant-step').map(assistantText).filter(Boolean)
    const final = answers.at(-1) ?? ''
    const process = items.filter(node => !visible.includes(node) && node.kind !== 'turn-tail' && node.kind !== 'assistant-step')
    const reasoning = items.find(node => node.kind === 'assistant-step' && processLabel(node) === 'think / reasoning')
    const processLabels = [...process.map(processLabel), ...(reasoning === undefined ? [] : [processLabel(reasoning)])]
    const running = items.some(node => node.kind === 'assistant-step' && (node.data as { readonly status?: string }).status === 'running')
    return { turn, visible, process: processLabels, answer: final, running }
  }).filter(turn => turn.visible.length > 0 || turn.process.length > 0 || turn.answer.length > 0)
}

function FoldedChatView({ useSession, sessionId, loadOlder, t }: FoldProps) {
  const order = useSession(snapshot => snapshot.chat.order)
  const nodes = useSession(snapshot => snapshot.chat.nodes)
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const loadingOlder = useSession(snapshot => snapshot.loadingOlder)
  const turns = useMemo(() => turnsOf(order, nodes), [order, nodes])
  return (
    <div className={css.root} data-execution-fold-view={sessionId}>
      {hasMore && (
        <button className={css.loadEarlier} type="button" disabled={loadingOlder} onClick={loadOlder}>
          {loadingOlder ? t('history.loading') : t('history.loadEarlier')}
        </button>
      )}
      {turns.map(({ turn, visible, process, answer, running }) => (
        <section className={css.turn} key={turn} data-execution-fold-turn={turn}>
          {visible.map(node => (
            <div className={css.user} key={node.key}>
              {userText(node)}
            </div>
          ))}
          {(process.length > 0 || running) && (
            <details className={css.process} open={running}>
              <summary className={css.summary}>
                {running ? t('execution.running') : t('execution.processCount', { count: process.length })}
              </summary>
              <div className={css.items}>
                {(process.length > 0 ? process : [t('execution.empty')]).map((item, index) => (
                  <div className={css.item} key={`${turn}-${index}`}>{item}</div>
                ))}
              </div>
            </details>
          )}
          {answer.length > 0 && <div className={css.answer}><MarkdownText text={answer} /></div>}
        </section>
      ))}
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
