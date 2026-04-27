import { syncLogin, updateUserInfo } from '../../utils/auth'

const app = getApp<IAppOption>()
const LOGIN_BACKGROUND_URL = 'cloud://cloud-accounting-d7e5ld7733202af.636c-cloud-accounting-d7e5ld7733202af-1394798298/images/login.png'

function downloadFile(url: string): Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({ url, success: resolve, fail: reject })
  })
}

function compressImage(src: string): Promise<string> {
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: 60,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => {
        console.warn('[login] compress image failed, fallback to original:', err)
        resolve(src)
      },
    })
  })
}

function uploadAvatar(filePath: string): Promise<string> {
  const extensionMatch = filePath.match(/\.(png|jpg|jpeg|webp)$/i)
  const extension = extensionMatch ? extensionMatch[1] : 'jpg'
  const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`
  return wx.cloud.uploadFile({ cloudPath, filePath }).then((res) => res.fileID)
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch (_error) {
    return 'unknown error'
  }
}

Page({
  data: {
    loginBg: LOGIN_BACKGROUND_URL,
    tempAvatarPath: '',
    nickname: '',
    loading: false,
    agreed: false,
    isReturning: false,
    existingNickname: '',
    existingAvatar: '',
  },

  onLoad() {
    const app = getApp<IAppOption>()

    // 老用户快速路径：storage 有标记且 globalData 已有 nickname
    if (wx.getStorageSync('onboarded') && app.globalData.nickname) {
      this.setData({
        isReturning: true,
        existingNickname: app.globalData.nickname,
        existingAvatar: app.globalData.avatarUrl || '',
      })
      return
    }

    // 等 app.ts 云函数返回后再判断（最多等 3s）
    let waited = 0
    const timer = setInterval(() => {
      waited += 200
      const app = getApp<IAppOption>()
      if (app.globalData.nickname) {
        clearInterval(timer)
        wx.setStorageSync('onboarded', true)
        this.setData({
          isReturning: true,
          existingNickname: app.globalData.nickname,
          existingAvatar: app.globalData.avatarUrl || '',
        })
      } else if (waited >= 3000) {
        clearInterval(timer)
        // 超时仍无 nickname，停在新用户注册面板
      }
    }, 200)
  },

  onEnterApp() {
    wx.reLaunch({ url: '/pages/chat/chat' })
  },

  onChooseAvatar(e: { detail: { avatarUrl: string } }) {
    this.setData({ tempAvatarPath: e.detail.avatarUrl })
  },

  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value })
  },

  onAgreementToggle() {
    this.setData({ agreed: !this.data.agreed })
  },

  async onConfirmInfo() {
    const { tempAvatarPath, nickname, agreed } = this.data
    if (!agreed) {
      wx.showToast({ title: '请先阅读并同意相关条款', icon: 'none' })
      return
    }
    if (!tempAvatarPath) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }
    if (!nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      try {
        await syncLogin()
      } catch (err) {
        console.error('[login] syncLogin failed:', err)
        wx.showToast({ title: '登录初始化失败，请稍后重试', icon: 'none' })
        return
      }

      let localPath = tempAvatarPath
      if (tempAvatarPath.startsWith('https://')) {
        const dlRes = await downloadFile(tempAvatarPath)
        if (dlRes.statusCode !== 200) {
          wx.showToast({ title: '头像获取失败，请重试', icon: 'none' })
          return
        }
        localPath = dlRes.tempFilePath
      }

      localPath = await compressImage(localPath)

      let avatarFileID = ''
      try {
        avatarFileID = await uploadAvatar(localPath)
      } catch (err) {
        console.error('[login] upload avatar failed:', err)
        wx.showToast({ title: '头像上传失败，请重试', icon: 'none' })
        return
      }

      const result = await updateUserInfo({ nickname: nickname.trim(), avatarFileID })
      if (!result.success) {
        console.error('[login] updateUserInfo failed:', result.error)
        wx.showToast({ title: result.error || '保存失败，请重试', icon: 'none' })
        return
      }

      app.globalData.nickname = result.user && result.user.nickname ? result.user.nickname : nickname.trim()
      app.globalData.avatarUrl = result.user && result.user.avatarUrl ? result.user.avatarUrl : avatarFileID

      wx.setStorageSync('onboarded', true)
      wx.reLaunch({ url: '/pages/chat/chat' })
    } catch (err) {
      console.error('[login] onConfirmInfo error:', err)
      wx.showToast({ title: getErrorMessage(err) || '操作失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
