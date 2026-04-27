// app.ts
import { syncLogin } from './utils/auth'

App<IAppOption>({
  globalData: {
    userInfo: undefined,
    openid: undefined,
    phone: undefined,
    nickname: undefined,
    avatarUrl: undefined,
    memberLevel: 'free',
    pendingChatTask: undefined,
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud-accounting-d7e5ld7733202af',
      traceUser: true,
    })

    syncLogin().then((user) => {
      if (user.nickname) {
        wx.setStorageSync('onboarded', true)
      }
    }).catch((err) => {
      console.error('[cloud] login failed:', err)
    })
  },
})
