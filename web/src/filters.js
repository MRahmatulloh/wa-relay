export const FOLDERS = ['all', 'lgw', 'lhr', 'ltn', 'stn', 'others']

export const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'starred', label: 'Starred' },
  { id: 'thumbsUp', label: 'Thumbs up' },
  { id: 'done', label: 'Done' },
  { id: 'parseBug', label: 'Parse bugs' },
]

/** Message age window — default 2h. */
export const TIME_RANGES = [
  { id: '1h', label: '1 hour' },
  { id: '2h', label: '2 hours' },
  { id: '3h', label: '3 hours' },
  { id: '4h', label: '4 hours' },
  { id: '5h', label: '5 hours' },
  { id: '6h', label: '6 hours' },
  { id: '12h', label: '12 hours' },
  { id: 'today', label: 'Today' },
]

export const DEFAULT_TIME_RANGE = '2h'
