const LINE = '[data-test-id="SYNC_LYRICS_LINE"]'
const CONTENT = '[data-test-id="SYNC_LYRICS_CONTENT"]'
const OWN = '[data-ps-lyrics-translation-slot]'
const MARKER = 'data-ps-lyrics-translation'
const ACTIVE = 'data-ps-lyrics-translation-active'

export type LyricsLine = { element: HTMLElement; text: string }

export function originalText(element: HTMLElement): string | null {
    return element.querySelector<HTMLElement>(':scope > span:not([data-ps-lyrics-translation-slot])')?.textContent?.trim() ?? null
}

export class LyricsDom {
    private readonly touched = new Set<HTMLElement>()
    private readonly states = new WeakMap<HTMLElement, { text: string; skipped: boolean }>()
    private readonly discovery: MutationObserver
    private readonly content: MutationObserver
    private containers: Element[] = []

    constructor(private readonly onChange: () => void) {
        this.content = new MutationObserver(records => {
            if (records.some(record => !this.isOwnMutation(record))) onChange()
        })
        this.discovery = new MutationObserver(records => {
            if (
                !records.some(record =>
                    Array.from(record.addedNodes)
                        .concat(Array.from(record.removedNodes))
                        .some(
                            node =>
                                node instanceof Element &&
                                !node.matches(OWN) &&
                                (node.matches(`${CONTENT}, ${LINE}`) || node.querySelector(`${CONTENT}, ${LINE}`)),
                        ),
                )
            )
                return
            this.observeContainers()
            onChange()
        })
    }

    start(): void {
        document.documentElement.setAttribute(ACTIVE, '')
        this.observeContainers()
        this.discovery.observe(document.body, { childList: true, subtree: true })
    }

    private isOwnMutation(record: MutationRecord): boolean {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        if (target?.closest(OWN)) return true
        const nodes = [...record.addedNodes, ...record.removedNodes]
        if (record.removedNodes.length && target?.hasAttribute(MARKER)) return false
        return nodes.length > 0 && nodes.every(node => node instanceof Element && node.matches(OWN))
    }

    private observeContainers(): void {
        const containers = Array.from(document.querySelectorAll(CONTENT))
        document.querySelectorAll(LINE).forEach(line => {
            if (!containers.some(container => container.contains(line)) && line.parentElement) containers.push(line.parentElement)
        })
        if (containers.length === this.containers.length && containers.every((container, index) => container === this.containers[index])) return
        this.content.disconnect()
        this.containers = containers
        for (const container of containers) this.content.observe(container, { childList: true, subtree: true, characterData: true })
    }

    read(): LyricsLine[] {
        const lines = Array.from(document.querySelectorAll<HTMLElement>(LINE)).flatMap(element => {
            const text = originalText(element)
            return text === null ? [] : [{ element, text }]
        })
        const current = new Set(lines.map(line => line.element))
        for (const element of this.touched) {
            if (!current.has(element)) {
                this.clear(element)
                this.touched.delete(element)
            }
        }
        return lines
    }

    show(line: LyricsLine, translation: string | null, loading = false): void {
        const { element, text } = line
        if (!element.isConnected || originalText(element) !== text) return
        if (!text || (!loading && translation === null)) {
            this.clear(element)
            this.states.set(element, { text, skipped: true })
            return
        }
        this.states.set(element, { text, skipped: false })
        this.touched.add(element)
        element.setAttribute(MARKER, loading ? 'loading' : 'ready')
        let slot = element.querySelector<HTMLElement>(`:scope > ${OWN}`)
        if (!slot) {
            slot = document.createElement('span')
            slot.setAttribute('data-ps-lyrics-translation-slot', '')
            slot.className = 'ps-lyrics-tr'
            const icon = document.createElement('span')
            icon.className = 'ps-lyrics-tr_icon'
            icon.setAttribute('aria-hidden', 'true')
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            svg.setAttribute('viewBox', '0 0 24 24')
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            path.setAttribute(
                'd',
                'M12.65 15.67a1 1 0 0 0-.23-1.05l-2.09-2.06.03-.03A17.2 17.2 0 0 0 14.07 6H16a1 1 0 0 0 0-2h-6V3a1 1 0 0 0-2 0v1H2a1 1 0 0 0 0 2h10.17A15.5 15.5 0 0 1 9 11.35 14.2 14.2 0 0 1 6.94 8.47a.9.9 0 0 0-1.57.88 16.7 16.7 0 0 0 2.3 3.21L3.3 16.87a1 1 0 0 0 1.42 1.42L9 14l2.02 2.02c.51.51 1.38.32 1.63-.35ZM17.5 10c-.6 0-1.14.37-1.35.94l-3.67 9.8a.94.94 0 0 0 1.76.65l.89-2.39h4.74l.9 2.39a.94.94 0 0 0 1.76-.65l-3.67-9.8A1.45 1.45 0 0 0 17.5 10Zm-1.62 7 1.62-4.33L19.12 17h-3.24Z',
            )
            svg.append(path)
            icon.append(svg)
            const label = document.createElement('span')
            label.className = 'ps-lyrics-tr_text'
            slot.append(icon, label)
            element.append(slot)
        }
        slot.classList.toggle('ps-lyrics-tr_loading', loading)
        slot.querySelector<HTMLElement>('.ps-lyrics-tr_text')!.textContent = loading ? '⋯' : translation
    }

    private clear(element: HTMLElement): void {
        this.states.delete(element)
        element.removeAttribute(MARKER)
        element.querySelector(`:scope > ${OWN}`)?.remove()
    }

    hasState(line: LyricsLine): boolean {
        if (!line.text) return true
        const state = this.states.get(line.element)
        return (
            state?.text === line.text &&
            (state.skipped || (line.element.hasAttribute(MARKER) && Boolean(line.element.querySelector(`:scope > ${OWN}`))))
        )
    }

    clearAll(): void {
        for (const element of this.touched) this.clear(element)
        this.touched.clear()
    }

    stop(): void {
        this.discovery.disconnect()
        this.content.disconnect()
        this.containers = []
        this.clearAll()
        document.documentElement.removeAttribute(ACTIVE)
    }
}
