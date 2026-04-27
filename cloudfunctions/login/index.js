// Cloud function: login
// Gets openid from WeChat context and upserts user in the 'users' collection.

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

  const db = cloud.database()
  const users = db.collection('users')
  let userDoc

  try {
    userDoc = await getUserDoc(users, openid)

    if (userDoc && userDoc._id) {
      await users.doc(userDoc._id).update({
        data: {
          lastLoginAt: db.serverDate(),
        },
      })
    } else {
      await users.add({
        data: {
          openid,
          memberLevel: 'free',
          createdAt: db.serverDate(),
          lastLoginAt: db.serverDate(),
        },
      })
      userDoc = await getUserDoc(users, openid)
      if (!userDoc) {
        userDoc = { openid, memberLevel: 'free' }
      }
    }
  } catch (writeError) {
    try {
      userDoc = await getUserDoc(users, openid)
      if (userDoc && userDoc._id) {
        await users.doc(userDoc._id).update({
          data: {
            lastLoginAt: db.serverDate(),
          },
        })
      } else {
        throw writeError
      }
    } catch (retryError) {
      console.error('[login] upsert users failed:', retryError)
      return {
        success: false,
        error: `用户初始化失败：${getErrorMessage(retryError)}`,
      }
    }
  }

  try {
    const freshUser = await getUserDoc(users, openid)
    return {
      success: true,
      openid,
      user: normalizeUser(openid, freshUser || userDoc),
    }
  } catch (e) {
    console.warn('[login] read user failed:', e)
    return {
      success: true,
      openid,
      user: normalizeUser(openid),
    }
  }
}
