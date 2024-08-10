import {
  App,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownView
} from 'obsidian'

type SplitDirectionSetting = 'vertical' | 'horizontal' | 'auto'
type PaneTypeSetting = 'source' | 'preview'

interface AutoSplitSettings {
  enabledOn: {
    desktop: boolean
    mobile: boolean
  }
  minSize: number
  direction: SplitDirectionSetting
  editorFirst: boolean
  paneToFocus: PaneTypeSetting
  linkPanes: boolean
}

const DEFAULT_SETTINGS: AutoSplitSettings = {
  enabledOn: {
    desktop: true,
    mobile: true
  },
  minSize: 1000,
  direction: 'auto',
  editorFirst: true,
  paneToFocus: 'source',
  linkPanes: true
}

export default class AutoSplitPlugin extends Plugin {
  settings!: AutoSplitSettings

  protected hasOpenFiles = false
  protected updateHasOpenFiles() {
    try {
      this.hasOpenFiles =
        this.app.workspace.getLeavesOfType('markdown').length > 0
    } catch (e) {
      // it's okay to fail sometimes
    }
  }

  get isEnabledOnPlatform() {
    if (Platform.isDesktop) {
      return this.settings.enabledOn.desktop
    } else if (Platform.isMobile) {
      return this.settings.enabledOn.mobile
    } else {
      return true
    }
  }

  async onload() {
    await this.loadSettings()

    this.app.workspace.onLayoutReady(() => {
      this.updateHasOpenFiles()

      this.registerEvent(
        this.app.workspace.on('file-open', async (file) => {
          const activeLeaf =
            this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf

          if (
            this.isEnabledOnPlatform &&
            activeLeaf &&
            this.app.workspace.getLeavesOfType('markdown').length === 1 &&
            !this.hasOpenFiles &&
            file
          ) {
            const rootSize = getRootContainerSize(this.app)
            let direction = this.settings.direction
            if (direction === 'auto') {
              direction =
                rootSize.width >= rootSize.height ? 'vertical' : 'horizontal'
            }

            if (
              (direction === 'vertical' ? rootSize.width : rootSize.height) >
              this.settings.minSize
            ) {
              const viewState = activeLeaf.getViewState()

              if (viewState.type !== 'markdown') return

              viewState.active = false
              viewState.state.mode =
                viewState.state.mode === 'preview' ? 'source' : 'preview'

              const firstPane = this.settings.editorFirst ? 'source' : 'preview'

              const newLeaf = this.app.workspace.createLeafBySplit(
                activeLeaf,
                direction,
                viewState.state.mode === firstPane
              )
              await newLeaf.openFile(file, viewState)

              if (this.settings.linkPanes) {
                activeLeaf.setGroupMember(newLeaf)
              }

              if (viewState.state.mode === this.settings.paneToFocus) {
                this.app.workspace.setActiveLeaf(newLeaf, { focus: true })
              }
            }
          }

          this.updateHasOpenFiles()
        })
      )
    })

    this.addSettingTab(new AutoSplitSettingTab(this.app, this))
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}

class AutoSplitSettingTab extends PluginSettingTab {
  plugin: AutoSplitPlugin

  constructor(app: App, plugin: AutoSplitPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    let { containerEl } = this

    containerEl.empty()

    containerEl.createEl('h2', { text: 'Settings' })

    const { width: rootWidth, height: rootHeight } = getRootContainerSize(
      this.app
    )

    new Setting(containerEl)
      .setName('Minimum Size')
      .setDesc(
        `Only split if the main area is at least this wide or tall, depending on split direction. The main area was ${rootWidth}x${rootHeight} when you opened this screen. (default: 1000)`
      )
      .addText((text) => {
        text.inputEl.type = 'number'
        text
          .setValue(String(this.plugin.settings.minSize))
          .onChange(async (value) => {
            const valueAsNumber = Number.parseInt(value)
            this.plugin.settings.minSize = Number.isInteger(valueAsNumber)
              ? valueAsNumber
              : this.plugin.settings.minSize
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Split Direction')
      .setDesc(
        'Vertical = left/right, Horizontal = up/down. Auto splits vertically if the main area is wider than it is tall, and horizontally otherwise.'
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            auto: 'Auto',
            vertical: 'Vertical',
            horizontal: 'Horizontal'
          })
          .setValue(this.plugin.settings.direction)
          .onChange(async (value) => {
            this.plugin.settings.direction = value as SplitDirectionSetting
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Editor First')
      .setDesc('Place the pane with the editor on the left/top.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.editorFirst)
          .onChange(async (value) => {
            this.plugin.settings.editorFirst = value
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Focus On')
      .setDesc('Select which pane should be focused.')
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            source: 'Editor',
            preview: 'Preview'
          })
          .setValue(this.plugin.settings.paneToFocus)
          .onChange(async (value) => {
            this.plugin.settings.paneToFocus = value as PaneTypeSetting
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Link Panes')
      .setDesc(
        'Link the panes so their scroll position and open file stay the same.'
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.linkPanes)
          .onChange(async (value) => {
            this.plugin.settings.linkPanes = value
            await this.plugin.saveSettings()
          })
      })

    containerEl.createEl('h2', { text: 'Devices' })

    new Setting(containerEl)
      .setName('Enable on desktop')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enabledOn.desktop)
          .onChange(async (value) => {
            this.plugin.settings.enabledOn.desktop = value
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl).setName('Enable on mobile').addToggle((toggle) => {
      toggle
        .setValue(this.plugin.settings.enabledOn.mobile)
        .onChange(async (value) => {
          this.plugin.settings.enabledOn.mobile = value
          await this.plugin.saveSettings()
        })
    })
  }
}

function getRootContainerSize(app: App) {
  const rootContainer: HTMLElement = app.workspace.rootSplit.doc.documentElement

  if (rootContainer) {
    return {
      width: rootContainer.clientWidth,
      height: rootContainer.clientHeight
    }
  } else {
    console.warn(`[Auto Split] couldn't get root container, using window size`)
    return {
      width: window.innerWidth,
      height: window.innerHeight
    }
  }
}
