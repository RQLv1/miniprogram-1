import { ChatMessage, PendingChatTask, TOOL_ITEMS, ToolItem, isReportToolId } from '../../utils/constants'
import { ensureCurrentOpenid } from '../../utils/auth'
import { getSessions, saveReport, saveSession } from '../../utils/cloudDB'
import { GENERAL_CHAT_PROMPT } from '../../utils/chatPrompt'
import { ROBOT_AVATAR_URL } from '../../utils/cloudAssets'
import { createShareMessage, enableShareMenu } from '../../utils/share'

const FAQ_LIST = [
  { question: '如何合理降低企业所得税税负？', tags: ['企业所得税', '节税'] },
  { question: '小规模纳税人季度收入多少可以免征增值税？', tags: ['增值税', '小规模'] },
  { question: '研发费用加计扣除政策如何享受？', tags: ['研发费', '优惠政策'] },
  { question: '个人所得税汇算清缴需要准备哪些材料？', tags: ['个税', '汇算清缴'] },
]

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface HistoryView {
  _id: string
  title: string
  createdAt: number
  createdText: string
  messages: ChatMessage[]
}

interface ReportMeta {
  type: string
  title: string
  questionText: string
}

interface SendMessageOptions {
  displayText: string
  modelText?: string
  systemPrompt?: string
  sessionTitle?: string
  reportMeta?: ReportMeta
}

function getMessageModelContent(message: ChatMessage): string {
  return message.modelContent || message.content
}

function buildSessionTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 20)
}

function getOverlayTopPadding(): number {
  try {
    const rect = wx.getMenuButtonBoundingClientRect()
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 0
    return Math.ceil(rect.bottom > statusBarHeight ? rect.bottom + 8 : statusBarHeight)
  } catch (err) {
    console.warn('[chat] get overlay top padding failed:', err)
    return 0
  }
}

