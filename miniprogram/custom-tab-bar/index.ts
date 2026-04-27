const TABS = [
  { text: '搜索问答', icon: '', pagePath: '/pages/chat/chat' },
  { text: '工具库',   icon: '', pagePath: '/pages/tools/tools' },
  { text: '公司主体', icon: '', pagePath: '/pages/company/company' },
  { text: '个人中心', icon: '', pagePath: '/pages/profile/profile' },
]

Component({
  data: {
    tabs: TABS,
    selected: 0,
  },

  attached() {
    wx.loadFontFace({
      family: 'remixicon',
      source: 'url("https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.woff2")',
      global: true,
      success: () => {
        this.setData({ tabs: TABS })
      },
      fail: (err) => {
        console.warn('[tabBar] remixicon load failed', err)
      },
    })
  },

  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const index = (e.currentTarget.dataset as { index: number }).index
      const { pagePath } = TABS[index]
      this.setData({ selected: index })
      wx.switchTab({ url: pagePath })
    },
  },
})
