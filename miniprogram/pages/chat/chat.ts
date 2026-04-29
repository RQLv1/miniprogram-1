import { ChatMessage, ChatReference, PendingChatTask, TOOL_ITEMS, ToolItem, isReportToolId } from '../../utils/constants'
import { ensureCurrentOpenid } from '../../utils/auth'
import { getSessions, saveReport, saveSession, searchPolicyChunks } from '../../utils/cloudDB'
import { GENERAL_CHAT_PROMPT } from '../../utils/chatPrompt'
import { ROBOT_AVATAR_URL } from '../../utils/cloudAssets'
import { createShareMessage, enableShareMenu } from '../../utils/share'

const FAQ_LIST = [
  { question: '如何合理降低企业所得税税负？', tags: ['企业所得税', '节税'] },
  { question: '小规模纳税人季度收入多少可以免征增值税？', tags: ['增值税', '小规模'] },
  { question: '研发费用加计扣除政策如何享受？', tags: ['研发费', '优惠政策'] },
  { question: '个人所得税汇算清缴需要准备哪些材料？', tags: ['个税', '汇算清缴'] },
]


const RAG_LOW_CONFIDENCE_SCORE = 0.08

const RAG_SYSTEM_PROMPT = `你是「智税工作台」的专业财税资料助手。请优先基于提供的参考资料片段回答用户问题。

回答要求：
1. 先直接回答结论，再说明依据、操作建议和注意事项；
2. 必须基于"原文摘录"回答，并引用资料标题、模块、章节或来源文件；
3. 检索片段不足以支持结论时，明确说明"当前资料库未检索到明确依据"，不要编造政策编号、金额、期限或地区口径；
4. 涉及重大税务处理时，提醒用户结合企业资料并以主管税务机关口径为准；
5. 使用中文，结构清晰，控制在 800 字以内。`

const RAG_FALLBACK_SYSTEM_PROMPT = `你是「智税工作台」的专业财税顾问助手。当前资料库未检索到与问题直接相关的依据，请基于通用财税知识给出参考建议。

回答要求：
1. 给出实用的参考建议或分析思路；
2. 不得编造政策编号、具体金额、期限或地区口径；
3. 明确说明本次回答为通用建议，非资料库确定依据；
4. 涉及重大税务处理时，提醒用户以主管税务机关口径为准；
5. 使用中文，结构清晰，控制在 600 字以内。`

const GREETING_SYSTEM_PROMPT = `你是「智税工作台」的财税顾问助手。用户只是在问候。
请只用一句中文简短介绍你的身份，例如"您好，我是智税工作台的财税顾问助手。"。
不要提供财税建议，不要展开说明，不要提资料库、检索、依据、RAG 或参考资料。`

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

function isGreetingOnly(text: string): boolean {
  return /^(你好|您好|在吗|哈喽|hello|hi|hey)[！!。.\s]*$/i.test(text.trim())
}

function resolveChatRagOptions(text: string): { moduleKey?: string; toolId?: string } {
  if (/电商|直播|主播|平台|店铺|好评返现|跨境/.test(text)) return { moduleKey: 'ecommerce_tax' }
  if (/两账|两帐|内外账|AB账|公私|个人卡|私卡/.test(text)) return { moduleKey: 'dual_accounts' }
  if (/税负|降低税负|减少税负|降税|减税|节税|税筹|筹划|纳税筹划|税收筹划|合理避税|避税|缺票|税收洼地/.test(text)) return { moduleKey: 'tax_saving' }
  if (/股权|合伙|持股|代持|分红|控制权|激励/.test(text)) return { moduleKey: 'equity_design' }
  if (/稽查|检查|自查|税务局|约谈|补税|处罚|风险|合规/.test(text)) return { moduleKey: 'audit_response' }
  if (/合同|协议|模板|表格|员工手册|申请表/.test(text)) return { moduleKey: 'templates' }
  if (/商业模式|融资|估值|计划书|经营分析/.test(text)) return { moduleKey: 'business_model' }
  if (/政策|税率|优惠|申报|加计扣除|免征|减免|文号|公告|财税|增值税|企业所得税|个人所得税|印花税/.test(text)) return { toolId: 'policy-search' }
  return {}
}


function buildToolRagContext(matches: Array<{ title: string; moduleName?: string; sourcePath?: string; sectionTitle?: string; content: string; sourceExcerpt?: string }>): string {
  if (!matches.length) return ''
  return [
    '以下是从本地资料库检索到的参考资料，请结合用户信息优先引用原文摘录，不要编造资料中没有的确定结论：',
    ...matches.map((item, index) => [
      `【参考资料${index + 1}】${item.title}`,
      `模块：${item.moduleName || '未注明'}`,
      `来源：${item.sourcePath || '未注明'}`,
      `章节：${item.sectionTitle || '未注明'}`,
      `原文摘录：${item.sourceExcerpt || item.content}`,
    ].join('\n')),
  ].join('\n\n')
}

