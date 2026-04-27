// Cloud function: bindPhone
// Binds a phone number to the current user's record in the 'users' collection.
// In modern WeChat versions (API ≥2.21.2), open-type="getPhoneNumber" returns the
// phone number already decrypted in e.detail.phoneNumber — no manual decryption needed.

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

  let { phoneNumber, code } = event

  if (!phoneNumber && code) {
    try {
      const result = await cloud.openapi.phonenumber.getPhoneNumber({ code })
      phoneNumber = result && result.phoneInfo && result.phoneInfo.phoneNumber || ''
    } catch (error) {
      console.error('[bindPhone] getPhoneNumber failed:', error)
    }
  }

  if (!phoneNumber) {
    return { success: false, error: 'phoneNumber is required' }
  }

  const db = cloud.database()
  const users = db.collection('users')
  let userDoc

  try {
    userDoc = await getUserDoc(users, openid)

    if (userDoc && userDoc._id) {
      await users.doc(userDoc._id).update({
        data: {
          phone: phoneNumber,
          phoneBindAt: db.serverDate(),
          lastLoginAt: db.serverDate(),
        },
      })
    } else {
      await users.add({
        data: {
          openid,
          phone: phoneNumber,
          memberLevel: 'free',
          createdAt: db.serverDate(),
          lastLoginAt: db.serverDate(),
          phoneBindAt: db.serverDate(),
        },
      })
    }
  } catch (writeError) {
    console.error('[bindPhone] upsert users failed:', writeError)
    return {
      success: false,
      error: `绑定手机号失败：${getErrorMessage(writeError)}`,
    }
  }

  const freshUser = await getUserDoc(users, openid)
  return {
    success: true,
    phone: phoneNumber,
    user: normalizeUser(openid, freshUser || { phone: phoneNumber }),
  }
}
