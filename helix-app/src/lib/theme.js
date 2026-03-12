import { supabase } from './supabase'

export async function loadTheme() {
  try {
    const { data: theme, error } = await supabase
      .from('theme_config')
      .select('*')
      .eq('is_active', true)
      .single()

    if (error || !theme) return // keep default CSS variables

    const root = document.documentElement
    root.style.setProperty('--color-primary',    theme.colour_primary)
    root.style.setProperty('--color-secondary',  theme.colour_secondary)
    root.style.setProperty('--color-accent',     theme.colour_accent)
    root.style.setProperty('--color-background', theme.colour_background)
    root.style.setProperty('--color-text',       theme.colour_text)
    root.style.setProperty('--color-surface',    theme.colour_surface)

    if (theme.font_display) {
      root.style.setProperty('--font-display', `'${theme.font_display}', sans-serif`)
      root.style.setProperty('--font-body',    `'${theme.font_body || theme.font_display}', sans-serif`)

      // Load Google Font dynamically
      const link = document.createElement('link')
      link.rel  = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${theme.font_display.replace(/ /g, '+')}:wght@400;600;700&display=swap`
      document.head.appendChild(link)
    }

    if (theme.background_pattern_url) {
      root.style.setProperty('--texture-url', `url(${theme.background_pattern_url})`)
    }
  } catch (e) {
    console.warn('Theme load failed, using defaults:', e)
  }
}