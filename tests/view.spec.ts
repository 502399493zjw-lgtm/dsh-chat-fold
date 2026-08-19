import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import {
  apply,
  assistantBlocksForDisplay,
  contentText,
  disclosureOpenAfterStatus,
  foldableTurns,
  innerNodePresentation,
  innerToolPresentation,
  reasoningSummary,
} from '../src/client/view.tsx'

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
    expect(turn?.complete).toBe(true)
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

  it('keeps the complete context text instead of reducing it to a nested disclosure label', () => {
    expect(contentText([
      { type: 'text', text: 'Current runtime context.' },
      { type: 'text', text: '<available_skills>all entries</available_skills>' },
    ])).toBe('Current runtime context.\n<available_skills>all entries</available_skills>')
  })

  it('shows conversational assistant content without duplicating tool protocol blocks', () => {
    const blocks = [
      { kind: 'reasoning', text: 'I should read the file.' },
      { kind: 'tool-call', name: 'read', argsRaw: '{"file_path":"demo-note.md"}' },
      { kind: 'text', text: 'The file describes the folded view.' },
    ]

    expect(assistantBlocksForDisplay(blocks, 'all')).toEqual([
      { kind: 'reasoning', text: 'I should read the file.' },
      { kind: 'text', text: 'The file describes the folded view.' },
    ])
  })

  it('keeps native inner execution rows collapsed when the outer process opens', () => {
    expect(innerNodePresentation('context')).toEqual({
      surface: 'disclosure',
      defaultOpen: false,
    })
    expect(innerNodePresentation('tool-call')).toEqual({
      surface: 'disclosure',
      defaultOpen: false,
    })
    expect(innerNodePresentation('assistant-step', 'reasoning')).toEqual({
      surface: 'disclosure',
      defaultOpen: false,
    })
    expect(innerNodePresentation('assistant-step', 'text')).toEqual({
      surface: 'content',
    })
  })

  it('uses the same title and summary shape as the stock tool row', () => {
    expect(innerToolPresentation('bash', JSON.stringify({
      command: 'sleep 8',
      description: 'Wait eight seconds in foreground',
    }))).toEqual(expect.objectContaining({
      variant: 'bash',
      title: 'Bash',
      summary: 'Wait eight seconds in foreground',
    }))
    expect(innerToolPresentation('custom_tool', '{"value":"demo"}')).toEqual(expect.objectContaining({
      variant: 'others',
      title: 'Tool call',
      summary: 'custom_tool · demo',
    }))
  })

  it('removes an outer Markdown emphasis wrapper from the reasoning summary', () => {
    expect(reasoningSummary('**Planning foreground sleep execution**\nMore detail.')).toBe(
      'Planning foreground sleep execution',
    )
    expect(reasoningSummary('Keep *inline* emphasis')).toBe('Keep *inline* emphasis')
  })
})

describe('conversation view registration', () => {
  it('registers a distinct view without redeclaring the stock chat node slot', () => {
    const registrations: Array<{
      name?: string
      id?: string
      order?: number
      priority?: number
      children?: Record<string, { kind?: string; scope?: string }>
    }> = []
    const declaredSlots = new Set(['conversation.chat.node'])
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
          for (const child of Object.keys(definition.children ?? {})) {
            if (declaredSlots.has(child)) throw new Error(`slot "${child}" is already declared`)
            declaredSlots.add(child)
          }
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
    expect(registrations.find(entry => entry.id === 'folded-chat')?.children).toBeUndefined()
    expect(registrations).not.toContainEqual(expect.objectContaining({
      name: 'conversation.view',
      id: 'chat',
    }))
  })
})
