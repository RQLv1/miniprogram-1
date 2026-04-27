import { EXPERTS } from '../../utils/expertData'
import { createShareMessage, enableShareMenu } from '../../utils/share'

Page({
  data: {
    experts: EXPERTS,
  },

  onLoad() {
    enableShareMenu()
  },

  onShareAppMessage() {
    return createShareMessage()
  },
})
