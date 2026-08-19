export const NS = 'execution-fold'

export type ExecutionFoldKey =
  | 'view.executionFold'
  | 'execution.process'
  | 'execution.processCount'
  | 'execution.running'
  | 'execution.empty'
  | 'node.context'
  | 'node.steering'
  | 'node.reasoning'
  | 'node.tool'
  | 'node.details'
  | 'history.loadEarlier'
  | 'history.loading'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'execution-fold': ExecutionFoldKey
  }
}

export const zh: Record<ExecutionFoldKey, string> = {
  'view.executionFold': '折叠对话',
  'execution.process': '执行过程',
  'execution.processCount': '执行过程 · {count} 步',
  'execution.running': '执行中',
  'execution.empty': '暂无执行过程',
  'node.context': '运行上下文',
  'node.steering': '补充指令',
  'node.reasoning': '思考',
  'node.tool': '工具',
  'node.details': '详情',
  'history.loadEarlier': '加载更早消息',
  'history.loading': '加载中…',
}

export const en: Record<ExecutionFoldKey, string> = {
  'view.executionFold': 'Folded chat',
  'execution.process': 'Execution process',
  'execution.processCount': 'Execution process · {count} steps',
  'execution.running': 'Running',
  'execution.empty': 'No execution process',
  'node.context': 'Runtime context',
  'node.steering': 'Follow-up instruction',
  'node.reasoning': 'Reasoning',
  'node.tool': 'Tool',
  'node.details': 'Details',
  'history.loadEarlier': 'Load earlier messages',
  'history.loading': 'Loading…',
}
