// utils/auth.ts

type MemberLevel = 'free' | 'vip' | 'svip'

export interface CloudUser {
  openid: string
  phone?: string
  nickname?: string
  avatarUrl?: string
  memberLevel?: MemberLevel
}

interface CloudUserResult {
  success: boolean
  openid?: string
  phone?: string
  user?: CloudUser
  error?: string
}

function syncGlobalUser(user: CloudUser): void {
  const app = getApp<IAppOption>()
  app.globalData.openid = user.openid
  app.globalData.phone = user.phone || undefined
  app.globalData.nickname = user.nickname || undefined
  app.globalData.avatarUrl = user.avatarUrl || undefined
  app.globalData.memberLevel = user.memberLevel || 'free'
}

function assertCloudUserResult(result: CloudUserResult, fallbackOpenid?: string): CloudUser {
  if (!result || result.success === false) {
    throw new Error((result && result.error) || 'cloud user request failed')
  }

  const openid = (result.user && result.user.openid) || result.openid || fallbackOpenid
  if (!openid) {
    throw new Error('cloud user response missing openid')
  }

  return {
    openid,
    phone: (result.user && result.user.phone) || result.phone,
    nickname: result.user && result.user.nickname,
    avatarUrl: result.user && result.user.avatarUrl,
    memberLevel: (result.user && result.user.memberLevel) || 'free',
  }
}

export function syncLogin(): Promise<CloudUser> {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'login',
      success: (res) => {
        try {
          const user = assertCloudUserResult(res.result as CloudUserResult)
          syncGlobalUser(user)
          resolve(user)
        } catch (err) {
          reject(err)
        }
      },
      fail: (err) => {
        reject(new Error(JSON.stringify(err)))
      },
    })
  })
}

export function getOpenid(): Promise<string> {
  return syncLogin().then((user) => user.openid)
}

export function getCurrentUser(): IAppOption['globalData'] {
  return getApp<IAppOption>().globalData
}

export async function ensureCurrentOpenid(): Promise<string> {
  const app = getApp<IAppOption>()
  if (app.globalData.openid) return app.globalData.openid
  const user = await syncLogin()
  return user.openid
}

export function isLoggedIn(): boolean {
  const { openid } = getApp<IAppOption>().globalData
  return typeof openid === 'string' && openid.length > 0
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

export function bindPhone(payload: {
  code?: string
  phoneNumber?: string
}): Promise<{ success: boolean; phone?: string; user?: CloudUser; error?: string }> {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bindPhone',
      data: payload,
      success: (res) => {
        const result = res.result as CloudUserResult
        if (result && result.success && result.user) {
          syncGlobalUser(assertCloudUserResult(result))
        }
        resolve(result as { success: boolean; phone?: string; user?: CloudUser; error?: string })
      },
      fail: (err) => {
        reject(new Error(JSON.stringify(err)))
      },
    })
  })
}

export function updateUserInfo(payload: {
  nickname: string
  avatarFileID: string
}): Promise<{ success: boolean; user?: CloudUser; error?: string }> {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'saveUserProfile',
      data: payload,
      success: (res) => {
        const result = res.result as CloudUserResult
        if (result && result.success && result.user) {
          syncGlobalUser(assertCloudUserResult(result))
        }
        resolve(result as { success: boolean; user?: CloudUser; error?: string })
      },
      fail: (err) => {
        reject(new Error(JSON.stringify(err)))
      },
    })
  })
}
