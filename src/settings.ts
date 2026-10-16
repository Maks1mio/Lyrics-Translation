import { defineAddonSettings, SettingType } from '@pulsesync/addon-sdk'

import { languages, LANGUAGE_SETTING_ID } from './languages.ts'

export const settings = defineAddonSettings(
    {
        [LANGUAGE_SETTING_ID]: {
            type: SettingType.SELECT,
            name: 'Язык перевода',
            description: 'На какой язык переводить синхронную лирику.',
            default: 1,
            options: languages.map(([, label], index) => ({ value: index + 1, label })),
        },
    },
    { title: 'Лирика' },
)
