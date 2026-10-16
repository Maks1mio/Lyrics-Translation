import './styles.css'

import { defineAddon } from '@pulsesync/addon-sdk'

import addonConfig from '../addon.config.mjs'
import { LyricsTranslation } from './lyrics/engine'
import { languageCode, LANGUAGE_SETTING_ID } from './languages'
import { settings } from './settings'

export default defineAddon({
    id: addonConfig.id,
    name: addonConfig.name,
    settings,
    start(api) {
        api.signal.throwIfAborted()
        const engine = new LyricsTranslation(api, languageCode(settings.store[LANGUAGE_SETTING_ID]))
        const unsubscribeSettings = api.settings.onChange(() => {
            engine.setLanguage(languageCode(settings.store[LANGUAGE_SETTING_ID]))
        })
        const unsubscribeTrack = api.player.onTrackChange(() => engine.reset())
        let stopped = false
        const stop = () => {
            if (stopped) return
            stopped = true
            unsubscribeSettings()
            unsubscribeTrack()
            engine.stop()
        }
        api.signal.addEventListener('abort', stop, { once: true })
        try {
            engine.start()
        } catch (error) {
            api.signal.removeEventListener('abort', stop)
            stop()
            throw error
        }
        return () => {
            api.signal.removeEventListener('abort', stop)
            stop()
        }
    },
})