function buildRagReferences(matches: Array<{
  title: string
  docId?: string
  moduleName?: string
  sourcePath?: string
  sectionTitle?: string
  sourceExcerpt?: string
  content?: string
  cloudPath?: string
}>): ChatReference[] {
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

    if (!options.systemPrompt && !options.reportMeta && isGreetingOnly(displayText)) {
      this._streamGreetingResponse(userMsg, options)
      return
    }

    if (!options.systemPrompt && !options.reportMeta) {
      this._requestRagStream(userMsg, modelText, options, resolveChatRagOptions(modelText))
      return
    }

    if (options.reportMeta) {
      this._requestToolRagContext(userMsg, modelText, options)
      return
    }

    this._streamModelResponse(userMsg, options)
  },

  _streamGreetingResponse(userMsg: ChatMessage, options: SendMessageOptions) {
    let accumulated = ''
    const model = (wx.cloud as any).extend.AI.createModel('deepseek', { timeout: 300000 })
    model.streamText({
      data: {
        model: 'deepseek-v3.2',
        messages: [
          { role: 'system', content: GREETING_SYSTEM_PROMPT },
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
        ensureCurrentOpenid()
          .then((openid) => saveSession(openid, options.sessionTitle || buildSessionTitle(userMsg.content), finalMessages))
          .catch((err: unknown) => { console.error('[chat] persist greeting session failed:', err) })
      },
    }).catch((err: unknown) => {
      console.error('[chat] greeting streamText failed:', err)
      const nextMessages = [...this.data.messages]
      const lastIndex = nextMessages.length - 1
      if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
        nextMessages[lastIndex] = {
          ...nextMessages[lastIndex],
          content: '抱歉，请求失败，请稍后重试。',
          loading: false,
          loadingPhase: '',
        }
        this.setData({ messages: nextMessages, isStreaming: false })
      }
    })
  },

  _requestToolRagContext(userMsg: ChatMessage, modelText: string, options: SendMessageOptions) {
    this._updateLoadingPhase('检索中...')

    const toolId = options.reportMeta && options.reportMeta.type || ''
    searchPolicyChunks(modelText, { toolId, topK: 3 })
      .then((res) => {
        const ragContext = res && res.success ? buildToolRagContext(res.matches || []) : ''
        const references = res && res.success ? buildRagReferences(res.matches || []) : []
        this._updateLoadingPhase('思考中...')
        this._streamModelResponse(userMsg, options, ragContext, references)
      })
      .catch((err: unknown) => {
        console.warn('[chat] tool rag context failed, continue without context:', err)
        this._updateLoadingPhase('思考中...')
        this._streamModelResponse(userMsg, options)
      })
  },

  _streamModelResponse(userMsg: ChatMessage, options: SendMessageOptions, ragContext = '', references: ChatReference[] = []) {
    const apiMessages = this.data.messages
      .filter((item) => !item.loading)
      .concat(userMsg)
      .map((item) => ({ role: item.role, content: getMessageModelContent(item) }))
    if (ragContext && apiMessages.length) {
      const lastIndex = apiMessages.length - 1
      apiMessages[lastIndex] = {
        ...apiMessages[lastIndex],
        content: `${apiMessages[lastIndex].content}\n\n${ragContext}`,
      }
    }

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
            nextMessages[lastIndex] = {
              ...nextMessages[lastIndex],
              references,
            }
            this.setData({ messages: nextMessages })
          }
        }
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
          loadingPhase: '',
        }
        this.setData({ messages: nextMessages, isStreaming: false })
      }
    })
  },

  _requestRagStream(
    userMsg: ChatMessage,
    query: string,
    options: SendMessageOptions,
    ragOptions: { moduleKey?: string; toolId?: string } = {},
  ) {
    this._updateLoadingPhase('检索中...')

    searchPolicyChunks(query, { ...ragOptions, topK: 5 })
      .then((retrieval) => {
        const matches = retrieval && retrieval.success ? retrieval.matches || [] : []
        const maxScore = matches.length ? matches[0].score : 0
        const isLowConfidence = !matches.length || maxScore < RAG_LOW_CONFIDENCE_SCORE
        const references = buildRagReferences(matches)

        this._updateLoadingPhase('思考中...')

        let systemPrompt: string
        let userContent: string

        if (isLowConfidence) {
          systemPrompt = RAG_FALLBACK_SYSTEM_PROMPT
          userContent = query
        } else {
          systemPrompt = RAG_SYSTEM_PROMPT
          const ragContext = [
            `资料模块：${retrieval.moduleName || '未指定'}`,
            '',
            '可引用参考资料：',
            retrieval.answerContext,
          ].join('\n')
          userContent = `用户问题：\n${query}\n\n${ragContext}`
        }

        let accumulated = ''
        const model = (wx.cloud as any).extend.AI.createModel('deepseek', { timeout: 300000 })
        model.streamText({
          data: {
            model: 'deepseek-v3.2',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
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
            ensureCurrentOpenid()
              .then((openid) => saveSession(openid, options.sessionTitle || buildSessionTitle(userMsg.content), finalMessages))
              .catch((err: unknown) => { console.error('[chat] persist rag session failed:', err) })
          },
        }).catch((err: unknown) => {
          console.error('[chat] rag streamText failed:', err)
          const nextMessages = [...this.data.messages]
          const lastIndex = nextMessages.length - 1
          if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
            nextMessages[lastIndex] = { ...nextMessages[lastIndex], content: '抱歉，请求失败，请稍后重试。', loading: false, loadingPhase: '' }
            this.setData({ messages: nextMessages, isStreaming: false })
            this._scrollToBottom()
          }
        })
      })
      .catch((err: unknown) => {
        console.warn('[chat] ragRetrieval failed, fallback to general chat:', err)
        this._updateLoadingPhase('')
        this._streamModelResponse(userMsg, options)
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
