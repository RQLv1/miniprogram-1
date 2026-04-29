import type { ChatMessage, ChatReference, ExpertInfo } from '../../utils/constants'
import { EXPERTS } from '../../utils/expertData'
import { ensureCurrentOpenid } from '../../utils/auth'
import { createExpertSession, getExpertSessions, searchPolicyChunks, updateExpertSession } from '../../utils/cloudDB'
import { getExpertPrompt } from '../../utils/promptRegistry'
import { getExpertAvatarUrl } from '../../utils/cloudAssets'
import type { ExpertSessionDoc, RagPolicyMatch } from '../../utils/cloudDB'

const RAG_LOW_CONFIDENCE_SCORE = 0.08

const EXPERT_RAG_INSTRUCTION = `资料库使用要求：
1. 优先基于提供的参考资料原文回答，并结合专家身份给出判断和建议；
2. 引用资料时说明资料标题、模块、章节或来源文件；
3. 资料不足以支持确定结论时，明确说明"当前资料库未检索到明确依据"，不要编造政策编号、金额、期限或地区口径；
4. 涉及重大税务处理时，提醒用户结合企业实际资料并以主管税务机关口径为准。`

const EXPERT_RAG_FALLBACK_INSTRUCTION = `回答方式要求：
请直接以专家身份回答用户问题，不要解释回答来源、检索状态或是否有参考资料。
不要使用"资料库"、"检索"、"未检索到"、"依据"、"通用建议"、"当前提醒"、"前置提醒"等表述。
回答应自然、专业、可执行；不得编造政策编号、金额、期限或地区口径。
如果用户只是问候，请简短回应并引导用户补充具体财税问题，不要展开财税知识清单。`

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

function isGreetingOnly(text: string): boolean {
  return /^(你好|您好|在吗|哈喽|hello|hi|hey)[！!。.\s]*$/i.test(text.trim())
}

function buildExpertGreetingPrompt(expert: ExpertInfo): string {
  return `你正在扮演平台财税专家「${expert.name}」，身份是「${expert.title}」。
用户只是在问候。请只用一句中文介绍你是谁和你的身份，例如"您好，我是${expert.name}，${expert.title}。"。
不要提供财税建议，不要展开说明，不要提资料库、检索、依据、RAG 或参考资料。`
}

function buildExpertRagContext(matches: RagPolicyMatch[]): string {
  if (!matches.length) return ''
  return [
    '可引用参考资料：',
    ...matches.map((item, index) => [
      `【资料${index + 1}】${item.title}`,
      `模块：${item.moduleName || '未注明'}`,
      `来源：${item.sourcePath || item.fileName || '未注明'}`,
      `章节：${item.sectionTitle || '未注明'}`,
      `原文摘录：${item.sourceExcerpt || item.content}`,
    ].join('\n')),
  ].join('\n\n')
}

