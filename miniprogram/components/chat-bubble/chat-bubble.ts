// components/chat-bubble/chat-bubble.ts

import { markdownToHtml } from '../../utils/markdown'
import { ROBOT_AVATAR_URL } from '../../utils/cloudAssets'

Component({
  properties: {
    role: {
      type: String,
      value: 'assistant',
      observer(role: string) {
        this.setData({ isUser: role === 'user' })
      },
    },
    content: {
      type: String,
      value: '',
      observer(newVal: string) {
        this._updateRendered(newVal)
      },
    },
    loading: {
      type: Boolean,
      value: false,
    },
    loadingPhase: {
      type: String,
      value: '',
    },
    avatarSrc: {
      type: String,
      value: '',
    },
    hideAvatar: {
      type: Boolean,
      value: false,
    },
    references: {
      type: Array,
      value: [],
    },
  },

  data: {
    renderedNodes: '',
    defaultAvatarSrc: ROBOT_AVATAR_URL,
    isUser: false,
  },

  lifetimes: {
    attached() {
      this.setData({ isUser: this.properties.role === 'user' })
      this._updateRendered(this.properties.content)
    },
  },

  methods: {
    onReferenceTap(e: WechatMiniprogram.TouchEvent) {
      const index = Number((e.currentTarget.dataset as { index: number }).index)
      const reference = (this.properties.references || [])[index]
      if (!reference) return
      this.triggerEvent('sourcetap', reference)
    },

    _updateRendered(text: string) {
      if (!text || this.properties.role === 'user') {
        this.setData({ renderedNodes: '' })
        return
      }
      this.setData({ renderedNodes: markdownToHtml(text) })
    },
  },
})
