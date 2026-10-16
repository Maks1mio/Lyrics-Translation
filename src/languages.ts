export const LANGUAGE_SETTING_ID = 'sel_1775564810304_fvgt9'

export const languages = [
    ['ru', 'Русский'],
    ['en', 'English'],
    ['uk', 'Украинский'],
    ['be', 'Белорусский'],
    ['kk', 'Казахский'],
    ['uz', 'Узбекский'],
    ['de', 'Deutsch'],
    ['fr', 'Français'],
    ['es', 'Español'],
    ['it', 'Italiano'],
    ['pt', 'Português'],
    ['pl', 'Polski'],
    ['tr', 'Türkçe'],
    ['cs', 'Čeština'],
    ['ro', 'Română'],
    ['hu', 'Magyar'],
    ['nl', 'Nederlands'],
    ['sv', 'Svenska'],
    ['el', 'Ελληνικά'],
    ['ar', 'العربية'],
    ['hi', 'हिन्दी'],
    ['ja', '日本語'],
    ['ko', '한국어'],
    ['zh-CN', '简体中文'],
    ['zh-TW', '繁體中文'],
    ['vi', 'Tiếng Việt'],
    ['id', 'Bahasa Indonesia'],
    ['th', 'ไทย'],
] as const

export function languageCode(selection: number): string {
    return languages[selection - 1]?.[0] ?? 'ru'
}
