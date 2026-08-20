export const NS = 'execution-fold'

export type ExecutionFoldKey =
  | 'execution.processCount'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'execution-fold': ExecutionFoldKey
  }
}

export const zh: Record<ExecutionFoldKey, string> = {
  'execution.processCount': '执行过程 · {count} 步',
}

export const en: Record<ExecutionFoldKey, string> = {
  'execution.processCount': 'Execution process · {count} steps',
}
