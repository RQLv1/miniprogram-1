Page({
  data: {
    url: '',
  },

  onLoad(query: Record<string, string>) {
    const url = decodeURIComponent(query.url || '')
    const title = decodeURIComponent(query.title || '')
    if (title) wx.setNavigationBarTitle({ title })
    this.setData({ url })
  },
})
