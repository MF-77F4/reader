import type { App, DirectiveBinding } from 'vue'

interface TooltipBinding {
  text: string
  placement?: 'top' | 'bottom'
}

const TOOLTIP_DELAY = 520
let tooltipElement: HTMLDivElement | null = null
let tooltipTimer: ReturnType<typeof setTimeout> | null = null
let activeTarget: HTMLElement | null = null

const ensureTooltipElement = (): HTMLDivElement => {
  if (tooltipElement) return tooltipElement

  tooltipElement = document.createElement('div')
  tooltipElement.className = 'app-tooltip'
  tooltipElement.setAttribute('role', 'tooltip')
  document.body.appendChild(tooltipElement)
  return tooltipElement
}

const hideTooltip = (): void => {
  if (tooltipTimer) clearTimeout(tooltipTimer)
  tooltipTimer = null
  activeTarget = null
  tooltipElement?.classList.remove('is-visible')
}

const positionTooltip = (
  tooltip: HTMLDivElement,
  target: HTMLElement,
  placement: TooltipBinding['placement']
): void => {
  const targetRect = target.getBoundingClientRect()
  const tooltipRect = tooltip.getBoundingClientRect()
  const horizontalPadding = 10
  const verticalGap = 8

  const left = Math.min(
    Math.max(targetRect.left + targetRect.width / 2 - tooltipRect.width / 2, horizontalPadding),
    window.innerWidth - tooltipRect.width - horizontalPadding
  )

  const top =
    placement === 'bottom' || targetRect.top < tooltipRect.height + verticalGap + 10
      ? targetRect.bottom + verticalGap
      : targetRect.top - tooltipRect.height - verticalGap

  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

const showTooltip = (
  target: HTMLElement,
  text: string,
  placement?: TooltipBinding['placement']
): void => {
  if (!text.trim()) return

  if (tooltipTimer) clearTimeout(tooltipTimer)
  activeTarget = target
  tooltipTimer = setTimeout(() => {
    if (activeTarget !== target || !target.isConnected) return

    const tooltip = ensureTooltipElement()
    tooltip.textContent = text
    tooltip.classList.add('is-visible')
    positionTooltip(tooltip, target, placement)
  }, TOOLTIP_DELAY)
}

const normalizeBinding = (binding: DirectiveBinding<string | TooltipBinding>): TooltipBinding => {
  return typeof binding.value === 'string' ? { text: binding.value } : binding.value
}

const bindTooltip = (target: HTMLElement, binding: TooltipBinding): void => {
  target.dataset.tooltipText = binding.text
  target.dataset.tooltipPlacement = binding.placement || ''
  target.removeAttribute('title')

  target.onmouseenter = () => {
    showTooltip(
      target,
      target.dataset.tooltipText || '',
      target.dataset.tooltipPlacement as TooltipBinding['placement']
    )
  }
  target.onmouseleave = hideTooltip
  target.onmousedown = hideTooltip
  target.onfocus = () => {
    showTooltip(
      target,
      target.dataset.tooltipText || '',
      target.dataset.tooltipPlacement as TooltipBinding['placement']
    )
  }
  target.onblur = hideTooltip
}

const installTooltipStyles = (): void => {
  const style = document.createElement('style')
  style.textContent = `
    .app-tooltip {
      position: fixed;
      z-index: 10000;
      max-width: min(260px, calc(100vw - 20px));
      padding: 7px 10px;
      color: rgba(255, 255, 255, 0.94);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 9px;
      background: rgba(43, 43, 48, 0.93);
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.16);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.35;
      pointer-events: none;
      opacity: 0;
      transform: translateY(3px) scale(0.98);
      transition: opacity 0.14s ease, transform 0.14s ease;
    }

    .app-tooltip.is-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  `
  document.head.appendChild(style)
}

export const installAppTooltip = (app: App): void => {
  installTooltipStyles()
  app.directive('tooltip', {
    mounted(target: HTMLElement, binding: DirectiveBinding<string | TooltipBinding>) {
      bindTooltip(target, normalizeBinding(binding))
    },
    updated(target: HTMLElement, binding: DirectiveBinding<string | TooltipBinding>) {
      bindTooltip(target, normalizeBinding(binding))
    },
    unmounted(target: HTMLElement) {
      if (activeTarget === target) hideTooltip()
    }
  })
}
