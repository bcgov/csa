const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
}

const toYMD = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', { ...DATE_FORMAT, timeZone }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export const formatDateYMD = (dateString: string): string => {
  const date = new Date(`${dateString}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return dateString
  return toYMD(date, 'UTC')
}

export const formatDateTimeYMD = (dateString: string): string => {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString
  return toYMD(date, 'America/Vancouver')
}

export const formatDateTimeYMDHMS = (dateString: string): string => {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString

  const parts = new Intl.DateTimeFormat('en-US', {
    ...DATE_FORMAT,
    timeZone: 'America/Vancouver',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

// Parse formatted date string (YYYY-MMM-DD or YYYY-MMM-DD HH:MM:SS) back to Date for sorting.
export const parseFormattedDate = (dateStr: string): Date | null => {
  if (!dateStr) return null

  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  }

  const match = dateStr.match(/^(\d{4})-(\w{3})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/)
  if (!match) return null

  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match
  const monthNum = months[month]
  if (monthNum === undefined) return null

  return new Date(
    parseInt(year),
    monthNum,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second),
  )
}
