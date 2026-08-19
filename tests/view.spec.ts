import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, turnsOf } from '../src/client/view.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
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
  it('keeps only user-authored text visible and folds internal context metadata', () => {
    const entries = [
      node('user', 'user', { content: 'tell me what is on my desktop' }),
      node('steering', 'steering', { content: 'The approval policy changed from ask to never.' }),
      node('context', 'context', { content: 'Current runtime context. <available_skills>secret</available_skills>' }),
      node('tool', 'tool', { root: { name: 'desktop.list' } }),
      node('answer', 'assistant-step', { blocks: [{ kind: 'text', text: 'There are three files.' }] }),
    ]
    const nodes = new Map(entries.map(entry => [entry.key, entry]))

    const [turn] = turnsOf(entries.map(entry => entry.key), nodes)

    expect(turn?.visible.map(entry => entry.kind)).toEqual(['user'])
    expect(turn?.visible.map(entry => entry.data)).not.toContainEqual(
      expect.objectContaining({ content: expect.stringContaining('available_skills') }),
    )
    expect(turn?.process).toEqual(['steering', 'context', 'tool · desktop.list'])
    expect(turn?.answer).toBe('There are three files.')
  })
})

describe('conversation view registration', () => {
  it('registers a distinct view id instead of shadowing the built-in chat cell', () => {
    const registrations: Array<{ name?: string; id?: string; order?: number; priority?: number }> = []
    const ctx = {
      effect(callback: () => void) { callback() },
      locale: {
        register() {},
        bind() { return (key: string) => key },
      },
      slots: {
        inject(_name: string, callback: () => void) { callback() },
        register(definition: { name?: string; id?: string; order?: number; priority?: number }) {
          registrations.push(definition)
        },
      },
      sessions: { binding() { return undefined } },
    } as unknown as Context

    apply(ctx)

    expect(registrations).toContainEqual(expect.objectContaining({
      name: 'conversation.view',
      id: 'folded-chat',
    }))
    expect(registrations).not.toContainEqual(expect.objectContaining({
      name: 'conversation.view',
      id: 'chat',
    }))
  })
})
