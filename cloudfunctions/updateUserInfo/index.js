// Cloud function: updateUserInfo
// Updates nickname and avatarUrl (cloud storage fileID) for the current user.

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
  let userDoc

  try {
    userDoc = await getUserDoc(users, openid)

    if (userDoc && userDoc._id) {
      await users.doc(userDoc._id).update({
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
  } catch (writeError) {
    console.error('[updateUserInfo] upsert users failed:', writeError)
    return {
      success: false,
      error: `保存用户资料失败：${getErrorMessage(writeError)}`,
    }
  }

  try {
    const freshUser = await getUserDoc(users, openid)
    return {
      success: true,
      user: normalizeUser(openid, freshUser || {
        nickname: trimmedNickname,
        avatarUrl: avatarFileID,
      }),
    }
  } catch (readError) {
    console.warn('[updateUserInfo] read user failed:', readError)
    return {
      success: true,
      user: normalizeUser(openid, {
        nickname: trimmedNickname,
        avatarUrl: avatarFileID,
      }),
    }
  }
}
