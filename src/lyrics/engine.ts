import type { AddonApi } from '@pulsesync/addon-sdk'

import { GoogleTranslator } from '../translation/googleTranslate'
import { LyricsDom } from './dom'

export class LyricsTranslation {
    private readonly translator: GoogleTranslator
    private readonly dom: LyricsDom
    private batch?: AbortController
    private timer?: ReturnType<typeof setTimeout>
    private signature = ''
    private translations?: (string | null)[]
    private active = false

    constructor(
        private readonly api: AddonApi,
        private language: string,
    ) {
        this.translator = new GoogleTranslator(api.net)
        this.dom = new LyricsDom(() => this.schedule())
    }

    start(): void {
        this.active = true
        this.dom.start()
        this.schedule()
    }

    setLanguage(language: string): void {
        if (language === this.language) return
        this.language = language
        this.reset()
    }

    reset(): void {
        this.batch?.abort()
        this.signature = ''
        this.translations = undefined
        this.dom.clearAll()
        this.schedule()
    }

    private schedule(): void {
        if (!this.active) return
        clearTimeout(this.timer)
        this.timer = setTimeout(() => {
            this.timer = undefined
            void this.process()
        }, 200)
    }

    private async process(): Promise<void> {
        if (!this.active || this.api.signal.aborted) return
        const lines = this.dom.read()
        const signature = JSON.stringify(lines.map(line => line.text))
        if (signature === this.signature) {
            lines.forEach((line, index) => {
                if (!this.dom.hasState(line)) this.dom.show(line, this.translations?.[index] ?? null, !this.translations)
            })
            return
        }
        this.batch?.abort()
        const batch = new AbortController()
        this.batch = batch
        this.signature = signature
        this.translations = undefined
        for (const line of lines) this.dom.show(line, '', true)
        if (!lines.some(line => line.text)) return
        try {
            const translations = await this.translator.translate(
                lines.map(line => line.text),
                this.language,
                batch.signal,
            )
            if (!this.active || batch.signal.aborted || this.api.signal.aborted) return
            this.render(signature, translations)
        } catch (error) {
            if (!this.active || batch.signal.aborted || this.api.signal.aborted) return
            this.api.logger.warn('Не удалось перевести лирику', error)
            this.render(
                signature,
                lines.map(() => '—'),
            )
        }
    }

    private render(signature: string, translations: (string | null)[]): void {
        this.translations = translations
        const current = this.dom.read()
        if (JSON.stringify(current.map(line => line.text)) !== signature) {
            this.schedule()
            return
        }
        current.forEach((line, index) => this.dom.show(line, translations[index]))
    }

    stop(): void {
        if (!this.active) return
        this.active = false
        clearTimeout(this.timer)
        this.batch?.abort()
        this.signature = ''
        this.translations = undefined
        this.dom.stop()
        this.translator.clear()
    }
}