function buildRagReferences(matches: RagPolicyMatch[]): ChatReference[] {
  const seen: Record<string, boolean> = {}
  return matches
    .filter((item) => item.title || item.sourcePath || item.content)
    .filter((item) => {
      const key = `${item.docId || ''}|${item.sourcePath || ''}|${item.sectionTitle || ''}`
      if (seen[key]) return false
      seen[key] = true
      return true
    })
    .slice(0, 5)
    .map((item) => ({
      title: item.title || item.sourcePath || '参考资料',
      docId: item.docId,
      moduleName: item.moduleName,
      sourcePath: item.sourcePath,
      sectionTitle: item.sectionTitle,
      sourceExcerpt: (item.sourceExcerpt || item.content || '').slice(0, 180),
      cloudPath: item.cloudPath,
    }))
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

interface ExpertApiMessage {
  role: 'user' | 'assistant'
  content: string
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
    const previousMessages = this.data.messages.filter((item) => !item.loading)
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
    if (isGreetingOnly(text)) {
      this._streamGreetingResponse(expert, userMsg)
      return
    }

    this._requestRagStream(expert, userMsg, previousMessages)
  },

  _streamGreetingResponse(expert: ExpertInfo, userMsg: ChatMessage) {
    let accumulated = ''
    const model = (wx.cloud as any).extend.AI.createModel('deepseek', { timeout: 300000 })
    model.streamText({
      data: {
        model: 'deepseek-v3.2',
        messages: [
          { role: 'system', content: buildExpertGreetingPrompt(expert) },
          { role: 'user', content: userMsg.content },
        ],
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
            loadingPhase: '',
          }
          this.setData({ messages: nextMessages })
          this._scrollToBottom()
        }
      },
      onFinish: () => {
        this.setData({ isStreaming: false })
        const finalMessages = this.data.messages.filter((item) => !item.loading)
        this._persistExpertSession(expert, finalMessages)
      },
    }).catch((err: unknown) => {
      console.error('[expert-chat] greeting streamText failed:', err)
      const nextMessages = [...this.data.messages]
      const lastIndex = nextMessages.length - 1
      if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
        nextMessages[lastIndex] = {
          ...nextMessages[lastIndex],
          content: '请求失败，请稍后重试。',
          loading: false,
          loadingPhase: '',
        }
        this.setData({ messages: nextMessages, isStreaming: false })
      }
    })
  },

  _requestRagStream(expert: ExpertInfo, userMsg: ChatMessage, previousMessages: ChatMessage[]) {
    this._updateLoadingPhase('检索中...')

    searchPolicyChunks(userMsg.content, { topK: 5 })
      .then((retrieval) => {
        const matches = retrieval && retrieval.success ? retrieval.matches || [] : []
        const maxScore = matches.length ? matches[0].score : 0
        const isLowConfidence = !matches.length || maxScore < RAG_LOW_CONFIDENCE_SCORE
        const references = isLowConfidence ? [] : buildRagReferences(matches)
        const systemPrompt = [
          getExpertPrompt(expert.id),
          isLowConfidence ? EXPERT_RAG_FALLBACK_INSTRUCTION : EXPERT_RAG_INSTRUCTION,
        ].join('\n\n')
        const userContent = isLowConfidence
          ? userMsg.content
          : `用户问题：\n${userMsg.content}\n\n${buildExpertRagContext(matches)}`

        this._updateLoadingPhase('思考中...')
        this._streamModelResponse(expert, previousMessages, systemPrompt, userContent, references)
      })
      .catch((err: unknown) => {
        console.warn('[expert-chat] ragRetrieval failed, fallback to expert chat:', err)
        this._updateLoadingPhase('思考中...')
        const systemPrompt = [getExpertPrompt(expert.id), EXPERT_RAG_FALLBACK_INSTRUCTION].join('\n\n')
        this._streamModelResponse(expert, previousMessages, systemPrompt, userMsg.content)
      })
  },

  _streamModelResponse(
    expert: ExpertInfo,
    previousMessages: ChatMessage[],
    systemPrompt: string,
    userContent: string,
    references: ChatReference[] = [],
  ) {
    const apiMessages: ExpertApiMessage[] = previousMessages
      .map((item) => ({ role: item.role, content: item.content }))
      .concat({ role: 'user', content: userContent })

    let accumulated = ''
    const model = (wx.cloud as any).extend.AI.createModel('deepseek', { timeout: 300000 })
    model.streamText({
      data: {
        model: 'deepseek-v3.2',
        messages: [{ role: 'system', content: systemPrompt }, ...apiMessages],
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
            loadingPhase: '',
          }
          this.setData({ messages: nextMessages })
          this._scrollToBottom()
        }
      },
      onFinish: () => {
        if (references.length) {
          const nextMessages = [...this.data.messages]
          const lastIndex = nextMessages.length - 1
          if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
            nextMessages[lastIndex] = { ...nextMessages[lastIndex], references }
            this.setData({ messages: nextMessages })
          }
        }
        this.setData({ isStreaming: false })
        const finalMessages = this.data.messages.filter((item) => !item.loading)
        this._persistExpertSession(expert, finalMessages)
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
          loadingPhase: '',
        }
        this.setData({ messages: nextMessages, isStreaming: false })
      }
    })
  },

  _persistExpertSession(expert: ExpertInfo, finalMessages: ChatMessage[]) {
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

  _updateLoadingPhase(phase: string) {
    const nextMessages = [...this.data.messages]
    const lastIndex = nextMessages.length - 1
    if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant' && nextMessages[lastIndex].loading) {
      nextMessages[lastIndex] = { ...nextMessages[lastIndex], loadingPhase: phase }
      this.setData({ messages: nextMessages })
    }
  },

  onSourceTap(e: WechatMiniprogram.CustomEvent<ChatReference>) {
    const reference = e.detail
    if (!reference || (!reference.docId && !reference.sourcePath)) return
    const params = [
      reference.docId ? `docId=${encodeURIComponent(reference.docId)}` : '',
      reference.sourcePath ? `sourcePath=${encodeURIComponent(reference.sourcePath)}` : '',
      reference.sectionTitle ? `sectionTitle=${encodeURIComponent(reference.sectionTitle)}` : '',
    ].filter(Boolean).join('&')
    wx.navigateTo({ url: `/pages/rag-source/rag-source?${params}` })
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
