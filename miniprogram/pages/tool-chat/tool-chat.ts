import { PendingChatTask, TOOL_ITEM_MAP, ToolField, ToolItem, ToolPolicy, ToolSection } from '../../utils/constants'
import { TOOL_INPUT_PROMPT_PREFIX, TOOL_PROMPT_MAP } from '../../utils/promptRegistry'
import { POLICY_DATA } from '../../data/policies'

type ToggleOption = {
  label: string
  value: string
  active?: boolean
}

function cloneSections(sections: ToolSection[] = []): ToolSection[] {
  return JSON.parse(JSON.stringify(sections)).map((section: ToolSection) => ({
    ...section,
    fields: (section.fields || []).map((field) => ({
      ...field,
      __sectionId: section.id,
      currentIndex: 0,
      options: (field.options || []).map((option) => ({
        ...option,
        __sectionId: section.id,
        __fieldId: field.id,
      })),
    })),
  }))
}

function collectFieldValue(field: ToolField & { options?: Array<{ label: string; value: string; active?: boolean }> }) {
  if (field.type === 'tag-multi' || field.type === 'check-multi') {
    return (field.options || [])
      .filter((option) => option.active)
      .map((option) => option.label)
      .join('、')
  }
  return (field.value || '').trim()
}

function buildPendingChatTask(tool: ToolItem, prompt: string, questionText: string): PendingChatTask {
  return {
    toolId: tool.id,
    displayText: `请根据以下信息进行${tool.name}：\n${questionText}`,
    promptText: prompt,
    systemPrompt: TOOL_PROMPT_MAP[tool.id as keyof typeof TOOL_PROMPT_MAP] || '',
    reportTitle: tool.reportTitle,
    questionText,
  }
}