Page({
  data: {
    messages: [] as ChatMessage[],
    inputText: '',
    isStreaming: false,
    showHistory: false,
    showMenu: false,
    historySessions: [] as HistoryView[],
    featuredTools: [] as ToolItem[],
    overflowTools: [] as ToolItem[],
    faqList: FAQ_LIST.map((item) => ({ ...item, tagsLabel: item.tags.join(' · ') })),
    robotAvatar: ROBOT_AVATAR_URL,
    sessionId: '',
    scrollAnchor: '',
    overlayTopPadding: 0,
  },

  onLoad() {
    enableShareMenu()
    this.setData({
      featuredTools: TOOL_ITEMS.slice(0, 4),
      overflowTools: TOOL_ITEMS,
      sessionId: generateSessionId(),
      overlayTopPadding: getOverlayTopPadding(),
    })
  },

  onUnload() {},

  onShow() {
    const tabBar = this.getTabBar()
    if (tabBar) {
      tabBar.setData({ selected: 0 })
    }
    this._consumePendingTask()
  },

  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({ inputText: e.detail.value })
  },

  onFaqTap(e: WechatMiniprogram.TouchEvent) {
    const question = (e.currentTarget.dataset as { question: string }).question
    this.setData({ inputText: question })
    this._sendMessage({ displayText: question })
  },

  onSend() {
    const text = this.data.inputText.trim()
    if (!text || this.data.isStreaming) return
    this._sendMessage({ displayText: text })
  },

  onShareAppMessage() {
    return createShareMessage()
  },

  _consumePendingTask() {
    const app = getApp<IAppOption>()
    const pendingTask: PendingChatTask | undefined = app.globalData.pendingChatTask
    if (!pendingTask) return

    app.globalData.pendingChatTask = undefined
    this.setData({
      messages: [],
      sessionId: generateSessionId(),
      isStreaming: false,
      inputText: '',
      showHistory: false,
      showMenu: false,
    }, () => {
      this._sendMessage({
        displayText: pendingTask.displayText,
        modelText: pendingTask.promptText,
        systemPrompt: pendingTask.systemPrompt,
        sessionTitle: pendingTask.reportTitle,
        reportMeta: {
          type: pendingTask.toolId,
          title: pendingTask.reportTitle,
          questionText: pendingTask.questionText,
        },
      })
    })
  },

  _sendMessage(options: SendMessageOptions) {
    const displayText = options.displayText.trim()
    const modelText = (options.modelText || displayText).trim()
    if (!displayText || !modelText) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: displayText,
      modelContent: modelText,
      timestamp: Date.now(),
    }
    const loadingMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      loading: true,
    }

    const messages = [...this.data.messages, userMsg, loadingMsg]
    this.setData({
      messages,
      inputText: '',
      isStreaming: true,
    })
    this._scrollToBottom()

    const apiMessages = this.data.messages
      .filter((item) => !item.loading)
      .concat(userMsg)
      .map((item) => ({ role: item.role, content: getMessageModelContent(item) }))

    let accumulated = ''
    const model = (wx.cloud as any).extend.AI.createModel('deepseek', { timeout: 300000 })
    model.streamText({
      data: {
        model: 'deepseek-v3.2',
        messages: [{ role: 'system', content: options.systemPrompt || GENERAL_CHAT_PROMPT }, ...apiMessages],
      },
      onText: (delta: string) => {
        accumulated += delta
        const nextMessages = [...this.data.messages]
        const lastIndex = nextMessages.length - 1
        if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
          nextMessages[lastIndex] = {
            ...nextMessages[lastIndex],
            content: accumulated,
            loading: false,
          }
          this.setData({ messages: nextMessages })
          this._scrollToBottom()
        }
      },
      onFinish: () => {
        this.setData({ isStreaming: false })
        const finalMessages = this.data.messages.filter((item) => !item.loading)
        ensureCurrentOpenid()
          .then((openid) => {
            const tasks: Array<Promise<unknown>> = [
              saveSession(openid, options.sessionTitle || buildSessionTitle(userMsg.content), finalMessages),
            ]
            if (options.reportMeta && accumulated && isReportToolId(options.reportMeta.type)) {
              tasks.push(saveReport(
                openid,
                options.reportMeta.type,
                accumulated,
                options.reportMeta.title,
                { questionText: options.reportMeta.questionText },
              ))
            }
            return Promise.allSettled(tasks)
          })
          .then((results) => {
            if (!results) return
            results.forEach((result) => {
              if (result.status === 'rejected') {
                console.error('[chat] persist failed:', result.reason)
              }
            })
          })
          .catch((err: unknown) => {
            console.error('[chat] ensure openid failed:', err)
          })
        this.setData({ sessionId: generateSessionId() })
      },
    }).catch((err: unknown) => {
      console.error('[chat] AI streamText failed:', err)
      const nextMessages = [...this.data.messages]
      const lastIndex = nextMessages.length - 1
      if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
        nextMessages[lastIndex] = {
          ...nextMessages[lastIndex],
          content: '抱歉，请求失败，请稍后重试。',
          loading: false,
        }
        this.setData({ messages: nextMessages, isStreaming: false })
      }
    })
  },

  _scrollToBottom() {
    this.setData({ scrollAnchor: 'chat-bottom' })
  },

  onHistoryTap() {
    this.setData({ showHistory: true })
    this._loadHistory()
  },

  _loadHistory() {
    ensureCurrentOpenid()
      .then((openid) => getSessions(openid))
      .then((sessions) => {
        this.setData({
          historySessions: sessions.map((item) => ({
            _id: String(item._id),
            title: item.title,
            createdAt: item.createdAt,
            createdText: formatDate(item.createdAt),
            messages: item.messages,
          })),
        })
      })
      .catch(() => {
        this.setData({ historySessions: [] })
      })
  },

  onHistoryClose() {
    this.setData({ showHistory: false })
  },

  onHistorySelect(e: WechatMiniprogram.TouchEvent) {
    const idx = Number((e.currentTarget.dataset as { idx: number }).idx)
    const session = this.data.historySessions[idx]
    if (!session) return
    this.setData({
      messages: session.messages,
      showHistory: false,
      sessionId: generateSessionId(),
    })
    this._scrollToBottom()
  },

  onQuickToolTap(e: WechatMiniprogram.TouchEvent) {
    const path = (e.currentTarget.dataset as { path: string }).path
    wx.navigateTo({ url: path })
  },

  onMenuOpen() {
    this.setData({ showMenu: true })
  },

  onMenuClose() {
    this.setData({ showMenu: false })
  },

  onOverflowToolTap(e: WechatMiniprogram.TouchEvent) {
    const path = (e.currentTarget.dataset as { path: string }).path
    this.setData({ showMenu: false })
    wx.navigateTo({ url: path })
  },

  onExpertsTap() {
    this.setData({ showMenu: false })
    wx.navigateTo({ url: '/pages/experts/experts' })
  },

  onNewChat() {
    getApp<IAppOption>().globalData.pendingChatTask = undefined
    this.setData({
      messages: [],
      sessionId: generateSessionId(),
      isStreaming: false,
      inputText: '',
      showHistory: false,
    })
  },

})
