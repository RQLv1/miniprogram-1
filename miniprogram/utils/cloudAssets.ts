const CLOUD_IMAGE_BASE =
  'cloud://cloud-accounting-d7e5ld7733202af.636c-cloud-accounting-d7e5ld7733202af-1394798298/images'

export const ROBOT_AVATAR_URL = `${CLOUD_IMAGE_BASE}/robot.png`

let robotAvatarTempUrl = ''
let robotAvatarUrlPromise: Promise<string> | undefined

export function resolveRobotAvatarUrl(): Promise<string> {
  if (!ROBOT_AVATAR_URL.startsWith('cloud://')) {
    return Promise.resolve(ROBOT_AVATAR_URL)
  }

  if (robotAvatarTempUrl) {
    return Promise.resolve(robotAvatarTempUrl)
  }

  if (!robotAvatarUrlPromise) {
    robotAvatarUrlPromise = wx.cloud.getTempFileURL({
      fileList: [ROBOT_AVATAR_URL],
    }).then((res) => {
      const file = res.fileList && res.fileList[0]
      const tempFileURL = file && file.tempFileURL
      if (tempFileURL) {
        robotAvatarTempUrl = tempFileURL
        return tempFileURL
      }
      return ROBOT_AVATAR_URL
    }).catch((err: unknown) => {
      console.warn('[cloudAssets] resolve robot avatar url failed:', err)
      robotAvatarUrlPromise = undefined
      return ROBOT_AVATAR_URL
    })
  }

  return robotAvatarUrlPromise
}

export function getExpertAvatarUrl(fileName: string): string {
  return `${CLOUD_IMAGE_BASE}/experts/${fileName}`
}
