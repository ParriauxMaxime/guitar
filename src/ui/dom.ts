export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.append(...children)
  return node
}

export function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className)
  node.type = 'button'
  node.setAttribute('aria-label', label)
  node.addEventListener('click', onClick)
  return node
}

export function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`
}
