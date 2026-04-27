const DEFAULT_SHARE_TITLE = '智税宝顾问 - 企业财税智能助手'
const DEFAULT_SHARE_PATH = '/pages/chat/chat'

interface ShareMessageOptions {
  title?: string
  path?: string
}

export function enableShareMenu(): void {
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage'],
  })
}

export function createShareMessage(options: ShareMessageOptions = {}) {
  return {
    title: options.title || DEFAULT_SHARE_TITLE,
    path: options.path || DEFAULT_SHARE_PATH,
  }
}