Page({
  data: {
    tool: null as ToolItem | null,
    sections: [] as ToolSection[],
    isPolicyMode: false,
    isSubmitting: false,
    policyKeyword: '',
    showPolicyResults: false,
    selectedCategory: '',
    policyCategories: [{ label: '全部', value: '' }] as Array<{ label: string; value: string }>,
    filteredPolicies: [] as ToolPolicy[],
    activePolicy: null as ToolPolicy | null,
    policyCountText: '',
  },

  onLoad(query: Record<string, string>) {
    const toolId = query.toolId || 'tax-detection'
    const tool = TOOL_ITEM_MAP[toolId] || TOOL_ITEM_MAP['tax-detection']
    const categories = [''].concat(
      Array.from(new Set(POLICY_DATA.map((item) => item.category))),
    )
    this.setData({
      tool,
      sections: cloneSections(tool.sections),
      isPolicyMode: tool.mode === 'policy',
      policyCategories: categories.map((value) => ({ label: value || '全部', value })),
    })
  },

  onShow() {
    if (this.data.isSubmitting) {
      this.setData({ isSubmitting: false })
    }
  },

  onUnload() {},

  onFieldInput(e: WechatMiniprogram.Input) {
    const dataset = e.currentTarget.dataset as { sectionId: string; fieldId: string }
    this._updateField(dataset.sectionId, dataset.fieldId, (field) => {
      field.value = e.detail.value
      return field
    })
  },

  onFieldSelectChange(e: WechatMiniprogram.CustomEvent) {
    const dataset = e.currentTarget.dataset as { sectionId: string; fieldId: string }
    const selectedIndex = Number(e.detail.value)
    this._updateField(dataset.sectionId, dataset.fieldId, (field) => {
      const options = field.options || []
      const selected = options[selectedIndex]
      field.currentIndex = selectedIndex
      field.value = selected ? selected.label : ''
      return field
    })
  },

  onToggleOption(e: WechatMiniprogram.TouchEvent) {
    const dataset = e.currentTarget.dataset as { sectionId: string; fieldId: string; optionValue: string }
    this._updateField(dataset.sectionId, dataset.fieldId, (field) => {
      field.options = (field.options || []).map((option: ToggleOption) => {
        if (option.value !== dataset.optionValue) return option
        return { ...option, active: !option.active }
      })
      return field
    })
  },

  _updateField(sectionId: string, fieldId: string, updater: (field: any) => any) {
    const sections = this.data.sections.map((section) => {
      if (section.id !== sectionId) return section
      return {
        ...section,
        fields: (section.fields || []).map((field: any) => {
          if (field.id !== fieldId) return field
          return updater({ ...field })
        }),
      }
    })
    this.setData({ sections })
  },

  onSubmit() {
    if (!this.data.tool || this.data.isSubmitting) return
    const payload = this._buildPrompt()
    if (!payload) return

    const tool = this.data.tool!
    if (tool.mode === 'policy') return

    const app = getApp<IAppOption>()
    app.globalData.pendingChatTask = buildPendingChatTask(tool, payload.prompt, payload.questionText)

    this.setData({ isSubmitting: true })
    wx.switchTab({
      url: '/pages/chat/chat',
      fail: (err) => {
        console.error('[tool-chat] switchTab failed:', err)
        app.globalData.pendingChatTask = undefined
        this.setData({ isSubmitting: false })
        wx.showToast({
          title: '跳转失败，请稍后重试',
          icon: 'none',
        })
      },
    })
  },

  _buildPrompt() {
    const tool = this.data.tool
    if (!tool) return null

    const lines: string[] = []
    const missingLabels: string[] = []

    this.data.sections.forEach((section) => {
      ;(section.fields || []).forEach((field: any) => {
        const value = collectFieldValue(field)
        if (field.required && !value) {
          missingLabels.push(field.label)
        }
        if (value) {
          lines.push(`${field.label}：${value}`)
        }
      })
    })

    if (missingLabels.length) {
      wx.showToast({
        title: `请先填写：${missingLabels[0]}`,
        icon: 'none',
      })
      return null
    }

    if (!lines.length) {
      wx.showToast({ title: '请先填写信息', icon: 'none' })
      return null
    }

    return {
      prompt: `${TOOL_INPUT_PROMPT_PREFIX}\n${lines.join('\n')}`,
      questionText: lines.join('\n'),
    }
  },

  onPolicyKeywordChange(e: WechatMiniprogram.Input) {
    this.setData({ policyKeyword: e.detail.value })
  },

  onPolicySearch() {
    this._applyPolicySearch(this.data.policyKeyword.trim(), this.data.selectedCategory)
  },

  onPolicyHotTagTap(e: WechatMiniprogram.TouchEvent) {
    const tag = (e.currentTarget.dataset as { tag: string }).tag
    this.setData({ policyKeyword: tag })
    this._applyPolicySearch(tag, this.data.selectedCategory)
  },

  onPolicyCategoryTap(e: WechatMiniprogram.TouchEvent) {
    const value = (e.currentTarget.dataset as { value: string }).value
    this.setData({ selectedCategory: value })
    this._applyPolicySearch(this.data.policyKeyword.trim(), value)
  },

  _applyPolicySearch(keyword: string, category: string) {
    const normalized = keyword.trim().toLowerCase()
    const list = POLICY_DATA.filter((item) => {
      const matchesCategory = !category || item.category === category
      const haystack = `${item.title} ${item.docNo} ${item.summary} ${item.tags.join(' ')}`
        .toLowerCase()
      const matchesKeyword = !normalized || haystack.includes(normalized)
      return matchesCategory && matchesKeyword
    })

    this.setData({
      filteredPolicies: list,
      showPolicyResults: true,
      policyCountText: `共找到 ${list.length} 条相关政策`,
    })
  },

  onPolicyOpen(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id: string }).id
    const activePolicy = this.data.filteredPolicies.find((item) => item.id === id) || null
    this.setData({ activePolicy })
  },

  onPolicySheetClose() {
    this.setData({ activePolicy: null })
  },

  noop() {},
})
