/**
 * Settings field definitions for each app type
 * Used to dynamically generate settings forms
 */

// Common instance fields shared by all apps
const commonInstanceFields = [
  { name: 'name', label: 'Instance Name', type: 'text', default: 'Default' },
  { name: 'api_url', label: 'API URL', type: 'text', placeholder: 'http://localhost:8989' },
  { name: 'api_key', label: 'API Key', type: 'password', placeholder: 'Enter API key' },
  { name: 'enabled', label: 'Enabled', type: 'checkbox', default: true }
]

// State management fields (shared by all apps)
const stateManagementFields = [
  {
    name: 'state_management_mode',
    label: 'State Management',
    type: 'select',
    default: 'custom',
    options: [
      { value: 'custom', label: 'Enabled' },
      { value: 'disabled', label: 'Disabled' }
    ],
    help: 'Track processed items to prevent reprocessing'
  },
  {
    name: 'state_management_hours',
    label: 'Reset Interval (Hours)',
    type: 'number',
    default: 168,
    min: 1,
    max: 8760,
    showWhen: { field: 'state_management_mode', value: 'custom' },
    help: 'Hours before items can be reprocessed (168 = 7 days)'
  }
]

// App-specific instance field definitions
const appInstanceFields = {
  sonarr: [
    { name: 'hunt_missing_items', label: 'Missing Search', type: 'number', default: 1, min: 0, help: 'Episodes to search per cycle (0 to disable)' },
    { name: 'hunt_upgrade_items', label: 'Upgrade Search', type: 'number', default: 0, min: 0, help: 'Episodes to upgrade per cycle (0 to disable)' },
    {
      name: 'hunt_missing_mode',
      label: 'Missing Search Mode',
      type: 'select',
      default: 'seasons_packs',
      options: [
        { value: 'seasons_packs', label: 'Season Packs' },
        { value: 'shows', label: 'Shows' },
        { value: 'episodes', label: 'Episodes' }
      ],
      help: 'Season Packs recommended'
    },
    {
      name: 'upgrade_mode',
      label: 'Upgrade Search Mode',
      type: 'select',
      default: 'seasons_packs',
      options: [
        { value: 'seasons_packs', label: 'Season Packs' },
        { value: 'shows', label: 'Shows' },
        { value: 'episodes', label: 'Episodes' }
      ],
      help: 'Season Packs recommended'
    },
    {
      name: 'air_date_delay_days',
      label: 'Air Date Search Delay (Days)',
      type: 'number',
      default: 0,
      min: 0,
      max: 30,
      showWhen: { field: ['hunt_missing_mode', 'upgrade_mode'], value: 'episodes' },
      help: 'Days to wait after air date before searching (only for Episodes mode)'
    },
    ...stateManagementFields
  ],
  radarr: [
    { name: 'hunt_missing_movies', label: 'Missing Search', type: 'number', default: 1, min: 0, help: 'Movies to search per cycle (0 to disable)' },
    { name: 'hunt_upgrade_movies', label: 'Upgrade Search', type: 'number', default: 0, min: 0, help: 'Movies to upgrade per cycle (0 to disable)' },
    { name: 'release_date_delay_days', label: 'Release Date Delay', type: 'number', default: 0, min: 0, help: 'Days after release before searching' },
    ...stateManagementFields
  ],
  lidarr: [
    { name: 'hunt_missing_items', label: 'Missing Search', type: 'number', default: 1, min: 0, help: 'Albums to search per cycle (0 to disable)' },
    { name: 'hunt_upgrade_items', label: 'Upgrade Search', type: 'number', default: 0, min: 0, help: 'Albums to upgrade per cycle (0 to disable)' },
    ...stateManagementFields
  ],
  readarr: [
    { name: 'hunt_missing_books', label: 'Missing Search', type: 'number', default: 1, min: 0, help: 'Books to search per cycle (0 to disable)' },
    { name: 'hunt_upgrade_books', label: 'Upgrade Search', type: 'number', default: 0, min: 0, help: 'Books to upgrade per cycle (0 to disable)' },
    ...stateManagementFields
  ],
  whisparr: [
    { name: 'hunt_missing_items', label: 'Missing Search', type: 'number', default: 1, min: 0, help: 'Items to search per cycle (0 to disable)' },
    { name: 'hunt_upgrade_items', label: 'Upgrade Search', type: 'number', default: 0, min: 0, help: 'Items to upgrade per cycle (0 to disable)' },
    ...stateManagementFields
  ],
  eros: [
    { name: 'hunt_missing_items', label: 'Missing Search', type: 'number', default: 1, min: 0, help: 'Items to search per cycle (0 to disable)' },
    { name: 'hunt_upgrade_items', label: 'Upgrade Search', type: 'number', default: 0, min: 0, help: 'Items to upgrade per cycle (0 to disable)' },
    ...stateManagementFields
  ]
}

// Base global settings (sleep_duration, hourly_cap, monitored_only)
const baseGlobalFields = [
  {
    name: 'sleep_duration',
    label: 'Sleep Duration (Minutes)',
    type: 'number',
    default: 900,
    min: 10,
    transform: { toDisplay: v => Math.round(v / 60), fromDisplay: v => v * 60 },
    help: 'Time between search cycles'
  },
  {
    name: 'hourly_cap',
    label: 'API Cap - Hourly',
    type: 'number',
    default: 20,
    min: 1,
    max: 400,
    help: 'Maximum API requests per hour (20 is safe)'
  },
  { name: 'monitored_only', label: 'Monitored Only', type: 'checkbox', default: true, help: 'Only search monitored items' }
]

