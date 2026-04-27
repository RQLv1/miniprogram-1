import { createShareMessage, enableShareMenu } from '../../utils/share'

interface ExternalTool {
  name: string
  desc: string
  icon: string
  url: string
  disabled?: boolean
}

const FEATURED_TOOLS: ExternalTool[] = [
  { name: '腾讯元宝', desc: 'AI 智能助手', icon: '/assets/icons/robot.svg', url: 'https://yuanbao.tencent.com/' },
  { name: '合同示范文本库', desc: '标准合同模板', icon: '/assets/icons/contract.svg', url: 'https://cont.12315.cn/' },
  { name: '国家税务总局政策法规库', desc: '市场监督管理总局', icon: '/assets/icons/government.svg', url: 'https://www.chinatax.gov.cn/chinatax/n810341/n810755/index.html' },
  { name: '12366纳税平台', desc: '税务咨询热线', icon: '/assets/icons/phone.svg', url: 'https://12366.chinatax.gov.cn/' },
]

const SERVICE_TOOLS: ExternalTool[] = [
  { name: '豆包问答', desc: 'AI 智能问答', icon: '/assets/icons/sparkle.svg', url: 'https://www.doubao.com/' },
  { name: '财报分析工具', desc: '财务报表分析', icon: '/assets/icons/data-analysis.svg', url: '' },
  { name: '文档工具', desc: '文档编辑处理', icon: '/assets/icons/file-edit.svg', url: '' },
  { name: 'PPT生产工具', desc: '演示文稿制作', icon: '/assets/icons/slideshow.svg', url: '' },
  { name: '思维导图工具', desc: '思维可视化', icon: '/assets/icons/mindmap.svg', url: '' },
  { name: '即将上线', desc: '', icon: '/assets/icons/coming-soon.svg', url: '', disabled: true },
]

Page({
  data: {
    featuredTools: FEATURED_TOOLS,
    serviceTools: SERVICE_TOOLS,
  },

  onLoad() {
    enableShareMenu()
  },

  onShow() {
    const tabBar = this.getTabBar()
    if (tabBar) {
      tabBar.setData({ selected: 1 })
    }
  },

  onToolTap(e: WechatMiniprogram.TouchEvent) {
    const { url, disabled } = e.currentTarget.dataset as { url: string; disabled: boolean }
    if (disabled || !url) {
      if (!disabled) wx.showToast({ title: '功能开发中', icon: 'none' })
      return
    }
    const wxWithOpenUrl = wx as typeof wx & { openUrl?: (options: { url: string }) => void }
    if (wxWithOpenUrl.openUrl) {
      wxWithOpenUrl.openUrl({ url })
    } else {
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none', duration: 2500 }),
      })
    }
  },

  onShareAppMessage() {
    return createShareMessage()
  },
})
