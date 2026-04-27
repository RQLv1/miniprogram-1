import type { ChatMessage, ExpertInfo } from '../../utils/constants'
import { EXPERTS } from '../../utils/expertData'
import { ensureCurrentOpenid } from '../../utils/auth'
import { createExpertSession, getExpertSessions, updateExpertSession } from '../../utils/cloudDB'
import { getExpertPrompt } from '../../utils/promptRegistry'
import { getExpertAvatarUrl } from '../../utils/cloudAssets'
import type { ExpertSessionDoc } from '../../utils/cloudDB'

function generateSessionId(): string {
  return `expert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getOverlayTopPadding(): number {
  try {
    const rect = wx.getMenuButtonBoundingClientRect()
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 0
    return Math.ceil(rect.bottom > statusBarHeight ? rect.bottom + 8 : statusBarHeight)
  } catch (err) {
    console.warn('[expert-chat] get overlay top padding failed:', err)
    return 0
  }
}

function getAvatarLabel(expert: ExpertInfo | null): string {
  return (expert && expert.name.charAt(0)) || '专'
}

function getAvatarSrc(expert: ExpertInfo | null): string {
  if (!expert) return ''
  return expert.avatarUrl || getExpertAvatarUrl(`${expert.avatar}.png`)
}

function buildExpertSessionTitle(expertName: string, messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((item) => item.role === 'user')
  const titleText = firstUserMessage ? firstUserMessage.content.replace(/\s+/g, ' ').trim() : '咨询'
  return `与${expertName}的咨询 - ${titleText.slice(0, 15)}`
}

interface ExpertHistoryView {
  _id: string
  expertId: string
  expertName: string
  title: string
  updatedAt: number
  updatedText: string
  messages: ChatMessage[]
}

function toHistoryView(item: ExpertSessionDoc): ExpertHistoryView {
  return {
    _id: String(item._id || ''),
    expertId: item.expertId,
    expertName: item.expertName,
    title: item.title,
    updatedAt: item.updatedAt,
    updatedText: formatDate(item.updatedAt || item.createdAt),
    messages: item.messages,
  }
}

Page({
  data: {
    expert: null as ExpertInfo | null,
    avatarSrc: '',
    messages: [] as ChatMessage[],
    inputText: '',
    isStreaming: false,
    showHistory: false,
    historySessions: [] as ExpertHistoryView[],
    currentExpertSessionId: '',
    sessionId: '',
    scrollAnchor: '',
    avatarLoadFailed: false,
    avatarLabel: '专',
    overlayTopPadding: 0,
  },

  onLoad(query: Record<string, string>) {
    const expertId = query.expertId || ''
    const expert = EXPERTS.find((item) => item.id === expertId) || null
    this.setData({
      expert,
      avatarSrc: getAvatarSrc(expert),
      sessionId: generateSessionId(),
      avatarLoadFailed: false,
      avatarLabel: getAvatarLabel(expert),
      overlayTopPadding: getOverlayTopPadding(),
    })
  },

  onUnload() {},

  onAvatarError() {
    this.setData({ avatarLoadFailed: true })
  },

  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({ inputText: e.detail.value })
  },

  onSend() {
    const text = this.data.inputText.trim()
    if (!text || this.data.isStreaming || !this.data.expert) return
    this._sendMessage(text)
  },

  _sendMessage(text: string) {
    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
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

    const expert = this.data.expert!
    const apiMessages = this.data.messages
      .filter((item) => !item.loading)
      .concat(userMsg)
      .map((item) => ({ role: item.role, content: item.content }))

    let accumulated = ''
    const model = (wx.cloud as any).extend.AI.createModel('deepseek', { timeout: 300000 })
    model.streamText({
      data: {
        model: 'deepseek-v3.2',
        messages: [{ role: 'system', content: getExpertPrompt(expert.id) }, ...apiMessages],
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
        const title = buildExpertSessionTitle(expert.name, finalMessages)
        ensureCurrentOpenid()
          .then((openid) => {
            const currentId = this.data.currentExpertSessionId
            if (currentId) {
              return updateExpertSession(currentId, finalMessages, title).then(() => currentId)
            }
            return createExpertSession(openid, {
              expertId: expert.id,
              expertName: expert.name,
              title,
              messages: finalMessages,
            })
          })
          .then((id) => {
            this.setData({ currentExpertSessionId: id })
          })
          .catch((err: unknown) => {
            console.error('[expert-chat] persist expert session failed:', err)
          })
      },
    }).catch((err: unknown) => {
      console.error('[expert-chat] AI streamText failed:', err)
      const nextMessages = [...this.data.messages]
      const lastIndex = nextMessages.length - 1
      if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
        nextMessages[lastIndex] = {
          ...nextMessages[lastIndex],
          content: '请求失败，请稍后重试。',
          loading: false,
        }
        this.setData({ messages: nextMessages, isStreaming: false })
      }
    })
  },

  _scrollToBottom() {
    this.setData({ scrollAnchor: 'expert-bottom' })
  },

  onHistoryTap() {
    this.setData({ showHistory: true })
    this._loadHistory()
  },

  _loadHistory() {
    ensureCurrentOpenid()
      .then((openid) => getExpertSessions(openid))
      .then((sessions) => {
        this.setData({ historySessions: sessions.map(toHistoryView) })
      })
      .catch((err: unknown) => {
        console.error('[expert-chat] load history failed:', err)
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

    const expert = EXPERTS.find((item) => item.id === session.expertId) || null
    if (!expert) {
      wx.showToast({ title: '专家信息不存在', icon: 'none' })
      return
    }

    this.setData({
      expert,
      avatarSrc: getAvatarSrc(expert),
      avatarLoadFailed: false,
      avatarLabel: getAvatarLabel(expert),
      messages: session.messages,
      currentExpertSessionId: session._id,
      sessionId: generateSessionId(),
      showHistory: false,
      inputText: '',
      isStreaming: false,
    })
    this._scrollToBottom()
  },

  onNewChat() {
    this.setData({
      messages: [],
      inputText: '',
      isStreaming: false,
      showHistory: false,
      currentExpertSessionId: '',
      sessionId: generateSessionId(),
    })
  },

})
