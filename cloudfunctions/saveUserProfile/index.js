// Cloud function: saveUserProfile
// Saves nickname and avatarUrl for the current mini program user.

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function normalizeUser(openid, data = {}) {
  return {
    openid,
    phone: data.phone || '',
    nickname: data.nickname || '',
    avatarUrl: data.avatarUrl || '',
    memberLevel: data.memberLevel || 'free',
  }
}

function getErrorMessage(error) {
  return error && (error.message || error.errMsg || error.toString && error.toString()) || 'unknown error'
}

async function getUserDoc(users, openid) {
  const result = await users.where({ openid }).limit(1).get()
  return result.data && result.data[0]
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: 'OPENID is required' }
  }

  const { nickname, avatarFileID } = event

  if (!nickname || typeof nickname !== 'string' || nickname.trim() === '') {
    return { success: false, error: 'nickname is required' }
  }

  if (!avatarFileID || typeof avatarFileID !== 'string') {
    return { success: false, error: 'avatarFileID is required' }
  }

  const db = cloud.database()
  const users = db.collection('users')
  const trimmedNickname = nickname.trim()

  try {
    const existing = await getUserDoc(users, openid)
    if (existing && existing._id) {
      await users.doc(existing._id).update({
        data: {
          nickname: trimmedNickname,
          avatarUrl: avatarFileID,
          lastLoginAt: db.serverDate(),
        },
      })
    } else {
      await users.add({
        data: {
          openid,
          nickname: trimmedNickname,
          avatarUrl: avatarFileID,
          memberLevel: 'free',
          createdAt: db.serverDate(),
          lastLoginAt: db.serverDate(),
        },
      })
    }

    const freshUser = await getUserDoc(users, openid)
    return {
      success: true,
      user: normalizeUser(openid, freshUser || {
        nickname: trimmedNickname,
        avatarUrl: avatarFileID,
      }),
    }
  } catch (error) {
    console.error('[saveUserProfile] save failed:', error)
    return {
      success: false,
      error: `保存用户资料失败：${getErrorMessage(error)}`,
    }
  }
}
