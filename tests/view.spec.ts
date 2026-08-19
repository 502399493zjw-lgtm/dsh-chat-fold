import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, expandNestedContext, foldableTurns } from '../src/client/view.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  JsonBlock: () => null,
  MarkdownText: () => null,
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
    expect(nodes.get(turn?.processKeys[1] ?? '')?.data).toEqual(
      expect.objectContaining({ content: expect.stringContaining('available_skills') }),
    )
  })

  it('opens the native context disclosure so the outer fold reveals its body immediately', () => {
    const click = vi.fn()
    const root = {
      querySelector: vi.fn(() => ({ click })),
    }

    expect(expandNestedContext(root)).toBe(true)
    expect(root.querySelector).toHaveBeenCalledWith(
      '[data-disclosure-row][aria-expanded="false"]',
    )
    expect(click).toHaveBeenCalledOnce()
  })
})

describe('conversation view registration', () => {
  it('registers a distinct view id instead of shadowing the built-in chat cell', () => {
    const registrations: Array<{
      name?: string
      id?: string
      order?: number
      priority?: number
      children?: Record<string, { kind?: string; scope?: string }>
    }> = []
    const ctx = {
      effect(callback: () => void) { callback() },
      locale: {
        register() {},
        bind() { return (key: string) => key },
      },
      slots: {
        inject(_name: string, callback: () => void) { callback() },
        register(definition: {
          name?: string
          id?: string
          order?: number
          priority?: number
          children?: Record<string, { kind?: string; scope?: string }>
        }) {
          registrations.push(definition)
        },
      },
      sessions: { binding() { return undefined } },
    } as unknown as Context

    apply(ctx)

    expect(registrations).toContainEqual(expect.objectContaining({
      name: 'conversation.view',
      id: 'folded-chat',
      children: expect.objectContaining({
        'conversation.chat.node': expect.objectContaining({ kind: 'keyed', scope: 'session' }),
      }),
    }))
    expect(registrations).not.toContainEqual(expect.objectContaining({
      name: 'conversation.view',
      id: 'chat',
    }))
  })
})