// App-specific global settings
const appGlobalFields = {
  sonarr: [
    ...baseGlobalFields,
    { name: 'skip_future_episodes', label: 'Skip Future Episodes', type: 'checkbox', default: true, help: 'Skip episodes not yet aired' },
    { name: 'season_pack_priority', label: 'Season Pack Priority', type: 'checkbox', default: false, help: 'Prefer season packs over individual episodes' }
  ],
  radarr: [
    ...baseGlobalFields,
    { name: 'skip_future_releases', label: 'Skip Future Releases', type: 'checkbox', default: true, help: 'Skip movies not yet released' },
    {
      name: 'process_no_release_dates',
      label: 'Process No Release Dates',
      type: 'checkbox',
      default: false,
      showWhen: { field: 'skip_future_releases', value: true },
      help: 'Include movies without release dates when skipping future releases'
    }
  ],
  lidarr: [
    {
      name: 'hunt_missing_mode',
      label: 'Missing Search Mode',
      type: 'select',
      default: 'album',
      options: [{ value: 'album', label: 'Album' }],
      help: 'Search for individual albums'
    },
    ...baseGlobalFields,
    { name: 'skip_future_releases', label: 'Skip Future Releases', type: 'checkbox', default: true, help: 'Skip albums not yet released' }
  ],
  readarr: [
    ...baseGlobalFields,
    { name: 'skip_future_releases', label: 'Skip Future Releases', type: 'checkbox', default: true, help: 'Skip books not yet released' }
  ],
  whisparr: [
    ...baseGlobalFields,
    { name: 'skip_future_releases', label: 'Skip Future Releases', type: 'checkbox', default: true, help: 'Skip items not yet released' }
  ],
  eros: [
    {
      name: 'search_mode',
      label: 'Search Mode',
      type: 'select',
      default: 'movie',
      options: [
        { value: 'movie', label: 'Movie' },
        { value: 'scene', label: 'Scene' }
      ],
      help: 'How to search for content'
    },
    ...baseGlobalFields,
    { name: 'skip_future_releases', label: 'Skip Future Releases', type: 'checkbox', default: true, help: 'Skip items not yet released' }
  ]
}

// Base custom tags settings (shared by all apps)
const baseCustomTagsFields = [
  { name: 'tag_processed_items', label: 'Tag Processed Items', type: 'checkbox', default: true, help: 'Enable custom tagging for processed items' },
  {
    name: 'custom_tag_missing',
    label: 'Missing Items Tag',
    type: 'text',
    default: 'huntarr-missing',
    maxLength: 25,
    showWhen: { field: 'tag_processed_items', value: true },
    help: 'Custom tag for missing items (max 25 characters)'
  },
  {
    name: 'custom_tag_upgrade',
    label: 'Upgrade Items Tag',
    type: 'text',
    default: 'huntarr-upgrade',
    maxLength: 25,
    showWhen: { field: 'tag_processed_items', value: true },
    help: 'Custom tag for upgraded items (max 25 characters)'
  }
]

// Sonarr has additional shows_missing tag
const sonarrCustomTagsFields = [
  ...baseCustomTagsFields,
  {
    name: 'custom_tag_shows_missing',
    label: 'Shows Missing Tag',
    type: 'text',
    default: 'huntarr-shows-missing',
    maxLength: 25,
    showWhen: { field: 'tag_processed_items', value: true },
    help: 'Custom tag for missing items in shows mode (max 25 characters)'
  }
]

// Advanced settings (shown in collapsible section) - currently empty, keeping for future use
const advancedFields = []

/**
 * Get all instance fields for an app
 */
export function getInstanceFields(appName) {
  return [
    ...commonInstanceFields,
    ...(appInstanceFields[appName] || [])
  ]
}

/**
 * Get all global fields for an app
 */
export function getGlobalFields(appName) {
  return appGlobalFields[appName] || baseGlobalFields
}

/**
 * Get custom tags fields for an app
 */
export function getCustomTagsFields(appName) {
  if (appName === 'sonarr') {
    return sonarrCustomTagsFields
  }
  return baseCustomTagsFields
}

/**
 * Get advanced fields
 */
export function getAdvancedFields() {
  return advancedFields
}

/**
 * Get default values for a new instance
 */
export function getInstanceDefaults(appName) {
  const fields = getInstanceFields(appName)
  return fields.reduce((acc, field) => {
    if (field.default !== undefined) {
      acc[field.name] = field.default
    }
    return acc
  }, {})
}

/**
 * Get default values for global settings
 */
export function getGlobalDefaults(appName) {
  const fields = getGlobalFields(appName)
  return fields.reduce((acc, field) => {
    if (field.default !== undefined) {
      acc[field.name] = field.default
    }
    return acc
  }, {})
}

export default {
  getInstanceFields,
  getGlobalFields,
  getAdvancedFields,
  getInstanceDefaults,
  getGlobalDefaults
}
