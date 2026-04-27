const CLOUD_IMAGE_BASE =
  'cloud://cloud-accounting-d7e5ld7733202af.636c-cloud-accounting-d7e5ld7733202af-1394798298/images'

export const ROBOT_AVATAR_URL = `${CLOUD_IMAGE_BASE}/robot.png`

export function getExpertAvatarUrl(fileName: string): string {
  return `${CLOUD_IMAGE_BASE}/experts/${fileName}`
}
