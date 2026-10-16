import type { AddonNet } from '@pulsesync/addon-sdk'

type Translation = { text: string; source: string | null }
type LineTranslation = string | null

class TranslationHttpError extends Error {
    constructor(readonly status: number) {
        super(`Google Translate: HTTP ${status}`)
    }
}

function parseResponse(data: unknown): Translation {
    if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Invalid Google Translate response')
    const segments = data[0] as unknown[]
    if (!segments.length || segments.some(part => !Array.isArray(part) || typeof part[0] !== 'string')) {
        throw new Error('Invalid Google Translate segments')
    }
    const text = segments.map(part => (part as string[])[0]).join('')
    if (!text.trim()) throw new Error('Empty Google Translate response')
    const detected = data[2]
    const source =
        typeof detected === 'string'
            ? detected
            : Array.isArray(detected) && typeof detected[0] === 'string'
              ? detected[0]
              : Array.isArray(detected) && Array.isArray(detected[0]) && typeof detected[0][0] === 'string'
                ? detected[0][0]
                : typeof data[8] === 'string'
                  ? data[8]
                  : null
    return { text, source }
}

function sameLanguage(source: string | null, target: string): boolean {
    const from = source?.toLowerCase().replaceAll('_', '-') ?? ''
    const to = target.toLowerCase()
    if (to.startsWith('zh')) return from === to
    return Boolean(from && from.split('-')[0] === to.split('-')[0])
}

function pause(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted()
        const onAbort = () => {
            clearTimeout(timer)
            reject(signal.reason)
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort)
            resolve()
        }, 80)
        signal.addEventListener('abort', onAbort, { once: true })
    })
}

function splitLongLine(text: string): string[] {
    const chunks: string[] = []
    let chunk = ''
    let size = 0
    for (const character of text) {
        const added = encodeURIComponent(character).length
        if (chunk && size + added > 6000) {
            chunks.push(chunk)
            chunk = ''
            size = 0
        }
        chunk += character
        size += added
    }
    if (chunk) chunks.push(chunk)
    return chunks
}

export class GoogleTranslator {
    private readonly cache = new Map<string, Translation>()
    private readonly pending = new Map<string, { signal: AbortSignal; promise: Promise<Translation> }>()

    constructor(private readonly net: AddonNet) {}

    clear(): void {
        this.cache.clear()
        this.pending.clear()
    }

    private async request(text: string, language: string, signal: AbortSignal): Promise<Translation> {
        signal.throwIfAborted()
        const key = JSON.stringify([language, text])
        const cached = this.cache.get(key)
        if (cached) return cached
        const existing = this.pending.get(key)
        if (existing && !existing.signal.aborted) return existing.promise

        const promise = (async () => {
            await pause(signal)
            const url = new URL('https://translate.googleapis.com/translate_a/single')
            url.search = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: language, dt: 't', q: text }).toString()
            const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
            const response = await this.net.fetch(url, { signal: requestSignal, timeoutMs: 15_000 })
            if (!response.ok) throw new TranslationHttpError(response.status)
            const result = parseResponse(await response.json())
            requestSignal.throwIfAborted()
            this.cache.set(key, result)
            if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!)
            return result
        })()
        this.pending.set(key, { signal, promise })
        try {
            return await promise
        } finally {
            if (this.pending.get(key)?.promise === promise) this.pending.delete(key)
        }
    }

    private async translateGroup(lines: readonly string[], language: string, signal: AbortSignal): Promise<LineTranslation[]> {
        const text = lines.join('\n')
        let result: Translation
        try {
            result = await this.request(text, language, signal)
        } catch (error) {
            if (!(error instanceof TranslationHttpError) || ![400, 413, 414].includes(error.status)) throw error
            if (lines.length === 1) {
                const characters = Array.from(text)
                if (characters.length <= 120) throw error
                const middle = Math.floor(characters.length / 2)
                const left = await this.translateGroup([characters.slice(0, middle).join('')], language, signal)
                const right = await this.translateGroup([characters.slice(middle).join('')], language, signal)
                return [
                    left[0] === null && right[0] === null
                        ? null
                        : `${left[0] ?? characters.slice(0, middle).join('')} ${right[0] ?? characters.slice(middle).join('')}`,
                ]
            }
            return this.splitGroup(lines, language, signal)
        }
        const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
        if (sameLanguage(result.source, language) || (text.length >= 12 && normalize(text) === normalize(result.text))) {
            return lines.map(() => null)
        }
        const translated = result.text.split(/\r?\n/)
        if (lines.length === 1) return [translated.join(' ').trim()]
        if (translated.length !== lines.length || translated.some(line => !line.trim())) {
            return this.splitGroup(lines, language, signal)
        }
        return translated.map(line => line.trim())
    }

    private async splitGroup(lines: readonly string[], language: string, signal: AbortSignal): Promise<LineTranslation[]> {
        const middle = Math.floor(lines.length / 2)
        const left = await this.translateGroup(lines.slice(0, middle), language, signal)
        const right = await this.translateGroup(lines.slice(middle), language, signal)
        return [...left, ...right]
    }

    async translate(texts: readonly string[], language: string, signal: AbortSignal): Promise<LineTranslation[]> {
        const output: LineTranslation[] = texts.map(() => null)
        let group: string[] = []
        let indices: number[] = []
        let size = 0
        const flush = async () => {
            if (!group.length) return
            const translations = await this.translateGroup(group, language, signal)
            indices.forEach((index, position) => {
                output[index] = translations[position]
            })
            group = []
            indices = []
            size = 0
        }
        for (const [index, text] of texts.entries()) {
            signal.throwIfAborted()
            if (!text.trim()) continue
            const encodedSize = encodeURIComponent(text).length
            if (encodedSize > 6000) {
                await flush()
                const chunks = splitLongLine(text)
                const translated: LineTranslation[] = []
                for (const chunk of chunks) translated.push(...(await this.translateGroup([chunk], language, signal)))
                output[index] = translated.every(value => value === null)
                    ? null
                    : translated.map((value, position) => value ?? chunks[position]).join(' ')
            } else {
                if (size + encodedSize + 3 > 6000) await flush()
                group.push(text)
                indices.push(index)
                size += encodedSize + 3
            }
        }
        await flush()
        return output
    }
}
