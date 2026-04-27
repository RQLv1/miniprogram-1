/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo
    openid?: string
    phone?: string
    nickname?: string
    avatarUrl?: string
    memberLevel?: 'free' | 'vip' | 'svip'
    pendingChatTask?: import('../miniprogram/utils/constants').PendingChatTask
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback
}
