import { promises as fs } from 'node:fs'
import path from 'node:path'

const settingId = 'sel_1775564810304_fvgt9'

export async function migrateLegacySettings(targetDir, stagingDir) {
    const valuesPath = path.join(stagingDir, 'pulsesync.settings.json')
    let values = {}
    try {
        values = JSON.parse(await fs.readFile(valuesPath, 'utf8'))
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid addon settings file')
    } catch (error) {
        if (error.code !== 'ENOENT') throw error
    }
    let selected = values[settingId]
    if (selected === undefined) {
        try {
            const legacy = JSON.parse(await fs.readFile(path.join(targetDir, 'handleEvents.json'), 'utf8'))
            const item = legacy.sections?.flatMap(section => section.items ?? []).find(item => item.id === settingId)
            selected = item?.value ?? item?.selected ?? item?.defaultParameter
        } catch (error) {
            if (error.code !== 'ENOENT') throw error
        }
    }
    const numeric = typeof selected === 'number' ? selected : typeof selected === 'string' && /^\d+$/.test(selected) ? Number(selected) : undefined
    if (numeric === undefined || !Number.isInteger(numeric) || numeric < 1 || numeric > 28) return
    if (Object.is(values[settingId], numeric)) return
    await fs.writeFile(valuesPath, `${JSON.stringify({ ...values, [settingId]: numeric }, null, 4)}\n`)
}
