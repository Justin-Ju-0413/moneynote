import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
  message?: string
}

// 单组件抛错时降级为错误占位，避免整树白屏（仍保留导航栏可用）
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <p className="text-sm text-[#c94040] mb-2">页面出错了</p>
          <p className="text-[10px] text-text-muted mb-4 break-all">{this.state.message}</p>
          <button
            className="px-4 py-2 text-xs border border-primary-300 hover:bg-primary-50"
            onClick={() => this.setState({ hasError: false, message: undefined })}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
