import { toCanvas } from 'html-to-image'

const ACID = '#c8f45a'
const INK = '#f4f1e9'
const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

export const CARD_EXPORTS = {
  plain: {
    label: 'Clean card',
    buttonLabel: 'Download card',
    fileSuffix: 'card',
  },
  square: {
    label: 'Square post',
    buttonLabel: 'Download square',
    fileSuffix: 'square',
  },
  story: {
    label: 'Vertical story',
    buttonLabel: 'Download story',
    fileSuffix: 'story',
  },
}

let logoPromise

function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = '/rookster-mark.png'
    })
  }
  return logoPromise
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function drawTintedLogo(context, image, x, y, size, color = ACID) {
  const logoCanvas = document.createElement('canvas')
  logoCanvas.width = size
  logoCanvas.height = size
  const logoContext = logoCanvas.getContext('2d')
  logoContext.drawImage(image, 0, 0, size, size)
  logoContext.globalCompositeOperation = 'source-in'
  logoContext.fillStyle = color
  logoContext.fillRect(0, 0, size, size)
  context.drawImage(logoCanvas, x, y, size, size)
}

function drawBrandBackground(context, width, height) {
  context.fillStyle = '#020504'
  context.fillRect(0, 0, width, height)

  const glow = context.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0,
    width * 0.5,
    height * 0.42,
    Math.max(width, height) * 0.68,
  )
  glow.addColorStop(0, 'rgba(35, 72, 58, .92)')
  glow.addColorStop(0.48, 'rgba(13, 25, 22, .9)')
  glow.addColorStop(1, 'rgba(2, 5, 4, 1)')
  context.fillStyle = glow
  context.fillRect(0, 0, width, height)

}

function drawCardFitted(context, cardCanvas, bounds) {
  const scale = Math.min(bounds.width / cardCanvas.width, bounds.height / cardCanvas.height)
  const width = cardCanvas.width * scale
  const height = cardCanvas.height * scale
  const x = bounds.x + (bounds.width - width) / 2
  const y = bounds.y + (bounds.height - height) / 2
  context.drawImage(cardCanvas, x, y, width, height)
}

function drawAttribution(context, username, website, centerX, y, { darkPanel = false } = {}) {
  if (darkPanel) {
    roundedRect(context, centerX - 330, y - 45, 660, 90, 18)
    context.fillStyle = 'rgba(2, 8, 6, .88)'
    context.fill()
    context.strokeStyle = 'rgba(200, 244, 90, .22)'
    context.lineWidth = 2
    context.stroke()
  }

  context.textBaseline = 'middle'
  context.textAlign = 'right'
  context.font = '800 30px Manrope, sans-serif'
  context.lineWidth = 5
  context.strokeStyle = 'rgba(0, 0, 0, .72)'
  context.strokeText(`@${username}`, centerX - 22, y)
  context.fillStyle = INK
  context.fillText(`@${username}`, centerX - 22, y)

  context.fillStyle = ACID
  context.fillRect(centerX - 5, y - 18, 2, 36)

  context.textAlign = 'left'
  context.font = '600 25px "DM Mono", monospace'
  context.strokeText(website, centerX + 22, y)
  context.fillStyle = ACID
  context.fillText(website, centerX + 22, y)
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function cropTransparentPixels(sourceCanvas) {
  const sourceContext = sourceCanvas.getContext('2d')
  const { width, height } = sourceCanvas
  const pixels = sourceContext.getImageData(0, 0, width, height).data
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 3) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }

  if (right < left || bottom < top) return sourceCanvas
  const cropped = createCanvas(right - left + 1, bottom - top + 1)
  cropped.getContext('2d').drawImage(
    sourceCanvas,
    left,
    top,
    cropped.width,
    cropped.height,
    0,
    0,
    cropped.width,
    cropped.height,
  )
  return cropped
}

function renderPlain(cardCanvas, username) {
  const sidePadding = 64
  const footerHeight = 154
  const canvas = createCanvas(cardCanvas.width + sidePadding * 2, cardCanvas.height + footerHeight)
  const context = canvas.getContext('2d')
  context.drawImage(cardCanvas, sidePadding, 0)
  drawAttribution(context, username, 'rookster.app', canvas.width / 2, cardCanvas.height + 73, {
    darkPanel: true,
  })
  return canvas
}

function renderSquare(cardCanvas, username) {
  const canvas = createCanvas(1080, 1080)
  const context = canvas.getContext('2d')
  drawBrandBackground(context, canvas.width, canvas.height)
  drawCardFitted(context, cardCanvas, { x: 180, y: 62, width: 720, height: 850 })
  drawAttribution(context, username, 'rookster.app', canvas.width / 2, 970)
  return canvas
}

function renderStory(cardCanvas, username, logo) {
  const canvas = createCanvas(1080, 1920)
  const context = canvas.getContext('2d')
  drawBrandBackground(context, canvas.width, canvas.height)

  drawTintedLogo(context, logo, 88, 84, 96)
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillStyle = INK
  context.font = '800 54px Manrope, sans-serif'
  context.fillText('rookster', 210, 126)
  context.fillStyle = ACID
  context.font = '600 22px "DM Mono", monospace'
  context.fillText('CONTROL THE MIDFIELD', 210, 177)

  drawCardFitted(context, cardCanvas, { x: 130, y: 310, width: 820, height: 1150 })

  drawAttribution(context, username, 'rookster.app', canvas.width / 2, 1545)

  roundedRect(context, 116, 1662, 848, 112, 10)
  context.fillStyle = ACID
  context.fill()
  context.fillStyle = '#07100c'
  context.textAlign = 'center'
  context.font = '800 29px Manrope, sans-serif'
  context.fillText('Scout yourself  →  rookster.app', canvas.width / 2, 1718)

  return canvas
}

async function captureCard(element) {
  element.classList.add('is-exporting')
  try {
    await document.fonts?.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return await toCanvas(element, {
      cacheBust: true,
      pixelRatio: 2,
      imagePlaceholder: TRANSPARENT_PIXEL,
    })
  } finally {
    element.classList.remove('is-exporting')
  }
}

export async function renderCardExport(element, mode, username) {
  const safeMode = CARD_EXPORTS[mode] ? mode : 'plain'
  const cardCanvas = cropTransparentPixels(await captureCard(element))
  const safeUsername = username?.trim().replace(/^@+/, '') || 'player'

  if (safeMode === 'square') return renderSquare(cardCanvas, safeUsername)
  if (safeMode === 'story') return renderStory(cardCanvas, safeUsername, await loadLogo())
  return renderPlain(cardCanvas, safeUsername)
}
