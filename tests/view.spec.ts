import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import {
  apply,
  disclosureOpenAfterStatus,
  executionProcessCount,
  executionProcessLabel,
  foldableTurns,
  projectAssistantNode,
} from '../src/client/view.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronRightOutline14: () => null,
  JsonBlock: () => null,
}))

function node(
  key: string,
  kind: string,
  data: unknown,
): ChatConversationViewNode {
  return {
    key,
    kind,
    location: { kind: 'turn', turn: { turn: 1 } },
    data,
  }
}

describe('folded conversation projection', () => {
  it('keeps every execution node available for native rendering when expanded', () => {
    const entries = [
      node('user', 'user', { content: 'tell me what is on my desktop' }),
      node('steering', 'steering', { content: 'The approval policy changed from ask to never.' }),
      node('context', 'context', { content: 'Current runtime context. <available_skills>secret</available_skills>' }),
      node('think', 'assistant-step', {
        status: 'settled',
        blocks: [{ kind: 'reasoning', text: 'I should inspect the desktop.' }],
      }),
      node('tool', 'tool-call', { root: { name: 'desktop.list' } }),
      node('answer', 'assistant-step', {
        status: 'settled',
        finalNode: { seq: 6 },
        blocks: [
          { kind: 'reasoning', text: 'The listing contains three entries.' },
          { kind: 'text', text: 'There are three files.' },
        ],
      }),
      node('tail', 'turn-tail', { turn: 1, seq: 6 }),
    ]
    const nodes = new Map(entries.map(entry => [entry.key, entry]))

    const turn = foldableTurns(entries.map(entry => entry.key), nodes).get(1)

    expect(turn?.retainedKeys).toEqual(['user'])
    expect(turn?.processKeys).toEqual(['steering', 'context', 'think', 'tool'])
    expect(turn?.reasoningKey).toBe('answer')
    expect(turn?.finalKey).toBe('answer')
    expect(turn?.tailKey).toBe('tail')
    expect(turn?.anchorKey).toBe('steering')
    expect(turn?.complete).toBe(true)
    expect(turn === undefined ? 0 : executionProcessCount(turn)).toBe(5)
    expect(nodes.get(turn?.processKeys[1] ?? '')?.data).toEqual(
      expect.objectContaining({ content: expect.stringContaining('available_skills') }),
    )
  })

  it('projects an in-flight turn before its final answer exists', () => {
    const entries = [
      node('user', 'user', { content: 'inspect the project' }),
      node('context', 'context', { content: 'Current runtime context.' }),
      node('tool', 'tool-call', { root: { name: 'Bash', status: 'running' } }),
      node('draft', 'assistant-step', {
        status: 'running',
        blocks: [{ kind: 'reasoning', text: 'Waiting for the command.' }],
      }),
    ]
    const nodes = new Map(entries.map(entry => [entry.key, entry]))

    const turn = foldableTurns(entries.map(entry => entry.key), nodes).get(1)

    expect(turn).toEqual(expect.objectContaining({
      complete: false,
      retainedKeys: ['user'],
      processKeys: ['context', 'tool', 'draft'],
      reasoningKey: undefined,
      finalKey: undefined,
      tailKey: undefined,
    }))
  })

  it('auto-opens while running, auto-closes on completion, then preserves a manual choice', () => {
    expect(disclosureOpenAfterStatus(false, false, true)).toBe(true)
    expect(disclosureOpenAfterStatus(true, true, false)).toBe(false)
    expect(disclosureOpenAfterStatus(true, false, false)).toBe(true)
  })

  it('formats the complete process label with the localized step unit', () => {
    const t = (key: string, params?: Record<string, unknown>) => key === 'execution.processCount'
      ? `执行过程 · ${String(params?.count)} 步`
      : key

    expect(executionProcessLabel(t, 3)).toBe('执行过程 · 3 步')
  })

  it('splits a closing assistant through the stock renderer without losing either half', () => {
    const source = node('answer', 'assistant-step', {
      status: 'settled',
      finalNode: { seq: 6 },
      blocks: [
        { kind: 'reasoning', text: 'Inspect the result.' },
        { kind: 'text', text: 'There are three files.' },
      ],
    })

    expect(projectAssistantNode(source, 'reasoning').data).toEqual(expect.objectContaining({
      finalNode: undefined,
      blocks: [{ kind: 'reasoning', text: 'Inspect the result.' }],
    }))
    expect(projectAssistantNode(source, 'answer').data).toEqual(expect.objectContaining({
      finalNode: { seq: 6 },
      blocks: [{ kind: 'text', text: 'There are three files.' }],
    }))
  })
})

describe('conversation view registration', () => {
  it('wraps the one stock chat entry in place without registering another visible tab', () => {
    const registrations: unknown[] = []
    let injectedDisposer: (() => void) | undefined
    const stockStore = { create() {} }
    const stockInject = () => ({ loadOlder() {} })
    const StockChat = () => null
    const stockChatEntry = {
      component: StockChat,
      options: { id: 'chat', order: 0, label: '对话', priority: 0 },
      store: stockStore,
      inject: stockInject,
      locale: 'conversation',
      children: {
        'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: {} },
        'conversation.message.images': { kind: 'single', scope: 'session' },
      },
    }
    const slotsService = {
      inject(_name: string, callback: () => void | (() => void)) {
        injectedDisposer = callback() ?? undefined
      },
      entries() { return [stockChatEntry] },
      subscribe() { return () => {} },
      register(...args: unknown[]) {
        registrations.push(args)
        return () => {}
      },
    }
    const ctx = {
      effect(callback: () => void) { callback() },
      locale: {
        register() {},
        bind() {
          if (this !== ctx.locale) throw new TypeError('LocaleService.bind receiver was lost')
          return (key: string) => key
        },
        subscribe() { return () => {} },
        getSnapshot() { return { revision: 0 } },
      },
      slots: slotsService,
      sessions: { binding() { return undefined } },
    } as unknown as Context

    apply(ctx)

    expect(registrations).toEqual([])
    expect(stockChatEntry.component).not.toBe(StockChat)
    expect(stockChatEntry.options).toEqual({ id: 'chat', order: 0, label: '对话', priority: 0 })
    expect(stockChatEntry.store).toBe(stockStore)
    expect(stockChatEntry.children).toHaveProperty('conversation.chat.node')
    const injected = stockChatEntry.inject('session-1', {})
    expect(injected?.nativeChat).toBe(StockChat)
    expect(injected?.foldT).toBeTypeOf('function')

    injectedDisposer?.()
    expect(stockChatEntry.component).toBe(StockChat)
    expect(stockChatEntry.inject).toBe(stockInject)
  })
})
